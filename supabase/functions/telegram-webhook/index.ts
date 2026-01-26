import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Use environment variable with fallback for admin chat ID
const ADMIN_CHAT_ID = ADMIN_TELEGRAM_CHAT_ID || "8496943061";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    reply_to_message?: {
      text?: string;
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

async function sendBroadcastEmail(email: string, username: string | null, broadcastMessage: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("No RESEND_API_KEY configured, skipping email");
    return false;
  }

  const senders = [
    "Yunchi <noreply@yunchicheck.com>",
    "Yunchi <onboarding@resend.dev>"
  ];

  for (const sender of senders) {
    // Retry up to 2 times per sender for transient failures
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Sending broadcast email to ${email} from ${sender} (attempt ${attempt})`);
        
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
            subject: "📢 Announcement from Yunchi",
            text: `Hello${username ? ` ${username}` : ''},\n\n${broadcastMessage}\n\n— Yunchi Team\n\nIf you no longer wish to receive these announcements, you can update your notification preferences in your account settings.`,
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
            headers: {
              "X-Entity-Ref-ID": crypto.randomUUID(),
            },
            tags: [
              { name: "category", value: "announcement" },
              { name: "type", value: "broadcast" },
            ],
          }),
        });
        
        const responseText = await response.text();
        
        if (!response.ok) {
          console.error(`Failed to send broadcast email to ${email} from ${sender} (attempt ${attempt}): ${response.status} - ${responseText}`);
          
          // If domain not verified (403), try fallback sender immediately
          if (response.status === 403 && sender.includes("yunchicheck.com")) {
            console.log(`Domain not verified, trying fallback sender...`);
            break; // Break inner loop to try next sender
          }
          
          // Check if it's a rate limit error (429) - wait longer and retry
          if (response.status === 429 && attempt < 2) {
            console.log(`Rate limited, waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            continue;
          }
          
          // For other transient errors, retry
          if (response.status >= 500 && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          
          // Non-retryable error, try next sender
          break;
        }
        
        console.log(`Broadcast email sent successfully to ${email} from ${sender}`);
        return true;
      } catch (error) {
        console.error(`Error sending broadcast email to ${email} from ${sender} (attempt ${attempt}):`, error);
        
        // Retry on network errors
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        // Try next sender
        break;
      }
    }
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════

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
  replyMarkup?: object
): Promise<number | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

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

async function setBotCommands(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  const publicCommands = [
    { command: "start", description: "Start bot & get Chat ID" },
    { command: "menu", description: "Full navigation menu" },
    { command: "help", description: "View help & features" },
    { command: "mystatus", description: "Check account status" },
  ];

  const adminCommands = [
    { command: "start", description: "Start bot" },
    { command: "menu", description: "Full navigation" },
    { command: "help", description: "View help" },
    { command: "mystatus", description: "Check status" },
    { command: "admincmd", description: "Admin panel" },
    { command: "ticket", description: "Manage ticket" },
    { command: "topups", description: "Pending topups" },
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
    { command: "bincard", description: "Export cards by BIN" },
    { command: "viewblocked", description: "View blocked devices/IPs" },
    { command: "unblockdevice", description: "Unblock device/IP" },
    { command: "blockdevice", description: "Block device/IP manually" },
    { command: "userdevices", description: "View user's devices" },
    { command: "healthsites", description: "Health check gateway sites" },
    { command: "gate", description: "Set gateway availability" },
  ];

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: publicCommands }),
    });

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: adminCommands,
        scope: { type: "chat", chat_id: parseInt(ADMIN_CHAT_ID) },
      }),
    });
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
  // Super admin always has access
  if (chatId === ADMIN_CHAT_ID) return true;

  // Check if this telegram chat ID belongs to a user with admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (!profile) return false;

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .eq("role", "admin")
    .maybeSingle();

  return !!role;
}

// Check if user is moderator (has moderator role via telegram_chat_id)
async function isModeratorAsync(chatId: string, supabase: any): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (!profile) return false;

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .eq("role", "moderator")
    .maybeSingle();

  return !!role;
}

// Check if user is staff (admin OR moderator)
async function isStaffAsync(chatId: string, supabase: any): Promise<boolean> {
  // Super admin always has access
  if (chatId === ADMIN_CHAT_ID) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (!profile) return false;

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .in("role", ["admin", "moderator"])
    .maybeSingle();

  return !!role;
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

  await setBotCommands();

  // Moderator menu (limited)
  if (isModUser && !isAdminUser) {
    const modMenu = `
🛡️ <b>Moderator Panel</b>

<b>📋 Tickets</b>
/ticket <code>[id]</code> - View & reply to tickets

<b>📊 Data</b>
/stats - View statistics
/allusers - List all users
/userinfo <code>[user]</code> - User details
/viewbans - View banned users

<i>⚠️ Limited permissions - Contact admin for elevated actions</i>
`;
    const modKeyboard = { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]] };
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

<b>📊 Data</b>
/stats - View statistics
/allusers - List all users
/userinfo <code>[user]</code> - User details

<b>📢 Communication</b>
/broadcast <code>[message]</code> - Send to all users

<b>🌐 Gateways</b>
/gate - Set gateway availability
/healthsites - Health check sites

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

You have been promoted to moderator.
Use /admincmd to view available commands.

<b>Moderator Permissions:</b>
• View & reply to tickets
• View user info & statistics
• View banned users
`);

  await sendTelegramMessage(chatId, `
✅ <b>Promoted to Moderator</b>

<b>User:</b> ${profile.username || "Unknown"}
<b>Telegram:</b> @${profile.telegram_username || targetChatId}
<b>Chat ID:</b> <code>${targetChatId}</code>

User can now use moderator commands.
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
  const hasAccess = await isAdminAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
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
  const hasAccess = await isAdminAsync(chatId, supabase);
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
  const hasAccess = await isAdminAsync(chatId, supabase);
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
    await sendTelegramMessage(chatId, "❌ <b>Usage:</b> /broadcast <code>[message]</code>");
    return;
  }

  const { data: profiles } = await supabase.from("profiles").select("user_id, telegram_chat_id, username");
  if (!profiles?.length) {
    await sendTelegramMessage(chatId, "ℹ️ No users to broadcast to");
    return;
  }

  // Get user emails from auth.users
  const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userEmailMap: Record<string, string> = {};
  if (authUsers?.users) {
    for (const user of authUsers.users) {
      if (user.email) {
        userEmailMap[user.id] = user.email;
      }
    }
  }

  // Get email preferences for all users
  const { data: emailPreferences } = await supabase
    .from("notification_preferences")
    .select("user_id, email_announcements");
  
  const emailOptOutMap: Record<string, boolean> = {};
  if (emailPreferences) {
    for (const pref of emailPreferences) {
      emailOptOutMap[pref.user_id] = pref.email_announcements === false;
    }
  }

  let telegramSent = 0, webSent = 0, emailSent = 0, emailSkipped = 0;
  const usersWithEmail = profiles.filter((p: any) => userEmailMap[p.user_id]);
  const totalWithEmail = usersWithEmail.length;

  await sendTelegramMessage(chatId, `📡 Broadcasting to ${profiles.length} users...`);

  for (const p of profiles) {
    // Send Telegram notification
    if (p.telegram_chat_id) {
      const sent = await sendTelegramMessage(p.telegram_chat_id, `📢 <b>Announcement</b>\n\n${message}`);
      if (sent) telegramSent++;
    }

    // Send web notification
    await supabase.from("notifications").insert({
      user_id: p.user_id,
      type: "announcement",
      title: "Announcement",
      message: message
    });
    webSent++;

    // Send email notification (only if user hasn't opted out)
    // Add delay to avoid Resend rate limiting (2 requests/second max)
    const userEmail = userEmailMap[p.user_id];
    if (userEmail) {
      // Check if user has opted out of email announcements
      if (emailOptOutMap[p.user_id]) {
        emailSkipped++;
        console.log(`Skipping email for ${p.user_id} - opted out`);
      } else {
        // Wait 600ms between emails to stay under rate limit
        await new Promise(resolve => setTimeout(resolve, 600));
        const emailSuccess = await sendBroadcastEmail(userEmail, p.username, message);
        if (emailSuccess) emailSent++;
      }
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

  const { data: stats } = await supabase.from("site_stats").select("*").eq("id", "global").maybeSingle();
  const { data: tickets } = await supabase.from("support_tickets").select("status");
  const { data: banned } = await supabase.from("profiles").select("id").eq("is_banned", true);
  const { data: telegram } = await supabase.from("profiles").select("id").not("telegram_chat_id", "is", null);

  const ticketStats = {
    open: tickets?.filter((t: any) => t.status === "open").length || 0,
    processing: tickets?.filter((t: any) => t.status === "processing").length || 0,
    solved: tickets?.filter((t: any) => t.status === "solved").length || 0,
    closed: tickets?.filter((t: any) => t.status === "closed").length || 0,
  };

  const statsMessage = `
📊 <b>Statistics</b>

<b>Users</b>
• Total: ${stats?.total_users || 0}
• Telegram: ${telegram?.length || 0}
• Banned: ${banned?.length || 0}

<b>Activity</b>
• Card Checks: ${stats?.total_checks || 0}

<b>Tickets</b>
• Open: ${ticketStats.open}
• Processing: ${ticketStats.processing}
• Solved: ${ticketStats.solved}
• Closed: ${ticketStats.closed}
`;

  const statsKeyboard = { inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]] };
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

  // Build device list (limit to 10)
  const displayDevices = deviceLogs.slice(0, 10);
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
🔐 <code>${device.fingerprint.slice(0, 12)}...</code>${fpBlocked}
🌐 ${device.ip_address || "Unknown"}${ipBlocked}
💻 ${browser} on ${os}
🕐 Last: ${lastSeen}`;
  }

  const message = `
📱 <b>User Devices</b>

👤 <b>User:</b> ${profile.username || "Unknown"}
📧 <b>Email:</b> ${userEmail || "Unknown"}
🆔 <b>User ID:</b> <code>${profile.user_id.slice(0, 8)}...</code>

📊 <b>Total Devices:</b> ${deviceLogs.length}
🚫 <b>Blocked:</b> ${blockedFpSet.size} fingerprints, ${blockedIpSet.size} IPs
${deviceList}${deviceLogs.length > 10 ? `\n\n<i>...and ${deviceLogs.length - 10} more devices</i>` : ""}

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
• Chat ID: <code>${escapeHtml(profile.telegram_chat_id) || "Not connected"}</code>
• Username: ${profile.telegram_username ? `@${escapeHtml(profile.telegram_username)}` : "Not set"}

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
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        await handleRejectAllTopups(callbackChatId, supabase, messageId);
        await answerCallbackQuery(update.callback_query.id, "🗑️ All rejected");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup approve
      if (callbackData.startsWith("topup_accept_")) {
        if (!callbackChatId || !isCallbackAdmin) {
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

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject - show reason selection menu
      if (callbackData.startsWith("topup_reject_") && !callbackData.includes("_reason_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const transactionId = callbackData.replace("topup_reject_", "");

        // Show rejection reason options
        const reasonKeyboard = {
          inline_keyboard: [
            [{ text: "❌ Invalid payment proof", callback_data: `topup_reject_reason_invalid_${transactionId}` }],
            [{ text: "💰 Amount mismatch", callback_data: `topup_reject_reason_amount_${transactionId}` }],
            [{ text: "⏱️ Payment not received", callback_data: `topup_reject_reason_notreceived_${transactionId}` }],
            [{ text: "🔄 Duplicate submission", callback_data: `topup_reject_reason_duplicate_${transactionId}` }],
            [{ text: "📝 Other reason", callback_data: `topup_reject_reason_other_${transactionId}` }],
            [{ text: "◀️ Cancel", callback_data: `topup_reject_cancel_${transactionId}` }],
          ],
        };

        // Fetch transaction details for the updated caption
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

        const { data: authData } = await supabase.auth.admin.listUsers();
        const userAuth = authData?.users?.find((u: any) => u.id === transaction.user_id);
        const userEmail = userAuth?.email || "Unknown";

        const credits = Number(transaction.amount);
        const username = profile?.username || "Unknown";
        const paymentMethod = transaction.payment_method?.toUpperCase() || "Unknown";

        const selectReasonCaption = `
⚠️ <b>SELECT REJECTION REASON</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transactionId}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> ${credits} credits
<b>💳 Method:</b> ${paymentMethod}

━━━━━━━━━━━━━━━━━━━━━━

<i>Choose a reason for rejection below:</i>
`;

        if (messageId && callbackChatId) {
          await editMessageCaption(callbackChatId, messageId, selectReasonCaption, reasonKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "Select rejection reason");

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject cancel - restore original buttons
      if (callbackData.startsWith("topup_reject_cancel_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const transactionId = callbackData.replace("topup_reject_cancel_", "");

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

        const { data: authData } = await supabase.auth.admin.listUsers();
        const userAuth = authData?.users?.find((u: any) => u.id === transaction.user_id);
        const userEmail = userAuth?.email || "Unknown";

        const credits = Number(transaction.amount);
        const username = profile?.username || "Unknown";
        const paymentMethod = transaction.payment_method?.toUpperCase() || "Unknown";

        // Restore original caption with accept/reject buttons
        const originalCaption = `
💰 <b>New Top-Up Payment Proof</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transactionId}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> ${credits} credits
<b>💳 Method:</b> ${paymentMethod}

━━━━━━━━━━━━━━━━━━━━━━

<i>Click a button below to approve or reject this payment.</i>
`;

        const originalKeyboard = {
          inline_keyboard: [
            [
              { text: "✅ Accept", callback_data: `topup_accept_${transactionId}` },
              { text: "❌ Reject", callback_data: `topup_reject_${transactionId}` },
            ],
          ],
        };

        if (messageId && callbackChatId) {
          await editMessageCaption(callbackChatId, messageId, originalCaption, originalKeyboard);
        }
        await answerCallbackQuery(update.callback_query.id, "Cancelled");

        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Topup reject with reason - process the rejection
      if (callbackData.startsWith("topup_reject_reason_")) {
        if (!callbackChatId || !isCallbackAdmin) {
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
          other: "Rejected by admin",
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

        // Update transaction with rejection reason
        await supabase.from("topup_transactions").update({ 
          status: "failed", 
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

        // Update the payment proof message - remove buttons and show rejected status
        if (messageId && callbackChatId) {
          const rejectedCaption = `
❌ <b>REJECTED</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transactionId}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> ${credits} credits
<b>💳 Method:</b> ${paymentMethod}

━━━━━━━━━━━━━━━━━━━━━━

<b>❌ Status:</b> Rejected
<b>📋 Reason:</b> ${rejectionReason}
<b>📅 Processed:</b> ${timestamp}
`;
          await editMessageCaption(callbackChatId, messageId, rejectedCaption, null);
        }

        // Notify user with rejection reason
        if (profile?.telegram_chat_id) {
          await sendTelegramMessage(profile.telegram_chat_id, `❌ <b>Topup Rejected</b>\n\n<b>Reason:</b> ${rejectionReason}\n\nPlease submit a new request with valid payment proof.`);
        }
        await answerCallbackQuery(update.callback_query.id, "❌ Rejected");

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
      // USER START PAGE CALLBACKS
      // ─────────────────────────────────────────────────────────
      
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

      if (callbackData === "menu_stats") {
        const hasAccess = await isStaffAsync(callbackChatId!, supabase);
        if (!hasAccess) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await handleStats(callbackChatId!, supabase);
        await answerCallbackQuery(update.callback_query.id, "📊 Stats loaded");
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
                { text: "📊 Stats", callback_data: "menu_stats" },
                { text: "👥 Users", callback_data: "menu_allusers" }
              ],
              [
                { text: "🚫 Bans", callback_data: "menu_viewbans" }
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

    if (update.message?.text && update.message.reply_to_message) {
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

    const text = update.message?.text || "";
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

<b>📢 Communication</b>
┌─────────────────────
│ /broadcast [msg]
│ /stats - Statistics
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
      const isAdminUser = isAdmin(chatId);
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
/mystatus - Account status`;

      if (isAdminUser) {
        msg += `

<b>Admin:</b>
/admincmd - Admin panel
/ticket [id] - Manage ticket
/topups - Pending topups
/addfund [email] [amount]
/banuser [user]
/unbanuser [user]
/deleteuser [user]
/viewbans - Banned users
/broadcast [msg]
/stats - Statistics
/allusers - List users
/userinfo [user]`;
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
    // CARD EXPORT COMMANDS (Admin Only)
    // ─────────────────────────────────────────────────────────

    // /allcards - Export all checked cards
    if (text === "/allcards") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sendTelegramMessage(chatId, "⏳ <b>Fetching all cards...</b>\n\nPlease wait while I prepare the file.");

      // Fetch ALL cards with user info (no limit)
      const { data: cards, error } = await supabase
        .from("card_checks")
        .select("card_details, result, gateway, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(100000);

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

      const liveCount = cards.filter((c: any) => c.result === "live").length;
      const deadCount = cards.filter((c: any) => c.result === "dead").length;
      const unknownCount = cards.filter((c: any) => c.result !== "live" && c.result !== "dead").length;

      // Format: card_details | user
      const fileContent = cards.map((c: any) => {
        const user = userMap.get(c.user_id) || c.user_id || "Unknown";
        return `${c.card_details || "Unknown"} | ${user}`;
      }).join("\n");
      const filename = `all_cards_${new Date().toISOString().split("T")[0]}.txt`;

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📁 <b>All Cards Export</b>\n\n✅ Live: ${liveCount}\n❌ Dead: ${deadCount}\n❓ Unknown: ${unknownCount}\n\n📊 Total: ${cards.length} cards\n\n<i>Format: card | user</i>`
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

      await sendTelegramMessage(chatId, "⏳ <b>Fetching live cards...</b>\n\nPlease wait while I prepare the file.");

      const { data: cards, error } = await supabase
        .from("card_checks")
        .select("card_details, gateway, created_at, user_id")
        .eq("result", "live")
        .order("created_at", { ascending: false })
        .limit(100000);

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
      const filename = `live_cards_${new Date().toISOString().split("T")[0]}.txt`;

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📁 <b>Live Cards Export</b>\n\n✅ Total Live Cards: ${cards.length}\n\n<i>Format: card | user</i>`
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

      await sendTelegramMessage(chatId, "⏳ <b>Fetching dead cards...</b>\n\nPlease wait while I prepare the file.");

      const { data: cards, error } = await supabase
        .from("card_checks")
        .select("card_details, gateway, created_at, user_id")
        .eq("result", "dead")
        .order("created_at", { ascending: false })
        .limit(100000);

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
      const filename = `dead_cards_${new Date().toISOString().split("T")[0]}.txt`;

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📁 <b>Dead Cards Export</b>\n\n❌ Total Dead Cards: ${cards.length}\n\n<i>Format: card | user</i>`
      );

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // /chargedcards - Export charged cards only
    if (text === "/chargedcards") {
      const isAdmin = await isAdminAsync(chatId, supabase);
      if (!isAdmin) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await sendTelegramMessage(chatId, "⏳ <b>Fetching charged cards...</b>\n\nPlease wait while I prepare the file.");

      const { data: cards, error } = await supabase
        .from("card_checks")
        .select("card_details, gateway, created_at, user_id, result")
        .ilike("result", "%charged%")
        .order("created_at", { ascending: false })
        .limit(100000);

      if (error || !cards || cards.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No charged cards found</b>\n\nThere are no charged card records in the database.");
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
      const filename = `charged_cards_${new Date().toISOString().split("T")[0]}.txt`;

      await sendTelegramDocument(
        chatId,
        fileContent,
        filename,
        `📁 <b>Charged Cards Export</b>\n\n💳 Total Charged Cards: ${cards.length}\n\n<i>Format: card | user</i>`
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

    // /ticket (staff can view)
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

    // /healthsites - Health check all gateway sites with live updates
    if (text === "/healthsites") {
      const isAdminUser = await isAdminAsync(chatId, supabase);
      if (!isAdminUser) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can use this command.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch ALL gateway URLs from database (no limit)
      const { data: gatewayUrls, error: urlError } = await supabase
        .from("gateway_urls")
        .select("url");

      if (urlError || !gatewayUrls || gatewayUrls.length === 0) {
        await sendTelegramMessage(chatId, "❌ <b>No URLs Found</b>\n\nThe gateway_urls table is empty or there was an error fetching data.");
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
        for (const r of lastResults) {
          const icon = r.status === "success" ? "✅" : "❌";
          const shortUrl = r.url.length > 25 ? r.url.substring(0, 25) + "..." : r.url;
          resultsDisplay += `${icon} ${shortUrl} → ${r.priceStr}\n`;
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
│ ✅ Success: <b>${successCount}</b>
│ ❌ Errors: <b>${errorCount}</b>
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

      // API endpoint for checking sites
      const API_BASE = "https://shopify-production-a2ac.up.railway.app/api";
      const TEST_CC = "4000222732521176|01|27|906";

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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

          const apiUrl = `${API_BASE}?storeurl=${encodeURIComponent(siteUrl)}&cc=${TEST_CC}`;
          
          const response = await fetch(apiUrl, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0",
              "Accept": "application/json,*/*",
            }
          });

          clearTimeout(timeoutId);

          const responseText = await response.text();
          const { price, priceStr } = extractPrice(responseText);

          results.push({
            url: siteUrl,
            price,
            priceStr,
            rawResponse: responseText, // Store full response
            status: "success"
          });

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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ADMIN_CHAT_ID = "8496943061";

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

  let topupList = "";
  displayTopups.forEach((topup, index) => {
    const date = new Date(topup.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const username = topup.profiles?.username || "Unknown";
    const credits = Number(topup.amount) * 10;
    
    topupList += `
${startIndex + index + 1}. <b>${credits} credits</b>
   👤 ${username} | 💳 ${topup.payment_method}
   📅 ${date} | 🆔 <code>${topup.id.slice(0, 8)}</code>
`;
  });

  const message = totalCount === 0 
    ? `💰 <b>Pending Topups</b>\n\n✅ No pending requests!`
    : `
💰 <b>Pending Topups</b> (${page + 1}/${totalPages || 1})

📊 Pending: ${totalCount}
${topupList}
`;

  const buttons: any[][] = [];
  displayTopups.forEach((topup) => {
    const credits = Number(topup.amount) * 10;
    buttons.push([
      { text: `✅ Approve ${credits}`, callback_data: `topup_accept_${topup.id}` },
      { text: `❌ Reject`, callback_data: `topup_reject_${topup.id}` }
    ]);
  });

  if (totalPages > 1) {
    const navButtons = [];
    if (page > 0) navButtons.push({ text: "◀️", callback_data: `topups_page_${page - 1}` });
    navButtons.push({ text: `${page + 1}/${totalPages}`, callback_data: "topups_noop" });
    if (page < totalPages - 1) navButtons.push({ text: "▶️", callback_data: `topups_page_${page + 1}` });
    buttons.push(navButtons);
  }
  
  buttons.push([{ text: "🔄 Refresh", callback_data: "topups_refresh" }]);

  return { message, keyboard: { inline_keyboard: buttons } };
}

// ═══════════════════════════════════════════════════════════
// ADMIN COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleAdminCmd(chatId: string, supabase: any): Promise<void> {
  const isAdminUser = await isAdminAsync(chatId, supabase);
  const isModUser = await isModeratorAsync(chatId, supabase);
  
  if (!isAdminUser && !isModUser) {
    await sendTelegramMessage(chatId, "❌ Access denied");
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
    await sendTelegramMessage(chatId, modMenu);
    return;
  }

  // Admin menu (full)
  let menu = `
🔐 <b>Admin Panel</b>

<b>📋 Tickets</b>
/ticket <code>[id]</code> - Manage ticket

<b>💰 Finance</b>
/topups - Pending requests
/addfund <code>[email] [amount]</code> - Add/deduct credits

<b>👥 Users</b>
/banuser <code>[user]</code> - Ban user
/unbanuser <code>[user]</code> - Unban user
/deleteuser <code>[user]</code> - Delete user
/deletealluser - Delete all users
/cancelban - Cancel pending ban
/viewbans - View banned users

<b>📊 Data</b>
/stats - View statistics
/allusers - List all users
/userinfo <code>[user]</code> - User details

<b>📢 Communication</b>
/broadcast <code>[message]</code> - Send to all users

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

  await sendTelegramMessage(chatId, menu);
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

  // Notify user
  await supabase.from("notifications").insert({
    user_id: foundUser.id,
    type: "credits_admin",
    title: `Credits ${action}`,
    message: `${Math.abs(amount)} credits ${action.toLowerCase()}. New balance: ${newCredits}`,
    metadata: { old_credits: oldCredits, new_credits: newCredits, amount }
  });

  if (profile.telegram_chat_id) {
    await sendTelegramMessage(profile.telegram_chat_id, `
${emoji} <b>Credits ${action}</b>

${action}: ${Math.abs(amount)} credits
New Balance: ${newCredits} credits
`);
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
  const { data: topups, count } = await supabase
    .from("topup_transactions")
    .select(`id, user_id, amount, payment_method, created_at, profiles!inner(username, name)`, { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return buildTopupsListMessage(topups || [], page, count || 0, perPage);
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

  if (profile.telegram_chat_id) {
    await sendTelegramMessage(profile.telegram_chat_id, "✅ Your account has been unbanned!");
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

  const { data: profiles } = await supabase.from("profiles").select("user_id, telegram_chat_id");
  if (!profiles?.length) {
    await sendTelegramMessage(chatId, "ℹ️ No users to broadcast to");
    return;
  }

  let telegramSent = 0, webSent = 0;

  for (const p of profiles) {
    if (p.telegram_chat_id) {
      const sent = await sendTelegramMessage(p.telegram_chat_id, `📢 <b>Announcement</b>\n\n${message}`);
      if (sent) telegramSent++;
    }

    await supabase.from("notifications").insert({
      user_id: p.user_id,
      type: "announcement",
      title: "Announcement",
      message: message
    });
    webSent++;
  }

  await sendTelegramMessage(chatId, `
✅ <b>Broadcast Sent</b>

📱 Telegram: ${telegramSent}/${profiles.filter((p: any) => p.telegram_chat_id).length}
🌐 Web: ${webSent}/${profiles.length}
`);
}

async function handleStats(chatId: string, supabase: any): Promise<void> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
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

  await sendTelegramMessage(chatId, `
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
`);
}

async function handleViewBans(chatId: string, supabase: any): Promise<void> {
  const hasAccess = await isStaffAsync(chatId, supabase);
  if (!hasAccess) {
    await sendTelegramMessage(chatId, "❌ Access denied");
    return;
  }

  const { data: banned } = await supabase
    .from("profiles")
    .select("user_id, username, ban_reason, banned_until")
    .eq("is_banned", true)
    .order("banned_at", { ascending: false });

  if (!banned?.length) {
    await sendTelegramMessage(chatId, "✅ No banned users");
    return;
  }

  let list = "";
  for (const u of banned) {
    const status = u.banned_until ? `⏳ Until ${new Date(u.banned_until).toLocaleDateString()}` : "🔴 Permanent";
    list += `\n• <b>${u.username || u.user_id}</b>\n  ${status} | ${u.ban_reason || "No reason"}`;
  }

  await sendTelegramMessage(chatId, `
🚫 <b>Banned Users</b> (${banned.length})
${list}

<i>Use /unbanuser [user] to unban</i>
`);
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

  // Try by telegram
  if (!profile) {
    const { data: p } = await supabase.from("profiles").select("*").eq("telegram_chat_id", identifier).maybeSingle();
    if (p) {
      profile = p;
      userEmail = authUsers.find((u: any) => u.id === p.user_id)?.email || null;
    }
  }

  if (!profile) {
    await sendTelegramMessage(chatId, `❌ User not found: ${identifier}`);
    return;
  }

  const { count: checks } = await supabase.from("card_checks").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id);
  const { count: topups } = await supabase.from("topup_transactions").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id);
  const { count: tickets } = await supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("user_id", profile.user_id);

  let status = "✅ Active";
  if (profile.is_banned) {
    status = profile.banned_until 
      ? `🚫 Banned until ${new Date(profile.banned_until).toLocaleDateString()}`
      : "🚫 Permanently Banned";
  }

  const joined = new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const userInfoMessage = `
🔍 <b>User Info</b>

<b>Profile</b>
• Username: ${profile.username || "Not set"}
• Name: ${profile.name || "Not set"}
• Email: ${userEmail || "Unknown"}

<b>Telegram</b>
• Chat ID: ${profile.telegram_chat_id || "Not connected"}
• Username: ${profile.telegram_username ? `@${profile.telegram_username}` : "Not set"}

<b>Account</b>
• Credits: ${profile.credits || 0}
• Status: ${status}
• Joined: ${joined}

<b>Activity</b>
• Checks: ${checks || 0}
• Topups: ${topups || 0}
• Tickets: ${tickets || 0}

<b>User ID</b>
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

      // Topup approve/reject
      if (callbackData.startsWith("topup_accept_") || callbackData.startsWith("topup_reject_")) {
        if (!callbackChatId || !isCallbackAdmin) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const isAccept = callbackData.startsWith("topup_accept_");
        const transactionId = callbackData.replace(isAccept ? "topup_accept_" : "topup_reject_", "");

        const { data: transaction } = await supabase
          .from("topup_transactions")
          .select("*, profiles!inner(username, telegram_chat_id)")
          .eq("id", transactionId)
          .single();

        if (!transaction) {
          await answerCallbackQuery(update.callback_query.id, "❌ Transaction not found");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (isAccept) {
          const credits = Number(transaction.amount) * 10;
          await supabase.rpc("handle_topup_completion", { p_transaction_id: transactionId });

          if (transaction.profiles?.telegram_chat_id) {
            await sendTelegramMessage(transaction.profiles.telegram_chat_id, `✅ <b>Topup Approved</b>\n\n+${credits} credits added!`);
          }
          await answerCallbackQuery(update.callback_query.id, `✅ Approved ${credits} credits`);
        } else {
          await supabase.from("topup_transactions").update({ status: "failed", rejection_reason: "Rejected by admin" }).eq("id", transactionId);

          if (transaction.profiles?.telegram_chat_id) {
            await sendTelegramMessage(transaction.profiles.telegram_chat_id, "❌ <b>Topup Rejected</b>\n\nYour topup request was rejected.");
          }
          await answerCallbackQuery(update.callback_query.id, "❌ Rejected");
        }

        const { message, keyboard } = await handleTopups(callbackChatId, supabase, 0);
        if (messageId && message) await editTelegramMessage(callbackChatId, messageId, message, keyboard || undefined);
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

        if (duration !== "permanent") {
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

        await supabase.from("pending_bans").delete().eq("admin_chat_id", callbackChatId);

        if (pendingBan.user_telegram_chat_id) {
          await sendTelegramMessage(pendingBan.user_telegram_chat_id, `
🚫 <b>Account Banned</b>

Reason: ${pendingBan.ban_reason || "Not specified"}
Duration: ${durationText}
`);
        }

        if (messageId) await editTelegramMessage(callbackChatId, messageId, `
✅ <b>User Banned</b>

👤 ${pendingBan.username || pendingBan.user_email}
⏱️ ${durationText}
📝 ${pendingBan.ban_reason || "No reason"}
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

          await supabase.from("ban_appeals").update({
            status: "approved", resolved_at: new Date().toISOString()
          }).eq("id", appealId);

          if (appeal.telegram_chat_id) {
            await sendTelegramMessage(appeal.telegram_chat_id, "✅ <b>Appeal Approved</b>\n\nYour account has been unbanned!");
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

        if (profile?.telegram_chat_id) {
          await sendTelegramMessage(profile.telegram_chat_id, "✅ Your account has been unbanned!");
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

      // ─────────────────────────────────────────────────────────
      // USER START PAGE CALLBACKS
      // ─────────────────────────────────────────────────────────
      
      if (callbackData === "user_mystatus") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, name, credits, is_banned, ban_reason, banned_until, telegram_username, created_at")
          .eq("telegram_chat_id", callbackChatId)
          .maybeSingle();

        if (!profile) {
          await answerCallbackQuery(update.callback_query.id, "❌ Account not connected");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

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

━━━━━━━━━━━━━━━━━━━━━━
`;

        await sendTelegramMessage(callbackChatId!, statusMessage, {
          inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]]
        });
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

        await sendTelegramMessage(callbackChatId!, balanceMessage, {
          inline_keyboard: [
            [{ text: "💳 Top Up Credits", url: "https://yunchicheck.lovable.app/dashboard/topup" }],
            [{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]
          ]
        });
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
│ 2️⃣ Go to yunchicheck.lovable.app
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

        await sendTelegramMessage(callbackChatId!, helpMessage, {
          inline_keyboard: [
            [{ text: "🌐 Open Dashboard", url: "https://yunchicheck.lovable.app/dashboard" }],
            [{ text: "🔙 Back to Menu", callback_data: "user_back_start" }]
          ]
        });
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
              { text: "🌐 Open Dashboard", url: "https://yunchicheck.lovable.app/dashboard" }
            ]
          ] : [
            [
              { text: "📋 Copy Chat ID", callback_data: "user_copy_id" },
              { text: "❓ How to Connect", callback_data: "user_help" }
            ],
            [
              { text: "🌐 Sign Up Now", url: "https://yunchicheck.lovable.app/auth" }
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
        if (message) await sendTelegramMessage(callbackChatId!, message, keyboard || undefined);
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

        await sendTelegramMessage(callbackChatId!, message, keyboard || undefined);
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

        await sendTelegramMessage(callbackChatId!, ticketsMessage, {
          inline_keyboard: [[{ text: "🔙 Back to Menu", callback_data: "menu_back" }]]
        });
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
            { text: "🌐 Open Dashboard", url: "https://yunchicheck.lovable.app/dashboard" }
          ]
        ] : [
          [
            { text: "📋 Copy Chat ID", callback_data: "user_copy_id" },
            { text: "❓ How to Connect", callback_data: "user_help" }
          ],
          [
            { text: "🌐 Sign Up Now", url: "https://yunchicheck.lovable.app/auth" }
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
              { text: "🎫 Support", url: "https://yunchicheck.lovable.app/dashboard/support" }
            ],
            [
              { text: "🌐 Dashboard", url: "https://yunchicheck.lovable.app/dashboard" }
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
              { text: "🌐 Sign Up", url: "https://yunchicheck.lovable.app/auth" }
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
2. Sign up at yunchi.app
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
        .select("username, name, credits, is_banned, ban_reason, banned_until, telegram_username, created_at")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!profile) {
        await sendTelegramMessage(chatId, `
❌ <b>Not Connected</b>

Your Telegram is not linked.

<b>To connect:</b>
1. Copy: <code>${chatId}</code>
2. Sign up at yunchi.app
3. Paste Chat ID
`, undefined, messageId);
      } else {
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
              { text: "🎫 Open Support Ticket", url: "https://yunchicheck.lovable.app/dashboard/support" }
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
            [{ text: "🌐 Sign Up Now", url: "https://yunchicheck.lovable.app/auth" }]
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

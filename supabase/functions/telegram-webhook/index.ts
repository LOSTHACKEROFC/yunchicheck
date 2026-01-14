import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Admin chat ID for admin-only commands
const ADMIN_CHAT_ID = "8496943061";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramUpdate {
  message?: {
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

async function sendTelegramMessage(
  chatId: string | number,
  message: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
      return false;
    }

    console.log("Telegram message sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

// Edit an existing Telegram message
async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  message: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: message,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram edit message API error:", errorData);
      return false;
    }

    console.log("Telegram message edited successfully");
    return true;
  } catch (error) {
    console.error("Error editing Telegram message:", error);
    return false;
  }
}

// Build paginated users list message
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
    const telegramId = user.telegram_chat_id ? `<code>${user.telegram_chat_id}</code>` : "❌ Not connected";
    const username = user.username || user.name || "No username";
    const profileLink = `https://yunchi.app/dashboard/profile?user=${user.user_id}`;
    
    userList += `
${startIndex + index + 1}. ${status} <b>${username}</b>
   📱 ${telegramId}
   🔗 <a href="${profileLink}">View Profile</a>
`;
  });

  const allUsersMessage = `
👥 <b>All Users</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>📊 STATISTICS</b>

<b>Total Users:</b> ${totalCount}
<b>Telegram Connected:</b> ${connectedCount}
<b>Banned:</b> ${bannedCount}
<b>Active:</b> ${totalCount - bannedCount}

━━━━━━━━━━━━━━━━━━━━━━

<b>📋 USER LIST</b> (Page ${page + 1}/${totalPages})
${userList}

━━━━━━━━━━━━━━━━━━━━━━

<i>✅ = Active | 🚫 = Banned</i>
<i>📱 = Telegram Chat ID</i>
`;

  // Build pagination buttons
  let keyboard: object | null = null;
  if (totalPages > 1) {
    const buttons = [];
    
    if (page > 0) {
      buttons.push({ text: "◀️ Previous", callback_data: `allusers_page_${page - 1}` });
    }
    
    buttons.push({ text: `${page + 1}/${totalPages}`, callback_data: "allusers_noop" });
    
    if (page < totalPages - 1) {
      buttons.push({ text: "Next ▶️", callback_data: `allusers_page_${page + 1}` });
    }
    
    keyboard = { inline_keyboard: [buttons] };
  }

  return { message: allUsersMessage, keyboard };
}

// Register bot commands with Telegram
async function setBotCommands(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  // Public commands (visible to all users)
  const publicCommands = [
    { command: "start", description: "Start the bot and get your Chat ID" },
    { command: "help", description: "View bot features and how to connect" },
    { command: "mystatus", description: "Check your account connection status" },
  ];

  // Admin commands (only visible to admin)
  const adminCommands = [
    { command: "start", description: "Start the bot" },
    { command: "help", description: "View bot features" },
    { command: "mystatus", description: "Check account status" },
    { command: "admincmd", description: "View admin command panel" },
    { command: "ticket", description: "View/manage a support ticket" },
    { command: "banuser", description: "Ban a user" },
    { command: "cancelban", description: "Cancel pending ban" },
    { command: "unbanuser", description: "Unban a user" },
    { command: "viewbans", description: "View all banned users" },
    { command: "broadcast", description: "Broadcast message to all users" },
    { command: "stats", description: "View website statistics" },
    { command: "allusers", description: "View all registered users" },
  ];

  try {
    // Set default commands for all users
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: publicCommands }),
    });

    // Set admin-specific commands
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: adminCommands,
        scope: { type: "chat", chat_id: parseInt(ADMIN_CHAT_ID) },
      }),
    });

    console.log("Bot commands registered successfully");
  } catch (error) {
    console.error("Error setting bot commands:", error);
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
    console.error("Error answering callback query:", error);
  }
}

async function editMessageReplyMarkup(
  chatId: number,
  messageId: number,
  ticketUuid: string,
  currentStatus: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  // Create keyboard with current status highlighted
  const statusButtons = [
    { text: currentStatus === "open" ? "✓ 🟡 Live" : "🟡 Live", callback_data: `open_${ticketUuid}` },
    { text: currentStatus === "processing" ? "✓ 🔵 Processing" : "🔵 Processing", callback_data: `processing_${ticketUuid}` },
  ];
  const statusButtons2 = [
    { text: currentStatus === "solved" ? "✓ 🟢 Solved" : "🟢 Solved", callback_data: `solved_${ticketUuid}` },
    { text: currentStatus === "closed" ? "✓ ⚫ Closed" : "⚫ Closed", callback_data: `closed_${ticketUuid}` },
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
          reply_markup: {
            inline_keyboard: [statusButtons, statusButtons2],
          },
        }),
      }
    );
  } catch (error) {
    console.error("Error editing message reply markup:", error);
  }
}

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
        subject: `[${ticketId}] New Reply to Your Support Ticket`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">New Reply to Your Ticket</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ticket:</strong> ${ticketId}</p>
              <p><strong>Subject:</strong> ${subject}</p>
            </div>
            <div style="background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px;">
              <p style="color: #6c757d; margin-bottom: 10px;"><strong>${adminName}:</strong></p>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
              You can view the full conversation by logging into your account.
            </p>
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
  const telegramMessage = `
<b>🎫 New Reply to Your Ticket</b>

<b>Ticket:</b> ${ticketId}
<b>Subject:</b> ${subject}

<b>${adminName}:</b>
${message}

<i>View the full conversation in your dashboard.</i>
`;
  await sendTelegramMessage(chatId, telegramMessage);
}

// Check if the chat ID is admin
function isAdmin(chatId: string): boolean {
  return chatId === ADMIN_CHAT_ID;
}

// Admin command handlers
async function handleAdminCmd(chatId: string): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to access admin commands.");
    return;
  }

  // Register commands when admin requests the panel
  await setBotCommands();

  const adminMenu = `
🔐 <b>Admin Command Panel</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>🎫 TICKET MANAGEMENT</b>
/ticket <code>[ticket_id]</code>
└ View and manage a support ticket

━━━━━━━━━━━━━━━━━━━━━━

<b>🛡️ USER MODERATION</b>
/banuser <code>[username/email]</code>
└ Ban a user (2-step: reason → duration)

/unbanuser <code>[username/email]</code>
└ Unban a previously banned user

/cancelban
└ Cancel a pending ban operation

/viewbans
└ List all currently banned users

━━━━━━━━━━━━━━━━━━━━━━

<b>📣 COMMUNICATION</b>
/broadcast <code>[message]</code>
└ Send announcement to all users

━━━━━━━━━━━━━━━━━━━━━━

<b>📈 ANALYTICS</b>
/stats
└ View website statistics

/allusers
└ View all registered users with Telegram IDs

━━━━━━━━━━━━━━━━━━━━━━

<i>💡 Commands registered in menu. Type / to see them.</i>
`;
  await sendTelegramMessage(chatId, adminMenu);
}

// Store pending ban operations (in-memory, per webhook call we'll use DB)
async function handleBanUser(chatId: string, identifier: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to ban users.");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ Please provide a username or email.\n\n<b>Usage:</b> /banuser username_or_email");
    return;
  }

  // Find user by username or email
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, user_id, username, name, is_banned, telegram_chat_id")
    .or(`username.ilike.${identifier}`)
    .maybeSingle();

  let userId = profile?.user_id;
  let userInfo = profile;
  let userEmail: string | null = null;

  // If not found by username, try by email via auth.users
  if (!profile) {
    const { data: authUser } = await supabase.auth.admin.listUsers();
    const foundUser = authUser?.users?.find((u: any) => 
      u.email?.toLowerCase() === identifier.toLowerCase()
    );
    
    if (foundUser) {
      userId = foundUser.id;
      userEmail = foundUser.email;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, user_id, username, name, is_banned, telegram_chat_id")
        .eq("user_id", foundUser.id)
        .maybeSingle();
      userInfo = profileData;
    }
  } else {
    // Get email from auth.users
    const { data: authUser } = await supabase.auth.admin.listUsers();
    const foundUser = authUser?.users?.find((u: any) => u.id === userId);
    userEmail = foundUser?.email || null;
  }

  if (!userId || !userInfo) {
    await sendTelegramMessage(chatId, `❌ User not found: <code>${identifier}</code>`);
    return;
  }

  if (userInfo.is_banned) {
    await sendTelegramMessage(chatId, `⚠️ User <b>${userInfo.username || userInfo.name || identifier}</b> is already banned.`);
    return;
  }

  // Store pending ban in database and ask for reason
  const { error: pendingError } = await supabase
    .from("pending_bans")
    .upsert({
      admin_chat_id: chatId,
      user_id: userId,
      username: userInfo.username || userInfo.name || identifier,
      user_email: userEmail,
      user_telegram_chat_id: userInfo.telegram_chat_id,
      created_at: new Date().toISOString(),
      step: "reason",
      ban_reason: null,
    }, { onConflict: "admin_chat_id" });

  if (pendingError) {
    console.error("Error storing pending ban:", pendingError);
    await sendTelegramMessage(chatId, "❌ Failed to initiate ban. Please try again.");
    return;
  }

  await sendTelegramMessage(
    chatId,
    `🚫 <b>Ban User - Step 1/2</b>\n\n<b>User:</b> ${userInfo.username || userInfo.name || identifier}\n<b>User ID:</b> <code>${userId}</code>\n\n<b>Please type the ban reason:</b>\n\n<i>Or send /cancelban to cancel.</i>`
  );
}

async function handleBanReason(chatId: string, text: string, supabase: any): Promise<boolean> {
  // Get pending ban for this admin
  const { data: pendingBan, error: pendingError } = await supabase
    .from("pending_bans")
    .select("*")
    .eq("admin_chat_id", chatId)
    .maybeSingle();

  if (!pendingBan) {
    return false; // No pending ban
  }

  // Step 1: Reason - save it and ask for duration
  if (pendingBan.step === "reason") {
    await supabase
      .from("pending_bans")
      .update({ ban_reason: text, step: "duration" })
      .eq("admin_chat_id", chatId);

    // Send duration selection with inline buttons
    const durationKeyboard = {
      inline_keyboard: [
        [
          { text: "1 Hour", callback_data: `ban_duration_1h_${pendingBan.user_id}` },
          { text: "6 Hours", callback_data: `ban_duration_6h_${pendingBan.user_id}` },
          { text: "24 Hours", callback_data: `ban_duration_24h_${pendingBan.user_id}` },
        ],
        [
          { text: "3 Days", callback_data: `ban_duration_3d_${pendingBan.user_id}` },
          { text: "7 Days", callback_data: `ban_duration_7d_${pendingBan.user_id}` },
          { text: "30 Days", callback_data: `ban_duration_30d_${pendingBan.user_id}` },
        ],
        [
          { text: "🔴 Permanent", callback_data: `ban_duration_permanent_${pendingBan.user_id}` },
        ],
      ],
    };

    await sendTelegramMessage(
      chatId,
      `🚫 <b>Ban User - Step 2/2</b>\n\n<b>User:</b> ${pendingBan.username}\n<b>Reason:</b> ${text}\n\n<b>Select ban duration:</b>`,
      durationKeyboard
    );

    return true;
  }

  return false;
}

async function executeBan(
  chatId: string,
  pendingBan: any,
  duration: string,
  supabase: any
): Promise<void> {
  // Calculate banned_until based on duration
  let bannedUntil: string | null = null;
  let durationText = "Permanent";

  const now = new Date();
  switch (duration) {
    case "1h":
      bannedUntil = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();
      durationText = "1 Hour";
      break;
    case "6h":
      bannedUntil = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
      durationText = "6 Hours";
      break;
    case "24h":
      bannedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      durationText = "24 Hours";
      break;
    case "3d":
      bannedUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
      durationText = "3 Days";
      break;
    case "7d":
      bannedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      durationText = "7 Days";
      break;
    case "30d":
      bannedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      durationText = "30 Days";
      break;
    case "permanent":
    default:
      bannedUntil = null;
      durationText = "Permanent";
      break;
  }

  // Delete pending ban
  await supabase
    .from("pending_bans")
    .delete()
    .eq("admin_chat_id", chatId);

  // Ban the user
  const { error: banError } = await supabase
    .from("profiles")
    .update({
      is_banned: true,
      banned_at: new Date().toISOString(),
      ban_reason: pendingBan.ban_reason,
      banned_until: bannedUntil,
    })
    .eq("user_id", pendingBan.user_id);

  if (banError) {
    console.error("Error banning user:", banError);
    await sendTelegramMessage(chatId, "❌ Failed to ban user. Please try again.");
    return;
  }

  const expiryText = bannedUntil 
    ? `\n<b>Expires:</b> ${new Date(bannedUntil).toLocaleString()}`
    : "";

  await sendTelegramMessage(
    chatId,
    `✅ <b>User Banned</b>\n\n<b>User:</b> ${pendingBan.username}\n<b>Reason:</b> ${pendingBan.ban_reason}\n<b>Duration:</b> ${durationText}${expiryText}`
  );

  // Notify user via Telegram
  if (pendingBan.user_telegram_chat_id) {
    const userExpiryText = bannedUntil
      ? `\n\n<b>Ban expires:</b> ${new Date(bannedUntil).toLocaleString()}`
      : "\n\nThis is a <b>permanent</b> ban.";

    await sendTelegramMessage(
      pendingBan.user_telegram_chat_id,
      `🚫 <b>Account Banned</b>\n\nYour account has been banned from the platform.\n\n<b>Reason:</b> ${pendingBan.ban_reason}\n<b>Duration:</b> ${durationText}${userExpiryText}\n\nIf you believe this is a mistake, please contact support.`
    );
  }

  // Send email notification
  if (pendingBan.user_email && RESEND_API_KEY) {
    const emailExpiryText = bannedUntil
      ? `<p><strong>Ban expires:</strong> ${new Date(bannedUntil).toLocaleString()}</p>`
      : `<p>This is a <strong>permanent</strong> ban.</p>`;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Yunchi Support <onboarding@resend.dev>",
          to: [pendingBan.user_email],
          subject: `Account Banned (${durationText}) - Yunchi`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">🚫 Account Banned</h2>
              <p>Your Yunchi account has been banned.</p>
              <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                <p><strong>Reason:</strong> ${pendingBan.ban_reason}</p>
                <p><strong>Duration:</strong> ${durationText}</p>
                ${emailExpiryText}
              </div>
              <p>If you believe this was a mistake, you can submit an appeal through our website or contact support directly.</p>
              <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">— Yunchi Team</p>
            </div>
          `,
        }),
      });
    } catch (error) {
      console.error("Error sending ban email:", error);
    }
  }
}

async function handleCancelBan(chatId: string, supabase: any): Promise<void> {
  const { data: pendingBan } = await supabase
    .from("pending_bans")
    .select("username")
    .eq("admin_chat_id", chatId)
    .maybeSingle();

  if (!pendingBan) {
    await sendTelegramMessage(chatId, "⚠️ No pending ban to cancel.");
    return;
  }

  await supabase
    .from("pending_bans")
    .delete()
    .eq("admin_chat_id", chatId);

  await sendTelegramMessage(chatId, `✅ Ban cancelled for user: <b>${pendingBan.username}</b>`);
}

async function handleUnbanUser(chatId: string, identifier: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to unban users.");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ Please provide a username or email.\n\n<b>Usage:</b> /unbanuser username_or_email");
    return;
  }

  // Find user by username
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_id, username, name, is_banned")
    .or(`username.ilike.${identifier}`)
    .maybeSingle();

  let userId = profile?.user_id;
  let userInfo = profile;

  // If not found by username, try by email
  if (!profile) {
    const { data: authUser } = await supabase.auth.admin.listUsers();
    const foundUser = authUser?.users?.find((u: any) => 
      u.email?.toLowerCase() === identifier.toLowerCase()
    );
    
    if (foundUser) {
      userId = foundUser.id;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, user_id, username, name, is_banned")
        .eq("user_id", foundUser.id)
        .maybeSingle();
      userInfo = profileData;
    }
  }

  if (!userId || !userInfo) {
    await sendTelegramMessage(chatId, `❌ User not found: <code>${identifier}</code>`);
    return;
  }

  if (!userInfo.is_banned) {
    await sendTelegramMessage(chatId, `⚠️ User <b>${userInfo.username || userInfo.name || identifier}</b> is not banned.`);
    return;
  }

  // Unban the user
  const { error: unbanError } = await supabase
    .from("profiles")
    .update({ 
      is_banned: false, 
      banned_at: null,
      ban_reason: null,
      banned_until: null
    })
    .eq("user_id", userId);

  if (unbanError) {
    console.error("Error unbanning user:", unbanError);
    await sendTelegramMessage(chatId, "❌ Failed to unban user. Please try again.");
    return;
  }

  await sendTelegramMessage(chatId, `✅ <b>User Unbanned</b>\n\n<b>User:</b> ${userInfo.username || userInfo.name || identifier}\n<b>User ID:</b> <code>${userId}</code>`);

  // Notify user via Telegram
  const { data: unbannedProfile } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (unbannedProfile?.telegram_chat_id) {
    await sendTelegramMessage(
      unbannedProfile.telegram_chat_id,
      "✅ <b>Account Unbanned</b>\n\nYour account has been unbanned. You can now access the platform again."
    );
  }
}

async function handleBroadcast(chatId: string, message: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to broadcast messages.");
    return;
  }

  if (!message) {
    await sendTelegramMessage(chatId, "❌ Please provide a message to broadcast.\n\n<b>Usage:</b> /broadcast Your message here");
    return;
  }

  // Get all users with Telegram chat IDs
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("telegram_chat_id, username")
    .not("telegram_chat_id", "is", null)
    .eq("is_banned", false);

  if (error) {
    console.error("Error fetching profiles:", error);
    await sendTelegramMessage(chatId, "❌ Failed to fetch users. Please try again.");
    return;
  }

  if (!profiles || profiles.length === 0) {
    await sendTelegramMessage(chatId, "⚠️ No users with Telegram connected.");
    return;
  }

  await sendTelegramMessage(chatId, `📢 <b>Broadcasting to ${profiles.length} users...</b>`);

  let successCount = 0;
  let failCount = 0;

  const broadcastMessage = `
📢 <b>Announcement</b>

${message}

<i>— Yunchi Team</i>
`;

  for (const profile of profiles) {
    if (profile.telegram_chat_id && profile.telegram_chat_id !== ADMIN_CHAT_ID) {
      const success = await sendTelegramMessage(profile.telegram_chat_id, broadcastMessage);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  await sendTelegramMessage(
    chatId,
    `✅ <b>Broadcast Complete</b>\n\n<b>Sent:</b> ${successCount}\n<b>Failed:</b> ${failCount}\n<b>Total:</b> ${profiles.length}`
  );
}

async function handleStats(chatId: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to view statistics.");
    return;
  }

  // Fetch site stats
  const { data: stats } = await supabase
    .from("site_stats")
    .select("total_users, total_checks, updated_at")
    .eq("id", "global")
    .maybeSingle();

  // Fetch ticket stats
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("status");

  const ticketStats = {
    total: tickets?.length || 0,
    open: tickets?.filter((t: any) => t.status === "open").length || 0,
    processing: tickets?.filter((t: any) => t.status === "processing").length || 0,
    solved: tickets?.filter((t: any) => t.status === "solved").length || 0,
    closed: tickets?.filter((t: any) => t.status === "closed").length || 0,
  };

  // Fetch banned users count
  const { data: bannedUsers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_banned", true);

  // Fetch users with Telegram connected
  const { data: telegramUsers } = await supabase
    .from("profiles")
    .select("id")
    .not("telegram_chat_id", "is", null);

  const statsMessage = `
📊 <b>Website Statistics</b>

<b>👥 Users</b>
• Total Users: ${stats?.total_users || 0}
• Telegram Connected: ${telegramUsers?.length || 0}
• Banned: ${bannedUsers?.length || 0}

<b>✅ Card Checks</b>
• Total Checks: ${stats?.total_checks || 0}

<b>🎫 Support Tickets</b>
• Total: ${ticketStats.total}
• 🟡 Open: ${ticketStats.open}
• 🔵 Processing: ${ticketStats.processing}
• 🟢 Solved: ${ticketStats.solved}
• ⚫ Closed: ${ticketStats.closed}

<i>Last updated: ${stats?.updated_at ? new Date(stats.updated_at).toLocaleString() : 'N/A'}</i>
`;

  await sendTelegramMessage(chatId, statsMessage);
}

async function handleViewBans(chatId: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to view banned users.");
    return;
  }

  // Fetch all banned users
  const { data: bannedUsers, error } = await supabase
    .from("profiles")
    .select("user_id, username, name, ban_reason, banned_at, banned_until")
    .eq("is_banned", true)
    .order("banned_at", { ascending: false });

  if (error) {
    console.error("Error fetching banned users:", error);
    await sendTelegramMessage(chatId, "❌ Failed to fetch banned users. Please try again.");
    return;
  }

  if (!bannedUsers || bannedUsers.length === 0) {
    await sendTelegramMessage(chatId, "✅ <b>No Banned Users</b>\n\nThere are currently no banned users on the platform.");
    return;
  }

  // Build the message with all banned users
  let message = `🚫 <b>Banned Users (${bannedUsers.length})</b>\n\n`;

  for (const user of bannedUsers) {
    const displayName = user.username || user.name || "Unknown";
    const bannedDate = user.banned_at 
      ? new Date(user.banned_at).toLocaleDateString()
      : "N/A";
    
    let banStatus = "🔴 Permanent";
    if (user.banned_until) {
      const expiryDate = new Date(user.banned_until);
      const now = new Date();
      if (expiryDate > now) {
        const diffMs = expiryDate.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 0) {
          banStatus = `⏳ ${diffDays}d ${diffHours % 24}h left`;
        } else {
          banStatus = `⏳ ${diffHours}h left`;
        }
      } else {
        banStatus = "⚠️ Pending unban";
      }
    }

    message += `<b>👤 ${displayName}</b>\n`;
    message += `├ Status: ${banStatus}\n`;
    message += `├ Reason: ${user.ban_reason || "Not specified"}\n`;
    message += `├ Banned: ${bannedDate}\n`;
    if (user.banned_until) {
      message += `├ Expires: ${new Date(user.banned_until).toLocaleString()}\n`;
    }
    message += `└ <code>/unbanuser ${user.username || user.user_id}</code>\n\n`;
  }

  message += `<i>Use /unbanuser [username] to unban a user</i>`;

  await sendTelegramMessage(chatId, message);
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received Telegram webhook");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const update: TelegramUpdate = await req.json();
    console.log("Telegram update:", JSON.stringify(update));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Handle callback query (button clicks)
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      console.log("Callback data:", callbackData);

      // Handle pagination for /allusers command
      if (callbackData.startsWith("allusers_page_")) {
        const chatId = update.callback_query.message?.chat.id.toString();
        const messageId = update.callback_query.message?.message_id;
        
        if (!chatId || !isAdmin(chatId)) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const page = parseInt(callbackData.replace("allusers_page_", ""));
        const perPage = 10;

        // Fetch all users
        const { data: users, error, count } = await supabase
          .from("profiles")
          .select("user_id, username, name, telegram_chat_id, telegram_username, is_banned, created_at", { count: "exact" })
          .order("created_at", { ascending: false });

        if (error || !users) {
          await answerCallbackQuery(update.callback_query.id, "❌ Error fetching users");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const totalCount = count || 0;
        const connectedCount = users.filter(u => u.telegram_chat_id).length;
        const bannedCount = users.filter(u => u.is_banned).length;

        const { message, keyboard } = buildUsersListMessage(
          users,
          page,
          totalCount,
          connectedCount,
          bannedCount,
          perPage
        );

        // Edit the message with new page
        if (messageId) {
          await editTelegramMessage(chatId, messageId, message, keyboard || undefined);
        }

        await answerCallbackQuery(update.callback_query.id, `Page ${page + 1}`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle noop callback (page indicator button)
      if (callbackData === "allusers_noop") {
        await answerCallbackQuery(update.callback_query.id, "Current page");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle verification callback
      if (callbackData.startsWith("verify_")) {
        const verificationCode = callbackData.replace("verify_", "");
        const chatId = update.callback_query.message?.chat.id.toString();

        if (!chatId) {
          await answerCallbackQuery(update.callback_query.id, "❌ Invalid chat");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Find pending verification
        const { data: verification, error: verifyError } = await supabase
          .from("pending_verifications")
          .select("*")
          .eq("verification_code", verificationCode)
          .eq("telegram_chat_id", chatId)
          .single();

        if (verifyError || !verification) {
          await answerCallbackQuery(update.callback_query.id, "❌ Verification not found or already used");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Check if expired
        if (new Date(verification.expires_at) < new Date()) {
          await answerCallbackQuery(update.callback_query.id, "❌ Verification has expired. Please request a new one.");
          // Delete expired verification
          await supabase
            .from("pending_verifications")
            .delete()
            .eq("id", verification.id);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Check if already verified
        if (verification.verified) {
          await answerCallbackQuery(update.callback_query.id, "✅ Already verified!");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Mark as verified
        const { error: updateError } = await supabase
          .from("pending_verifications")
          .update({ verified: true })
          .eq("id", verification.id);

        if (updateError) {
          console.error("Error updating verification:", updateError);
          await answerCallbackQuery(update.callback_query.id, "❌ Failed to verify. Please try again.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        await answerCallbackQuery(update.callback_query.id, "✅ Account verified successfully! You can now complete your registration.");
        await sendTelegramMessage(
          chatId,
          "✅ <b>Account Verified!</b>\n\nYou can now complete your registration on the website."
        );

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle ban duration callback
      if (callbackData.startsWith("ban_duration_")) {
        const callbackChatId = update.callback_query.message?.chat.id.toString();

        if (!callbackChatId || callbackChatId !== ADMIN_CHAT_ID) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can set ban duration");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Parse: ban_duration_1h_uuid or ban_duration_permanent_uuid
        const parts = callbackData.replace("ban_duration_", "").split("_");
        const duration = parts[0];
        const userId = parts.slice(1).join("_"); // Handle UUID with underscores

        // Get pending ban
        const { data: pendingBan } = await supabase
          .from("pending_bans")
          .select("*")
          .eq("admin_chat_id", callbackChatId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!pendingBan) {
          await answerCallbackQuery(update.callback_query.id, "❌ Ban operation expired or cancelled");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Execute the ban
        await executeBan(callbackChatId, pendingBan, duration, supabase);
        await answerCallbackQuery(update.callback_query.id, "✅ User banned successfully");

        // Remove the duration selection buttons
        if (update.callback_query.message?.message_id) {
          try {
            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: callbackChatId,
                  message_id: update.callback_query.message.message_id,
                  reply_markup: { inline_keyboard: [] },
                }),
              }
            );
          } catch (error) {
            console.error("Error removing buttons:", error);
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle ban appeal callbacks
      if (callbackData.startsWith("unban_appeal_") || callbackData.startsWith("reject_appeal_")) {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        
        if (callbackChatId !== ADMIN_CHAT_ID) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can respond to appeals");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const isUnban = callbackData.startsWith("unban_appeal_");
        const appealId = callbackData.replace(isUnban ? "unban_appeal_" : "reject_appeal_", "");

        // Get appeal details
        const { data: appeal, error: appealError } = await supabase
          .from("ban_appeals")
          .select("*")
          .eq("id", appealId)
          .single();

        if (appealError || !appeal) {
          await answerCallbackQuery(update.callback_query.id, "❌ Appeal not found");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (appeal.status !== "pending") {
          await answerCallbackQuery(update.callback_query.id, `⚠️ Appeal already ${appeal.status}`);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (isUnban) {
          // Unban the user
          const { data: authUsers } = await supabase.auth.admin.listUsers();
          const authUser = authUsers?.users?.find((u: any) => 
            u.email?.toLowerCase() === appeal.email.toLowerCase()
          );

          if (authUser) {
            await supabase
              .from("profiles")
              .update({ 
                is_banned: false, 
                banned_at: null,
                ban_reason: null,
                banned_until: null
              })
              .eq("user_id", authUser.id);
          }

          // Update appeal status
          await supabase
            .from("ban_appeals")
            .update({ 
              status: "approved",
              admin_response: "Your account has been unbanned.",
              resolved_at: new Date().toISOString()
            })
            .eq("id", appealId);

          // Notify user via email
          if (RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "Yunchi Support <onboarding@resend.dev>",
                to: [appeal.email],
                subject: "✅ Ban Appeal Approved - Account Unbanned",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #22c55e;">✅ Good News! Your Appeal Has Been Approved</h2>
                    <p>Hello${appeal.username ? ` ${appeal.username}` : ''},</p>
                    <p>Your ban appeal has been reviewed and <strong>approved</strong>. Your account has been unbanned.</p>
                    <p>You can now log in to your account and use the platform again.</p>
                    <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
                      If you have any questions, please contact support.
                    </p>
                    <p>— Yunchi Support Team</p>
                  </div>
                `,
              }),
            });
          }

          // Notify user via Telegram
          if (appeal.telegram_chat_id) {
            await sendTelegramMessage(
              appeal.telegram_chat_id,
              `✅ <b>Ban Appeal Approved!</b>\n\nGreat news! Your ban appeal has been reviewed and approved.\n\nYour account has been unbanned. You can now log in and use the platform again.\n\n— Yunchi Support Team`
            );
          }

          await answerCallbackQuery(update.callback_query.id, "✅ User unbanned and notified!");
          await sendTelegramMessage(
            ADMIN_TELEGRAM_CHAT_ID!,
            `✅ <b>Appeal Approved</b>\n\nUser <b>${appeal.username || appeal.email}</b> has been unbanned.\nNotifications sent via email and Telegram.`
          );
        } else {
          // Reject the appeal
          await supabase
            .from("ban_appeals")
            .update({ 
              status: "rejected",
              admin_response: "Your ban appeal has been reviewed and rejected.",
              resolved_at: new Date().toISOString()
            })
            .eq("id", appealId);

          // Notify user via email
          if (RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "Yunchi Support <onboarding@resend.dev>",
                to: [appeal.email],
                subject: "❌ Ban Appeal Rejected",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ef4444;">❌ Ban Appeal Rejected</h2>
                    <p>Hello${appeal.username ? ` ${appeal.username}` : ''},</p>
                    <p>Your ban appeal has been reviewed, but unfortunately it has been <strong>rejected</strong>.</p>
                    <p>The ban on your account remains in effect. If you have additional information to provide, you may submit a new appeal.</p>
                    <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
                      If you believe this decision was made in error, please contact support directly.
                    </p>
                    <p>— Yunchi Support Team</p>
                  </div>
                `,
              }),
            });
          }

          // Notify user via Telegram
          if (appeal.telegram_chat_id) {
            await sendTelegramMessage(
              appeal.telegram_chat_id,
              `❌ <b>Ban Appeal Rejected</b>\n\nWe're sorry, but your ban appeal has been reviewed and rejected.\n\nThe ban on your account remains in effect. If you believe this decision was made in error, you may contact support directly.\n\n— Yunchi Support Team`
            );
          }

          await answerCallbackQuery(update.callback_query.id, "❌ Appeal rejected and user notified");
          await sendTelegramMessage(
            ADMIN_TELEGRAM_CHAT_ID!,
            `❌ <b>Appeal Rejected</b>\n\nAppeal from <b>${appeal.username || appeal.email}</b> has been rejected.\nNotifications sent via email and Telegram.`
          );
        }

        // Update the message to remove buttons
        if (update.callback_query.message) {
          try {
            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: update.callback_query.message.chat.id,
                  message_id: update.callback_query.message.message_id,
                  reply_markup: { inline_keyboard: [] },
                }),
              }
            );
          } catch (e) {
            console.error("Failed to remove buttons:", e);
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Check if this is from admin for ticket operations
      const callbackChatId = update.callback_query.message?.chat.id.toString();
      if (callbackChatId !== ADMIN_CHAT_ID) {
        await answerCallbackQuery(update.callback_query.id, "❌ Only admins can change ticket status");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Parse callback data: action_ticketUuid
      const [action, ticketUuid] = callbackData.split("_");

      if (!ticketUuid) {
        await answerCallbackQuery(update.callback_query.id, "❌ Invalid ticket data");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Map action to status
      const statusMap: Record<string, string> = {
        open: "open",
        processing: "processing",
        solved: "solved",
        closed: "closed",
      };

      const newStatus = statusMap[action];
      if (!newStatus) {
        await answerCallbackQuery(update.callback_query.id, "❌ Unknown action");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Update ticket status
      const { data: ticket, error: updateError } = await supabase
        .from("support_tickets")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", ticketUuid)
        .select("ticket_id, subject, user_id, user_email")
        .single();

      if (updateError) {
        console.error("Error updating ticket status:", updateError);
        await answerCallbackQuery(update.callback_query.id, "❌ Failed to update status");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      await answerCallbackQuery(
        update.callback_query.id,
        `✅ Ticket status updated to: ${newStatus.toUpperCase()}`
      );

      // Update the inline keyboard to show current status (keep buttons visible)
      if (update.callback_query.message) {
        await editMessageReplyMarkup(
          update.callback_query.message.chat.id,
          update.callback_query.message.message_id,
          ticketUuid,
          newStatus
        );
      }

      // Notify admin in chat
      await sendTelegramMessage(
        ADMIN_TELEGRAM_CHAT_ID!,
        `✅ <b>Status Updated</b>\n\nTicket: ${ticket.ticket_id}\nNew Status: <b>${newStatus.toUpperCase()}</b>`
      );

      // Notify user about status change
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("user_id", ticket.user_id)
        .maybeSingle();

      if (profile?.telegram_chat_id) {
        await sendTelegramMessage(
          profile.telegram_chat_id,
          `🎫 <b>Ticket Status Updated</b>\n\nTicket: ${ticket.ticket_id}\nSubject: ${ticket.subject}\nNew Status: <b>${newStatus.toUpperCase()}</b>`
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle text messages (replies)
    if (update.message?.text && update.message.reply_to_message) {
      const chatId = update.message.chat.id.toString();
      const replyText = update.message.text;
      const originalMessage = update.message.reply_to_message.text || "";

      // Check if this is from admin
      if (chatId !== ADMIN_CHAT_ID) {
        console.log("Message not from admin, ignoring");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Extract ticket UUID from the original message
      // Look for pattern: [uuid] in the message
      const uuidMatch = originalMessage.match(/\[([a-f0-9-]{36})\]/i);
      if (!uuidMatch) {
        await sendTelegramMessage(
          chatId,
          "❌ Could not find ticket ID. Please reply directly to a ticket notification message."
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const ticketUuid = uuidMatch[1];

      // Get ticket details
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, subject, user_id, user_email, status")
        .eq("id", ticketUuid)
        .single();

      if (ticketError || !ticket) {
        await sendTelegramMessage(chatId, "❌ Ticket not found.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (ticket.status === "closed") {
        await sendTelegramMessage(chatId, "❌ This ticket is closed and cannot receive replies.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Insert admin message
      const { error: messageError } = await supabase.from("ticket_messages").insert({
        ticket_id: ticket.id,
        user_id: ticket.user_id,
        message: replyText,
        is_admin: true,
      });

      if (messageError) {
        console.error("Failed to save message:", messageError);
        await sendTelegramMessage(chatId, "❌ Failed to save reply.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Update ticket status to processing if it's open
      if (ticket.status === "open") {
        await supabase
          .from("support_tickets")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", ticket.id);
      }

      // Notify user via email
      await sendEmailNotification(
        ticket.user_email,
        ticket.ticket_id,
        ticket.subject,
        replyText,
        "Support Team"
      );

      // Notify user via Telegram
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("user_id", ticket.user_id)
        .maybeSingle();

      if (profile?.telegram_chat_id) {
        await sendUserTelegramNotification(
          profile.telegram_chat_id,
          ticket.ticket_id,
          ticket.subject,
          replyText,
          "Support Team"
        );
      }

      await sendTelegramMessage(chatId, `✅ Reply sent to ticket ${ticket.ticket_id}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /start command
    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id.toString();
      const isAdminUser = isAdmin(chatId);
      
      let welcomeMessage = `👋 <b>Welcome to @YunchiSupportbot</b>\n\nThis bot is used for:\n• Account verification during registration\n• Support ticket notifications\n• Replying to tickets directly\n\n<b>Your Chat ID:</b> <code>${chatId}</code>\n\n💡 Use this Chat ID when registering on Yunchi Checker.`;
      
      if (isAdminUser) {
        welcomeMessage += `\n\n🔐 <b>Admin Access Detected</b>\nUse /admincmd to view admin commands.`;
      }
      
      await sendTelegramMessage(chatId, welcomeMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /help command
    if (update.message?.text === "/help") {
      const chatId = update.message.chat.id.toString();
      const isAdminUser = isAdmin(chatId);

      const helpMessage = `
📚 <b>Yunchi Bot Help</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>🔗 HOW TO CONNECT YOUR ACCOUNT</b>

1️⃣ Copy your Chat ID:
   <code>${chatId}</code>

2️⃣ Go to the Yunchi website and sign up

3️⃣ Paste your Chat ID in the registration form

4️⃣ Click the verification button sent here

5️⃣ Complete your registration ✅

━━━━━━━━━━━━━━━━━━━━━━

<b>✨ BOT FEATURES</b>

🔐 <b>Account Verification</b>
Verify your identity during registration

🎫 <b>Ticket Notifications</b>
Receive support ticket updates instantly

💬 <b>Direct Replies</b>
Get notified when support responds

📢 <b>Announcements</b>
Stay updated with platform news

🔔 <b>Ban Notifications</b>
Get notified about account status changes

━━━━━━━━━━━━━━━━━━━━━━

<b>📋 COMMANDS</b>

/start - Get your Chat ID
/help - View this help message
/mystatus - Check your account status
${isAdminUser ? "/admincmd - Admin commands" : ""}

━━━━━━━━━━━━━━━━━━━━━━

<i>Need help? Contact support through the website.</i>
`;

      await sendTelegramMessage(chatId, helpMessage);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /mystatus command
    if (update.message?.text === "/mystatus") {
      const chatId = update.message.chat.id.toString();

      // Check if user is connected
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, username, name, balance, is_banned, ban_reason, banned_until, created_at, telegram_username")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        await sendTelegramMessage(chatId, "❌ Error checking your status. Please try again.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (!profile) {
        const notConnectedMessage = `
❌ <b>Account Not Connected</b>

Your Telegram is not linked to any Yunchi account.

━━━━━━━━━━━━━━━━━━━━━━

<b>🔗 HOW TO CONNECT</b>

1️⃣ Copy your Chat ID:
   <code>${chatId}</code>

2️⃣ Go to the Yunchi website

3️⃣ Sign up with your Chat ID

4️⃣ Verify when prompted

━━━━━━━━━━━━━━━━━━━━━━

<i>Use /help for more information.</i>
`;
        await sendTelegramMessage(chatId, notConnectedMessage);
      } else {
        // Format account status
        let accountStatus = "✅ Active";
        let banInfo = "";
        
        if (profile.is_banned) {
          if (profile.banned_until) {
            const expiryDate = new Date(profile.banned_until);
            const now = new Date();
            if (expiryDate > now) {
              const diffMs = expiryDate.getTime() - now.getTime();
              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
              const diffDays = Math.floor(diffHours / 24);
              accountStatus = diffDays > 0 
                ? `🚫 Banned (${diffDays}d ${diffHours % 24}h left)`
                : `🚫 Banned (${diffHours}h left)`;
            }
          } else {
            accountStatus = "🚫 Permanently Banned";
          }
          banInfo = `\n<b>Ban Reason:</b> ${profile.ban_reason || "Not specified"}`;
        }

        const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const connectedMessage = `
✅ <b>Account Connected</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>👤 PROFILE INFO</b>

<b>Username:</b> ${profile.username || "Not set"}
<b>Name:</b> ${profile.name || "Not set"}
<b>Telegram:</b> @${profile.telegram_username || "Not linked"}
<b>Balance:</b> $${Number(profile.balance).toFixed(2)}
<b>Status:</b> ${accountStatus}${banInfo}

━━━━━━━━━━━━━━━━━━━━━━

<b>📅 ACCOUNT</b>

<b>Member Since:</b> ${memberSince}
<b>Chat ID:</b> <code>${chatId}</code>

━━━━━━━━━━━━━━━━━━━━━━

<i>Manage your profile at yunchi.app/dashboard</i>
`;
        await sendTelegramMessage(chatId, connectedMessage);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /admincmd command
    if (update.message?.text === "/admincmd") {
      const chatId = update.message.chat.id.toString();
      await handleAdminCmd(chatId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /banuser command
    if (update.message?.text?.startsWith("/banuser")) {
      const chatId = update.message.chat.id.toString();
      const identifier = update.message.text.replace("/banuser", "").trim();
      await handleBanUser(chatId, identifier, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /cancelban command
    if (update.message?.text === "/cancelban") {
      const chatId = update.message.chat.id.toString();
      await handleCancelBan(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /unbanuser command
    if (update.message?.text?.startsWith("/unbanuser")) {
      const chatId = update.message.chat.id.toString();
      const identifier = update.message.text.replace("/unbanuser", "").trim();
      await handleUnbanUser(chatId, identifier, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /broadcast command
    if (update.message?.text?.startsWith("/broadcast")) {
      const chatId = update.message.chat.id.toString();
      const message = update.message.text.replace("/broadcast", "").trim();
      await handleBroadcast(chatId, message, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /stats command
    if (update.message?.text === "/stats") {
      const chatId = update.message.chat.id.toString();
      await handleStats(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /viewbans command
    if (update.message?.text === "/viewbans") {
      const chatId = update.message.chat.id.toString();
      await handleViewBans(chatId, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /allusers command (Admin only)
    if (update.message?.text === "/allusers") {
      const chatId = update.message.chat.id.toString();
      
      if (!isAdmin(chatId)) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can view all users.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const perPage = 10;

      // Get all users with their profile info
      const { data: users, error, count } = await supabase
        .from("profiles")
        .select("user_id, username, name, telegram_chat_id, telegram_username, is_banned, created_at", { count: "exact" })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching users:", error);
        await sendTelegramMessage(chatId, "❌ Error fetching users. Please try again.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const totalCount = count || 0;
      const connectedCount = users?.filter(u => u.telegram_chat_id).length || 0;
      const bannedCount = users?.filter(u => u.is_banned).length || 0;

      const { message, keyboard } = buildUsersListMessage(
        users || [],
        0,
        totalCount,
        connectedCount,
        bannedCount,
        perPage
      );

      await sendTelegramMessage(chatId, message, keyboard || undefined);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /ticket command (admin only for management)
    if (update.message?.text?.startsWith("/ticket")) {
      const chatId = update.message.chat.id.toString();
      
      // Only admin can use /ticket command
      if (!isAdmin(chatId)) {
        await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nOnly admins can manage tickets via this command.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const parts = update.message.text.split(" ");
      
      if (parts.length < 2) {
        await sendTelegramMessage(
          chatId,
          "❌ Please provide a ticket ID.\n\n<b>Usage:</b> /ticket TKT-XXXXXX\n<b>Example:</b> /ticket TKT-M1ABC2"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const inputTicketId = parts[1].trim().toUpperCase();
      
      // Fetch ticket by ticket_id
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, subject, message, status, priority, user_email, user_id, created_at")
        .eq("ticket_id", inputTicketId)
        .single();
      
      if (ticketError || !ticket) {
        await sendTelegramMessage(
          chatId,
          `❌ Ticket not found: <code>${inputTicketId}</code>\n\nMake sure you entered the correct ticket ID.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      // Fetch conversation messages
      const { data: messages } = await supabase
        .from("ticket_messages")
        .select("message, is_admin, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      
      // Build conversation text
      let conversationText = "";
      if (messages && messages.length > 0) {
        const recentMessages = messages.slice(-5); // Show last 5 messages
        conversationText = "\n\n<b>📝 Recent Messages:</b>\n" + recentMessages.map(m => 
          `${m.is_admin ? "👨‍💼 Admin" : "👤 User"}: ${m.message.substring(0, 100)}${m.message.length > 100 ? "..." : ""}`
        ).join("\n\n");
        
        if (messages.length > 5) {
          conversationText = `\n<i>(Showing last 5 of ${messages.length} messages)</i>` + conversationText;
        }
      }
      
      // Status emoji mapping
      const statusEmoji: Record<string, string> = {
        open: "🟡",
        processing: "🔵",
        solved: "🟢",
        closed: "⚫"
      };
      
      const statusLabel: Record<string, string> = {
        open: "LIVE",
        processing: "PROCESSING",
        solved: "SOLVED",
        closed: "CLOSED"
      };

      const priorityEmoji: Record<string, string> = {
        low: "🔵",
        medium: "🟡",
        high: "🟠",
        urgent: "🔴"
      };
      
      const emoji = statusEmoji[ticket.status] || "⚪";
      const pEmoji = priorityEmoji[ticket.priority] || "🟡";
      const createdDate = new Date(ticket.created_at).toLocaleString();
      
      const ticketDetails = `
🎫 <b>Ticket Details</b>

<b>ID:</b> ${ticket.ticket_id}
<b>Subject:</b> ${ticket.subject}
<b>Priority:</b> ${pEmoji} ${(ticket.priority || 'medium').toUpperCase()}
<b>Status:</b> ${emoji} ${statusLabel[ticket.status] || ticket.status.toUpperCase()}
<b>Email:</b> ${ticket.user_email}
<b>Created:</b> ${createdDate}

<b>Original Message:</b>
${ticket.message.substring(0, 500)}${ticket.message.length > 500 ? "..." : ""}${conversationText}

[${ticket.id}]
<i>💡 Reply to this message to respond to the user.</i>
`;
      
      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "🟡 Live", callback_data: `open_${ticket.id}` },
            { text: "🔵 Processing", callback_data: `processing_${ticket.id}` },
          ],
          [
            { text: "🟢 Solved", callback_data: `solved_${ticket.id}` },
            { text: "⚫ Closed", callback_data: `closed_${ticket.id}` },
          ],
        ],
      };
      
      await sendTelegramMessage(chatId, ticketDetails, inlineKeyboard);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle regular text messages from admin (for pending ban reason)
    if (update.message?.text && !update.message.reply_to_message) {
      const chatId = update.message.chat.id.toString();
      const messageText = update.message.text;

      // Skip if it's a command
      if (!messageText.startsWith("/")) {
        // Check if admin has pending ban
        if (isAdmin(chatId)) {
          const { data: pendingBan } = await supabase
            .from("pending_bans")
            .select("*")
            .eq("admin_chat_id", chatId)
            .maybeSingle();

          if (pendingBan) {
            // This message is the ban reason
            await handleBanReason(chatId, messageText, supabase);
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in telegram-webhook function:", error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);

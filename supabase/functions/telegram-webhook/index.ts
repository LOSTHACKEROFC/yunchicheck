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
    { command: "deleteuser", description: "Permanently delete a user" },
    { command: "deletealluser", description: "⚠️ Delete ALL users (dangerous)" },
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

/deleteuser <code>[username/email/chat_id]</code>
└ ⚠️ Permanently delete a user

/deletealluser
└ ☠️ Delete ALL users (EXTREMELY DANGEROUS)

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

// Handle delete user command
async function handleDeleteUser(chatId: string, identifier: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to delete users.");
    return;
  }

  if (!identifier) {
    await sendTelegramMessage(chatId, "❌ Please provide a username, email, or Telegram chat ID.\n\n<b>Usage:</b> /deleteuser identifier");
    return;
  }

  // Find user by username, email, or telegram_chat_id
  let userId: string | null = null;
  let userInfo: any = null;
  let userEmail: string | null = null;

  // First try by username or telegram_chat_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_id, username, name, telegram_chat_id, telegram_username, balance, created_at")
    .or(`username.ilike.${identifier},telegram_chat_id.eq.${identifier}`)
    .maybeSingle();

  if (profile) {
    userId = profile.user_id;
    userInfo = profile;
    // Get email from auth.users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const foundUser = authData?.users?.find((u: any) => u.id === userId);
    userEmail = foundUser?.email || null;
  } else {
    // Try by email via auth.users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const foundUser = authData?.users?.find((u: any) => 
      u.email?.toLowerCase() === identifier.toLowerCase()
    );
    
    if (foundUser) {
      userId = foundUser.id;
      userEmail = foundUser.email;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, user_id, username, name, telegram_chat_id, telegram_username, balance, created_at")
        .eq("user_id", foundUser.id)
        .maybeSingle();
      userInfo = profileData;
    }
  }

  if (!userId) {
    await sendTelegramMessage(chatId, `❌ User not found: <code>${identifier}</code>\n\n<i>Try searching by username, email, or Telegram chat ID.</i>`);
    return;
  }

  // Store pending deletion info
  const memberSince = userInfo?.created_at 
    ? new Date(userInfo.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Unknown";

  const confirmationKeyboard = {
    inline_keyboard: [
      [
        { text: "⚠️ CONFIRM DELETE", callback_data: `delete_confirm_${userId}` },
        { text: "❌ Cancel", callback_data: `delete_cancel_${userId}` },
      ],
    ],
  };

  const confirmMessage = `
⚠️ <b>DELETE USER - CONFIRMATION REQUIRED</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>👤 USER DETAILS</b>

<b>Username:</b> ${userInfo?.username || "Not set"}
<b>Name:</b> ${userInfo?.name || "Not set"}
<b>Email:</b> ${userEmail || "Unknown"}
<b>Telegram:</b> ${userInfo?.telegram_chat_id ? `<code>${userInfo.telegram_chat_id}</code>` : "Not connected"}
<b>Balance:</b> $${Number(userInfo?.balance || 0).toFixed(2)}
<b>Member Since:</b> ${memberSince}

━━━━━━━━━━━━━━━━━━━━━━

<b>🗑️ DATA TO BE DELETED:</b>
• Profile & account info
• All notifications
• All support tickets & messages
• All card checks
• All sessions
• Ban appeals & history
• Auth account

━━━━━━━━━━━━━━━━━━━━━━

<b>⚠️ THIS ACTION IS IRREVERSIBLE!</b>

<i>Click CONFIRM DELETE to proceed or Cancel to abort.</i>
`;

  await sendTelegramMessage(chatId, confirmMessage, confirmationKeyboard);
}

// Execute user deletion
async function executeUserDeletion(chatId: string, userId: string, supabase: any): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Starting deletion for user: ${userId}`);

    // Get user info before deletion for logging
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Delete all related data in order (respecting foreign keys)
    
    // 1. Get all ticket IDs for this user first
    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("user_id", userId);
    
    // 2. Delete ticket messages for those tickets
    if (tickets && tickets.length > 0) {
      const ticketIds = tickets.map((t: any) => t.id);
      await supabase
        .from("ticket_messages")
        .delete()
        .in("ticket_id", ticketIds);
    }

    // 3. Delete support tickets
    await supabase
      .from("support_tickets")
      .delete()
      .eq("user_id", userId);

    // 4. Delete notifications
    await supabase
      .from("notifications")
      .delete()
      .eq("user_id", userId);

    // 5. Delete notification reads
    await supabase
      .from("notification_reads")
      .delete()
      .eq("user_id", userId);

    // 6. Delete deleted_notifications
    await supabase
      .from("deleted_notifications")
      .delete()
      .eq("user_id", userId);

    // 7. Delete card checks
    await supabase
      .from("card_checks")
      .delete()
      .eq("user_id", userId);

    // 8. Delete user sessions
    await supabase
      .from("user_sessions")
      .delete()
      .eq("user_id", userId);

    // 9. Delete user roles
    await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    // 10. Delete ban appeals
    await supabase
      .from("ban_appeals")
      .delete()
      .eq("user_id", userId);

    // 11. Delete password reset OTPs
    await supabase
      .from("password_reset_otps")
      .delete()
      .eq("user_id", userId);

    // 12. Delete pending bans
    await supabase
      .from("pending_bans")
      .delete()
      .eq("user_id", userId);

    // 13. Delete pending verifications by telegram_chat_id if exists
    if (profile?.telegram_chat_id) {
      await supabase
        .from("pending_verifications")
        .delete()
        .eq("telegram_chat_id", profile.telegram_chat_id);
    }

    // 14. Delete profile
    await supabase
      .from("profiles")
      .delete()
      .eq("user_id", userId);

    // 15. Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Error deleting auth user:", authError);
      return { success: false, error: `Auth deletion failed: ${authError.message}` };
    }

    console.log(`Successfully deleted user: ${userId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error during user deletion:", error);
    return { success: false, error: error.message };
  }
}

// Handle delete all users command (EXTREMELY DANGEROUS - requires multi-step confirmation)
async function handleDeleteAllUsers(chatId: string, supabase: any): Promise<void> {
  if (!isAdmin(chatId)) {
    await sendTelegramMessage(chatId, "❌ <b>Access Denied</b>\n\nYou don't have permission to delete users.");
    return;
  }

  // Get count of all users
  const { count: userCount, error: countError } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Error counting users:", countError);
    await sendTelegramMessage(chatId, "❌ Error fetching user count. Please try again.");
    return;
  }

  if (!userCount || userCount === 0) {
    await sendTelegramMessage(chatId, "ℹ️ No users to delete.");
    return;
  }

  const confirmationKeyboard = {
    inline_keyboard: [
      [
        { text: "☠️ CONFIRM DELETE ALL", callback_data: `deleteall_confirm_step1` },
        { text: "❌ Cancel", callback_data: `deleteall_cancel` },
      ],
    ],
  };

  const warningMessage = `
☠️ <b>DELETE ALL USERS - EXTREME WARNING</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>⚠️ YOU ARE ABOUT TO DELETE ALL USERS!</b>

<b>Total users to delete:</b> ${userCount}

━━━━━━━━━━━━━━━━━━━━━━

<b>🗑️ DATA TO BE DELETED:</b>
• ALL user profiles & accounts
• ALL notifications
• ALL support tickets & messages
• ALL card checks
• ALL sessions
• ALL ban appeals & history
• ALL auth accounts

━━━━━━━━━━━━━━━━━━━━━━

<b>☠️ THIS ACTION IS IRREVERSIBLE!</b>
<b>☠️ ALL DATA WILL BE PERMANENTLY LOST!</b>

<i>This will require TWO confirmations.</i>
`;

  await sendTelegramMessage(chatId, warningMessage, confirmationKeyboard);
}

// Execute deletion of all users
async function executeDeleteAllUsers(chatId: string, supabase: any): Promise<void> {
  await sendTelegramMessage(chatId, "🔄 <b>Deleting all users...</b>\n\n<i>This may take a while. Please wait.</i>");

  try {
    // Get all user IDs first
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, telegram_chat_id");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      await sendTelegramMessage(chatId, "❌ Error fetching users. Please try again.");
      return;
    }

    if (!profiles || profiles.length === 0) {
      await sendTelegramMessage(chatId, "ℹ️ No users to delete.");
      return;
    }

    const totalUsers = profiles.length;
    let deletedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Delete users one by one
    for (const profile of profiles) {
      const result = await executeUserDeletion(chatId, profile.user_id, supabase);
      if (result.success) {
        deletedCount++;
      } else {
        failedCount++;
        errors.push(`User ${profile.user_id}: ${result.error}`);
      }

      // Send progress update every 10 users
      if ((deletedCount + failedCount) % 10 === 0) {
        await sendTelegramMessage(
          chatId,
          `🔄 <b>Progress:</b> ${deletedCount + failedCount}/${totalUsers} processed\n✅ Deleted: ${deletedCount}\n❌ Failed: ${failedCount}`
        );
      }
    }

    // Send final summary
    let summaryMessage = `
✅ <b>Delete All Users - Complete</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>📊 SUMMARY</b>

<b>Total Processed:</b> ${totalUsers}
<b>Successfully Deleted:</b> ${deletedCount}
<b>Failed:</b> ${failedCount}

━━━━━━━━━━━━━━━━━━━━━━
`;

    if (errors.length > 0) {
      summaryMessage += `\n<b>❌ Errors:</b>\n${errors.slice(0, 5).join("\n")}`;
      if (errors.length > 5) {
        summaryMessage += `\n<i>... and ${errors.length - 5} more errors</i>`;
      }
    }

    await sendTelegramMessage(chatId, summaryMessage);
    console.log(`Delete all users complete: ${deletedCount} deleted, ${failedCount} failed`);
  } catch (error: any) {
    console.error("Error during delete all users:", error);
    await sendTelegramMessage(chatId, `❌ Error during deletion: ${error.message}`);
  }
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

  // Get ALL users (not just those with Telegram connected)
  const { data: allProfiles, error: allError } = await supabase
    .from("profiles")
    .select("user_id, telegram_chat_id, username")
    .eq("is_banned", false);

  if (allError) {
    console.error("Error fetching profiles:", allError);
    await sendTelegramMessage(chatId, "❌ Failed to fetch users. Please try again.");
    return;
  }

  if (!allProfiles || allProfiles.length === 0) {
    await sendTelegramMessage(chatId, "⚠️ No users found.");
    return;
  }

  const telegramUsers = allProfiles.filter((p: any) => p.telegram_chat_id && p.telegram_chat_id !== ADMIN_CHAT_ID);
  
  await sendTelegramMessage(chatId, `📢 <b>Broadcasting to ${allProfiles.length} users (${telegramUsers.length} via Telegram)...</b>`);

  let telegramSuccess = 0;
  let telegramFail = 0;
  let webNotifSuccess = 0;
  let webNotifFail = 0;

  const broadcastMessage = `
📢 <b>Announcement</b>

${message}

<i>— Yunchi Team</i>
`;

  // Create web notifications for ALL users
  const notifications = allProfiles.map((profile: any) => ({
    user_id: profile.user_id,
    type: "announcement",
    title: "📢 Announcement",
    message: message,
    metadata: { broadcast: true, sent_at: new Date().toISOString() }
  }));

  const { error: notifError } = await supabase
    .from("notifications")
    .insert(notifications);

  if (notifError) {
    console.error("Error creating web notifications:", notifError);
    webNotifFail = allProfiles.length;
  } else {
    webNotifSuccess = allProfiles.length;
  }

  // Send Telegram messages to users with connected Telegram
  for (const profile of telegramUsers) {
    const success = await sendTelegramMessage(profile.telegram_chat_id, broadcastMessage);
    if (success) {
      telegramSuccess++;
    } else {
      telegramFail++;
    }
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  await sendTelegramMessage(
    chatId,
    `✅ <b>Broadcast Complete</b>

<b>📱 Telegram:</b>
├ Sent: ${telegramSuccess}
├ Failed: ${telegramFail}
└ Total: ${telegramUsers.length}

<b>🌐 Web Notifications:</b>
├ Sent: ${webNotifSuccess}
├ Failed: ${webNotifFail}
└ Total: ${allProfiles.length}`
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

      // Handle user deletion confirmation
      if (callbackData.startsWith("delete_confirm_")) {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        const messageId = update.callback_query.message?.message_id;
        
        if (!callbackChatId || !isAdmin(callbackChatId)) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const userId = callbackData.replace("delete_confirm_", "");
        
        // Get user info before deletion
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, name")
          .eq("user_id", userId)
          .maybeSingle();

        const displayName = profile?.username || profile?.name || userId;

        // Execute deletion
        const result = await executeUserDeletion(callbackChatId, userId, supabase);

        if (result.success) {
          if (messageId) {
            await editTelegramMessage(
              callbackChatId,
              messageId,
              `✅ <b>User Deleted Successfully</b>\n\n<b>User:</b> ${displayName}\n<b>User ID:</b> <code>${userId}</code>\n\n<i>All user data has been permanently removed.</i>`
            );
          }
          await answerCallbackQuery(update.callback_query.id, "✅ User deleted successfully");
        } else {
          if (messageId) {
            await editTelegramMessage(
              callbackChatId,
              messageId,
              `❌ <b>Deletion Failed</b>\n\n<b>User:</b> ${displayName}\n<b>Error:</b> ${result.error}\n\n<i>Please try again or check the logs.</i>`
            );
          }
          await answerCallbackQuery(update.callback_query.id, "❌ Deletion failed");
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle user deletion cancellation
      if (callbackData.startsWith("delete_cancel_")) {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        const messageId = update.callback_query.message?.message_id;
        
        if (callbackChatId && messageId) {
          await editTelegramMessage(
            callbackChatId,
            messageId,
            "❌ <b>Deletion Cancelled</b>\n\n<i>No changes were made.</i>"
          );
        }
        
        await answerCallbackQuery(update.callback_query.id, "Deletion cancelled");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle delete ALL users - Step 1 confirmation
      if (callbackData === "deleteall_confirm_step1") {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        const messageId = update.callback_query.message?.message_id;
        
        if (!callbackChatId || !isAdmin(callbackChatId)) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Get fresh count
        const { count: userCount } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true });

        // Second confirmation with final warning
        const step2Keyboard = {
          inline_keyboard: [
            [
              { text: "☠️ YES, DELETE ALL " + userCount + " USERS", callback_data: "deleteall_confirm_step2" },
            ],
            [
              { text: "❌ CANCEL - ABORT OPERATION", callback_data: "deleteall_cancel" },
            ],
          ],
        };

        if (messageId) {
          await editTelegramMessage(
            callbackChatId,
            messageId,
            `
☠️ <b>FINAL CONFIRMATION REQUIRED</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>⚠️ ARE YOU ABSOLUTELY SURE?</b>

You are about to permanently delete <b>${userCount}</b> user accounts.

This action will:
• Remove ALL user data permanently
• Clear ALL auth records
• Delete ALL notifications, tickets, sessions
• Reset the entire user database

━━━━━━━━━━━━━━━━━━━━━━

<b>☠️ THERE IS NO UNDO!</b>
<b>☠️ DATA CANNOT BE RECOVERED!</b>

<i>Click the button below ONLY if you are certain.</i>
`,
            step2Keyboard
          );
        }

        await answerCallbackQuery(update.callback_query.id, "⚠️ Step 2 of 2 - Final confirmation required");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle delete ALL users - Step 2 (FINAL) confirmation
      if (callbackData === "deleteall_confirm_step2") {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        const messageId = update.callback_query.message?.message_id;
        
        if (!callbackChatId || !isAdmin(callbackChatId)) {
          await answerCallbackQuery(update.callback_query.id, "❌ Access denied");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (messageId) {
          await editTelegramMessage(
            callbackChatId,
            messageId,
            "🔄 <b>DELETE ALL USERS - IN PROGRESS</b>\n\n<i>Processing deletion... Please wait.</i>"
          );
        }

        await answerCallbackQuery(update.callback_query.id, "☠️ Deletion started...");
        
        // Execute the deletion
        await executeDeleteAllUsers(callbackChatId, supabase);

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle delete ALL users cancellation
      if (callbackData === "deleteall_cancel") {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        const messageId = update.callback_query.message?.message_id;
        
        if (callbackChatId && messageId) {
          await editTelegramMessage(
            callbackChatId,
            messageId,
            "✅ <b>Delete All Users - Cancelled</b>\n\n<i>No users were deleted. Database is unchanged.</i>"
          );
        }
        
        await answerCallbackQuery(update.callback_query.id, "✅ Operation cancelled");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Handle topup accept/reject callbacks
      if (callbackData.startsWith("topup_accept_") || callbackData.startsWith("topup_reject_")) {
        const callbackChatId = update.callback_query.message?.chat.id.toString();
        
        if (callbackChatId !== ADMIN_CHAT_ID) {
          await answerCallbackQuery(update.callback_query.id, "❌ Only admins can approve/reject topups");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const isAccept = callbackData.startsWith("topup_accept_");
        const transactionId = callbackData.replace(isAccept ? "topup_accept_" : "topup_reject_", "");

        // Get transaction details
        const { data: transaction, error: txError } = await supabase
          .from("topup_transactions")
          .select("*")
          .eq("id", transactionId)
          .single();

        if (txError || !transaction) {
          await answerCallbackQuery(update.callback_query.id, "❌ Transaction not found");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        if (transaction.status !== "pending") {
          await answerCallbackQuery(update.callback_query.id, `⚠️ Transaction already ${transaction.status}`);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const newStatus = isAccept ? "completed" : "failed";

        if (isAccept) {
          // Call handle_topup_completion function to update status and balance
          const { error: rpcError } = await supabase.rpc("handle_topup_completion", {
            p_transaction_id: transactionId,
          });

          if (rpcError) {
            console.error("Error completing topup:", rpcError);
            await answerCallbackQuery(update.callback_query.id, "❌ Failed to process topup");
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        } else {
          // Just update status to failed
          const { error: updateError } = await supabase
            .from("topup_transactions")
            .update({ 
              status: "failed", 
              updated_at: new Date().toISOString() 
            })
            .eq("id", transactionId);

          if (updateError) {
            console.error("Error rejecting topup:", updateError);
            await answerCallbackQuery(update.callback_query.id, "❌ Failed to reject topup");
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        }

        // Notify user via the notify-topup-status edge function
        try {
          const notifyUrl = `${SUPABASE_URL}/functions/v1/notify-topup-status`;
          await fetch(notifyUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              transaction_id: transactionId,
              user_id: transaction.user_id,
              amount: transaction.amount,
              status: newStatus,
              payment_method: transaction.payment_method,
            }),
          });
        } catch (notifyError) {
          console.error("Error notifying user:", notifyError);
        }

        // Update Telegram message to remove buttons
        if (update.callback_query.message?.message_id) {
          try {
            // Get user info for the updated caption
            const { data: profile } = await supabase
              .from("profiles")
              .select("username, name")
              .eq("user_id", transaction.user_id)
              .single();

            const username = profile?.username || profile?.name || "Unknown User";
            const statusEmoji = isAccept ? "✅" : "❌";
            const statusText = isAccept ? "APPROVED" : "REJECTED";

            await fetch(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageCaption`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: callbackChatId,
                  message_id: update.callback_query.message.message_id,
                  caption: `${statusEmoji} <b>Top-Up ${statusText}</b>\n\n<b>Transaction ID:</b>\n<code>${transactionId}</code>\n\n<b>👤 User:</b> ${username}\n<b>💵 Amount:</b> $${transaction.amount}\n\n<i>Processed by admin</i>`,
                  parse_mode: "HTML",
                  reply_markup: { inline_keyboard: [] },
                }),
              }
            );
          } catch (error) {
            console.error("Error updating message:", error);
          }
        }

        await answerCallbackQuery(
          update.callback_query.id,
          isAccept ? "✅ Topup approved and balance updated" : "❌ Topup rejected"
        );

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
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

    // Handle /deleteuser command
    if (update.message?.text?.startsWith("/deleteuser") && !update.message?.text?.startsWith("/deletealluser")) {
      const chatId = update.message.chat.id.toString();
      const identifier = update.message.text.replace("/deleteuser", "").trim();
      await handleDeleteUser(chatId, identifier, supabase);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /deletealluser command (EXTREMELY DANGEROUS)
    if (update.message?.text === "/deletealluser") {
      const chatId = update.message.chat.id.toString();
      await handleDeleteAllUsers(chatId, supabase);
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

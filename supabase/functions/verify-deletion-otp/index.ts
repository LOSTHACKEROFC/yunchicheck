import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email-helper.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Send farewell email after account deletion
async function sendDeletionConfirmationEmail(email: string, username: string | null): Promise<boolean> {
  const result = await sendEmail({
    to: email,
    subject: "Your Yunchi Account Has Been Deleted",
    text: `Hello${username ? ` ${username}` : ''},

Your Yunchi account has been permanently deleted as requested.

All your data, including:
• Profile information
• Credit balance
• Check history
• Support tickets

...has been permanently removed from our systems.

If you didn't request this deletion, please contact us immediately at support@yunchicheck.com.

We're sorry to see you go. If you ever want to return, you're always welcome to create a new account.

— Yunchi Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
        <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Account Deleted</h1>
        </div>
        <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
          <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">
            Hello${username ? ` <strong style="color: #ef4444;">${username}</strong>` : ''},
          </p>
          
          <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6;">
            Your Yunchi account has been permanently deleted as requested.
          </p>
          
          <div style="background: #1a0a0a; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="color: #fca5a5; font-size: 14px; margin: 0 0 12px; font-weight: 600;">All your data has been removed:</p>
            <ul style="color: #a3a3a3; font-size: 14px; margin: 0; padding-left: 20px;">
              <li>Profile information</li>
              <li>Credit balance</li>
              <li>Check history</li>
              <li>Support tickets</li>
            </ul>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            If you didn't request this deletion, please contact us immediately at 
            <a href="mailto:support@yunchicheck.com" style="color: #ef4444; text-decoration: none;">support@yunchicheck.com</a>.
          </p>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            We're sorry to see you go. If you ever want to return, you're always welcome to create a new account.
          </p>
          
          <hr style="border: none; border-top: 1px solid #262626; margin: 24px 0;" />
          
          <p style="color: #525252; font-size: 12px; text-align: center;">
            — Yunchi Team
          </p>
        </div>
      </div>
    `,
    tags: [
      { name: "category", value: "transactional" },
      { name: "type", value: "account_deletion" },
    ],
  });

  return result.success;
}

// Send Telegram notification about account deletion
async function sendDeletionTelegramNotification(chatId: string, username: string | null): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const message = `👋 <b>Account Deleted</b>

Hello${username ? ` <b>${username}</b>` : ''},

Your Yunchi account has been permanently deleted as requested.

All your data has been removed from our systems.

If you didn't request this, please contact support immediately.

We're sorry to see you go! 💔`;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram deletion notification:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { otp } = await req.json();
    if (!otp || otp.length !== 6) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find the OTP record
    const { data: otpRecord, error: otpError } = await adminClient
      .from("deletion_otps")
      .select("*")
      .eq("user_id", userId)
      .eq("otp_hash", otp)
      .single();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      // Delete expired OTP
      await adminClient.from("deletion_otps").delete().eq("id", otpRecord.id);
      return new Response(
        JSON.stringify({ error: "Verification code has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile for username and telegram_chat_id before deletion
    const { data: profile } = await adminClient
      .from("profiles")
      .select("username, telegram_chat_id")
      .eq("user_id", userId)
      .single();

    const username = profile?.username || null;
    const telegramChatId = profile?.telegram_chat_id || null;

    console.log(`OTP verified for user: ${userId}. Proceeding with account deletion...`);

    // Delete all user data in order (respecting foreign keys)
    
    // 1. Delete deletion OTPs first
    await adminClient.from("deletion_otps").delete().eq("user_id", userId);
    
    // 2. Delete notification reads and deleted notifications
    await adminClient.from("notification_reads").delete().eq("user_id", userId);
    await adminClient.from("deleted_notifications").delete().eq("user_id", userId);
    
    // 3. Delete notifications
    await adminClient.from("notifications").delete().eq("user_id", userId);

    // 4. Get user's ticket IDs first
    const { data: tickets } = await adminClient
      .from("support_tickets")
      .select("id")
      .eq("user_id", userId);

    // 5. Delete ticket messages
    if (tickets && tickets.length > 0) {
      const ticketIds = tickets.map(t => t.id);
      await adminClient.from("ticket_messages").delete().in("ticket_id", ticketIds);
    }

    // 6. Delete support tickets
    await adminClient.from("support_tickets").delete().eq("user_id", userId);

    // 7. Delete card checks
    await adminClient.from("card_checks").delete().eq("user_id", userId);

    // 8. Delete user sessions
    await adminClient.from("user_sessions").delete().eq("user_id", userId);

    // 9. Delete profile
    await adminClient.from("profiles").delete().eq("user_id", userId);

    // 10. Delete the auth user (this will cascade delete sessions, etc.)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      return new Response(
        JSON.stringify({ error: "Failed to delete authentication record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted account for user: ${userId}`);

    // Send farewell notifications (after deletion, so we use saved email/telegram)
    if (userEmail) {
      await sendDeletionConfirmationEmail(userEmail, username);
    }

    if (telegramChatId) {
      await sendDeletionTelegramNotification(telegramChatId, username);
    }

    return new Response(
      JSON.stringify({ success: true, deleted: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-deletion-otp:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BanNotificationPayload {
  user_id: string;
  telegram_chat_id?: string;
  ban_reason?: string;
  username?: string;
  email?: string;
  banned_until?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const payload: BanNotificationPayload = await req.json();
    const { user_id, telegram_chat_id, ban_reason, username, email, banned_until } = payload;

    console.log("Processing ban notification for user:", user_id);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user email if not provided
    let userEmail = email;
    if (!userEmail) {
      const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
      userEmail = authUser?.user?.email;
    }

    const userDisplay = username ? `@${username}` : "User";
    const banDuration = banned_until 
      ? `until ${new Date(banned_until).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
      : "permanently";

    // Send Telegram notification
    if (telegram_chat_id && TELEGRAM_BOT_TOKEN) {
      console.log(`Sending Telegram ban notification to: ${telegram_chat_id}`);

      let message = `🚫 <b>Account Banned</b>\n\n`;
      message += `Hello ${userDisplay},\n\n`;
      message += `Your account has been banned ${banDuration} by our Support team.\n\n`;
      
      if (ban_reason) {
        message += `<b>Reason:</b>\n${ban_reason}\n\n`;
      }
      
      message += `If you believe this was a mistake, please contact support to appeal this decision.\n\n`;
      message += `Contact Support: @YunchiSupportbot`;

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegram_chat_id,
            text: message,
            parse_mode: "HTML",
          }),
        }
      );

      const telegramResult = await telegramResponse.json();
      if (!telegramResponse.ok) {
        console.error("Telegram API error:", telegramResult);
      } else {
        console.log("Telegram ban notification sent successfully");
      }
    }

    // Send Email notification using shared email helper
    if (userEmail) {
      console.log(`Sending email ban notification to: ${userEmail}`);
      
      const reasonHtml = ban_reason 
        ? `<div style="background: #1a0a0a; padding: 15px; border-left: 4px solid #ef4444; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #fca5a5; font-weight: 600;">Reason:</p>
            <p style="margin: 8px 0 0 0; color: #e5e5e5; line-height: 1.6;">${ban_reason}</p>
           </div>` 
        : "";

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🚫 Account Banned</h1>
          </div>
          <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 16px 16px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
            <p style="font-size: 16px; line-height: 1.6;">Hello <strong style="color: #ef4444;">${userDisplay}</strong>,</p>
            <p style="color: #a3a3a3; line-height: 1.6;">Your account has been banned <strong style="color: #fca5a5;">${banDuration}</strong> by our Support team.</p>
            
            ${reasonHtml}
            
            <div style="background: #1a1a1a; padding: 20px; border-radius: 12px; margin: 20px 0;">
              <p style="margin: 0; color: #a3a3a3; line-height: 1.6;">If you believe this was a mistake, please contact our support team to appeal this decision.</p>
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
              <a href="https://yunchicheck.com" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Contact Support</a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
            
            <p style="color: #525252; font-size: 12px; text-align: center;">
              This is an automated message from Yunchi Checker.<br>
              — Yunchi Team
            </p>
          </div>
        </div>
      `;

      const emailResult = await sendEmail({
        to: userEmail,
        subject: "🚫 Your Account Has Been Banned - Yunchi",
        html: emailHtml,
        tags: [
          { name: "category", value: "transactional" },
          { name: "type", value: "ban_notification" },
        ],
      });

      if (emailResult.success) {
        console.log("Email ban notification sent successfully");
      } else {
        console.error("Failed to send ban email:", emailResult.error);
      }
    }

    // Create in-app notification
    await supabase.from("notifications").insert({
      user_id,
      type: "account_banned",
      title: "Account Banned",
      message: ban_reason 
        ? `Your account has been banned ${banDuration}. Reason: ${ban_reason}`
        : `Your account has been banned ${banDuration}. Contact support if you need assistance.`,
      metadata: { ban_reason, banned_until }
    });

    console.log("Ban notification processing complete");
    return new Response(
      JSON.stringify({ success: true, message: "Notifications sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending ban notification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

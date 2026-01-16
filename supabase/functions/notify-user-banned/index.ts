import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
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

    // Send Email notification
    if (userEmail && RESEND_API_KEY) {
      console.log(`Sending email ban notification to: ${userEmail}`);
      
      const resend = new Resend(RESEND_API_KEY);

      const reasonHtml = ban_reason 
        ? `<div style="background: #3b1c1c; padding: 15px; border-left: 4px solid #ef4444; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #fca5a5;"><strong>Reason:</strong></p>
            <p style="margin: 5px 0 0 0; color: #e5e5e5;">${ban_reason}</p>
           </div>` 
        : "";

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🚫 Account Banned</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
            <p style="font-size: 16px;">Hello <strong>${userDisplay}</strong>,</p>
            <p>Your account has been banned <strong>${banDuration}</strong> by our Support team.</p>
            
            ${reasonHtml}
            
            <div style="background: #262626; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #a3a3a3;">If you believe this was a mistake, please contact our support team to appeal this decision.</p>
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
              <a href="https://yunchicheck.lovable.app" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">Contact Support</a>
            </div>
            
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 30px;">
              This is an automated message from Yunchi Checker.
            </p>
          </div>
        </div>
      `;

      const emailResult = await resend.emails.send({
        from: "Yunchi <noreply@yunchicheck.com>",
        to: [userEmail],
        subject: "🚫 Your Account Has Been Banned",
        html: emailHtml,
      });

      if (emailResult.error) {
        console.error("Email error:", emailResult.error);
      } else {
        console.log("Email ban notification sent successfully");
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

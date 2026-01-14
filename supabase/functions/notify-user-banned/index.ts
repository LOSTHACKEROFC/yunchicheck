import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BanNotificationPayload {
  user_id: string;
  telegram_chat_id: string;
  ban_reason?: string;
  username?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      console.error("TELEGRAM_BOT_TOKEN not configured");
      return new Response(
        JSON.stringify({ error: "Telegram bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: BanNotificationPayload = await req.json();
    const { telegram_chat_id, ban_reason, username } = payload;

    if (!telegram_chat_id) {
      console.log("No Telegram chat ID provided, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No Telegram chat ID" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending ban notification to chat ID: ${telegram_chat_id}`);

    // Build the ban notification message
    const userDisplay = username ? `@${username}` : "User";
    let message = `🚫 <b>Account Banned</b>\n\n`;
    message += `Hello ${userDisplay},\n\n`;
    message += `Your account has been banned by our Support team.\n\n`;
    
    if (ban_reason) {
      message += `<b>Reason:</b>\n${ban_reason}\n\n`;
    }
    
    message += `If you believe this was a mistake, please contact support to appeal this decision.\n\n`;
    message += `Contact Support: @YunchiSupportbot`;

    // Send message via Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const telegramResponse = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_chat_id,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok) {
      console.error("Telegram API error:", telegramResult);
      return new Response(
        JSON.stringify({ error: "Failed to send Telegram notification", details: telegramResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Ban notification sent successfully");
    return new Response(
      JSON.stringify({ success: true, message: "Notification sent" }),
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

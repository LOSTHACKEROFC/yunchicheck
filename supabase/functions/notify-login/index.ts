import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/email-helper.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoginNotificationRequest {
  user_id: string;
  email: string;
  ip_address?: string;
  user_agent?: string;
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
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

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
      return false;
    }

    console.log("Telegram login notification sent");
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received login notification request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, email, ip_address, user_agent }: LoginNotificationRequest = await req.json();

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "User ID and email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing login notification for: ${email}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile for telegram chat ID and username
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id, username, name")
      .eq("user_id", user_id)
      .single();

    const displayName = profile?.name || profile?.username || email.split("@")[0];
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // Parse user agent for device info
    let deviceInfo = "Unknown Device";
    let browserInfo = "Unknown Browser";
    if (user_agent) {
      if (user_agent.includes("Mobile")) deviceInfo = "Mobile Device";
      else if (user_agent.includes("Tablet")) deviceInfo = "Tablet";
      else deviceInfo = "Desktop";

      if (user_agent.includes("Chrome")) browserInfo = "Chrome";
      else if (user_agent.includes("Firefox")) browserInfo = "Firefox";
      else if (user_agent.includes("Safari")) browserInfo = "Safari";
      else if (user_agent.includes("Edge")) browserInfo = "Edge";
    }

    let emailSent = false;
    let telegramSent = false;

    // Send email notification using shared email helper
    const emailResult = await sendEmail({
      to: email,
      subject: "New Login to Your Yunchi Account",
      text: `Hello ${displayName},

We detected a new login to your Yunchi Checker account.

Date & Time: ${formattedDate}
Device: ${deviceInfo}
Browser: ${browserInfo}${ip_address ? `\nIP Address: ${ip_address}` : ''}

If this was you, you can safely ignore this email.
If this wasn't you, please change your password immediately and contact support.

Review account security: https://yunchicheck.com/dashboard/profile

— Yunchi Security Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🔐 New Login Detected</h1>
          </div>
          <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
            <p style="font-size: 16px;">Hello <strong style="color: #ef4444;">${displayName}</strong>,</p>
            <p style="color: #a3a3a3;">We detected a new login to your Yunchi Checker account.</p>
            
            <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2a1a1a;">
              <p style="margin: 8px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Date & Time:</strong> ${formattedDate}</p>
              <p style="margin: 8px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Device:</strong> ${deviceInfo}</p>
              <p style="margin: 8px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Browser:</strong> ${browserInfo}</p>
              ${ip_address ? `<p style="margin: 8px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">IP Address:</strong> ${ip_address}</p>` : ''}
            </div>
            
            <div style="background: #0a1a0a; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #6ee7b7; margin: 0; font-size: 14px;">
                If this was you, you can safely ignore this email.
              </p>
            </div>
            
            <div style="background: #1a0a0a; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #fca5a5; margin: 0; font-size: 14px;">
                If this wasn't you, please change your password immediately and contact support.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
              <a href="https://yunchicheck.com/dashboard/profile" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">Review Account Security</a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
            <p style="color: #404040; font-size: 12px; text-align: center;">
              This is an automated security notification from Yunchi Checker.<br>
              You're receiving this because login notifications are enabled for your account.
            </p>
          </div>
        </div>
      `,
      tags: [
        { name: "category", value: "transactional" },
        { name: "type", value: "login_alert" },
      ],
    });

    emailSent = emailResult.success;
    if (emailSent) {
      console.log("Login email notification sent to:", email);
    } else {
      console.error("Failed to send login email:", emailResult.error);
    }

    // Send Telegram notification
    if (profile?.telegram_chat_id) {
      const telegramMessage = `🔐 <b>New Login Detected</b>

Hello <b>${displayName}</b>,

A new login to your Yunchi Checker account was detected.

📅 <b>Date:</b> ${formattedDate}
💻 <b>Device:</b> ${deviceInfo}
🌐 <b>Browser:</b> ${browserInfo}
${ip_address ? `📍 <b>IP:</b> ${ip_address}` : ''}

✅ If this was you, you can ignore this message.
⚠️ If this wasn't you, change your password immediately!`;

      telegramSent = await sendTelegramMessage(profile.telegram_chat_id, telegramMessage);
    } else {
      console.log("No Telegram chat ID for user");
    }

    return new Response(
      JSON.stringify({ success: true, emailSent, telegramSent }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-login:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

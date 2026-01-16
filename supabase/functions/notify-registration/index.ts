import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegistrationNotificationRequest {
  user_id: string;
  email: string;
  username?: string;
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

    console.log("Telegram registration notification sent");
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received registration notification request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, email, username }: RegistrationNotificationRequest = await req.json();

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "User ID and email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing registration notification for: ${email}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile for telegram chat ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id, username, name")
      .eq("user_id", user_id)
      .single();

    const displayName = username || profile?.username || email.split("@")[0];
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

    let emailSent = false;
    let telegramSent = false;

    // Send welcome email
    if (RESEND_API_KEY) {
      try {
        const resend = new Resend(RESEND_API_KEY);

        const { error: emailError } = await resend.emails.send({
          from: "Yunchi <onboarding@resend.dev>",
          to: [email],
          subject: "🎉 Welcome to Yunchi - Your Account is Ready!",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
              <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px 30px; text-align: center;">
                <h1 style="color: #fff; margin: 0 0 10px 0; font-size: 28px;">🎉 Welcome to Yunchi!</h1>
                <p style="color: #a0a0a0; margin: 0; font-size: 16px;">Your account has been created successfully</p>
              </div>
              
              <div style="background: #ffffff; border-radius: 16px; padding: 30px; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <p style="color: #333; font-size: 18px; margin: 0 0 20px 0;">
                  Hello <strong>${displayName}</strong>! 👋
                </p>
                
                <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                  Thank you for joining Yunchi Checker. We're excited to have you on board!
                </p>
                
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 25px; margin: 25px 0;">
                  <h2 style="color: #fff; margin: 0 0 15px 0; font-size: 18px;">📋 Your Account Details</h2>
                  <table style="width: 100%; color: #fff;">
                    <tr>
                      <td style="padding: 8px 0; opacity: 0.8;">Username:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${displayName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; opacity: 0.8;">Email:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; opacity: 0.8;">Registered:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${formattedDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; opacity: 0.8;">Starting Credits:</td>
                      <td style="padding: 8px 0; font-weight: bold;">0 credits</td>
                    </tr>
                  </table>
                </div>
                
                <h2 style="color: #333; font-size: 18px; margin: 30px 0 15px 0;">🚀 Getting Started</h2>
                
                <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px;">
                  <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">1. Top Up Your Balance</h3>
                  <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
                    Add credits to your account via crypto payment. Visit the Balance page to get started.
                  </p>
                </div>
                
                <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px;">
                  <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">2. Explore Available Gateways</h3>
                  <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
                    Check out our gateways page to see all available checking options and their credit costs.
                  </p>
                </div>
                
                <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px;">
                  <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">3. Telegram Notifications Connected ✅</h3>
                  <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
                    You're already connected to @YunchiSupportbot for real-time alerts!
                  </p>
                </div>
                
                <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                  <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">4. Need Help?</h3>
                  <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
                    Visit our Support page to submit a ticket or reach out via Telegram for quick assistance.
                  </p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="https://yunchicheck.lovable.app/dashboard" 
                     style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #fff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                    Go to Dashboard →
                  </a>
                </div>
              </div>
              
              <div style="text-align: center; margin-top: 25px; padding: 20px;">
                <p style="color: #888; font-size: 12px; margin: 0 0 10px 0;">
                  If you didn't create this account, please ignore this email.
                </p>
                <p style="color: #999; font-size: 12px; margin: 0;">
                  — Yunchi Team
                </p>
              </div>
            </body>
            </html>
          `,
        });

        if (emailError) {
          console.error("Email error:", emailError);
        } else {
          emailSent = true;
          console.log("Welcome email sent to:", email);
        }
      } catch (err) {
        console.error("Error sending email:", err);
      }
    } else {
      console.log("RESEND_API_KEY not configured");
    }

    // Send Telegram welcome message
    if (profile?.telegram_chat_id) {
      const telegramMessage = `🎉 <b>Welcome to Yunchi Checker!</b>

Hello <b>${displayName}</b>! 👋

Your account has been created successfully.

📋 <b>Account Details:</b>
• Username: ${displayName}
• Email: ${email}
• Credits: 0

🚀 <b>Getting Started:</b>
1. Top up your balance via crypto
2. Explore available gateways
3. Start checking cards!

Need help? Use /help or contact @YunchiSupportbot

Happy checking! 🎯`;

      telegramSent = await sendTelegramMessage(profile.telegram_chat_id, telegramMessage);
    } else {
      console.log("No Telegram chat ID for user");
    }

    // Create in-app welcome notification
    await supabase.from("notifications").insert({
      user_id,
      type: "welcome",
      title: "Welcome to Yunchi! 🎉",
      message: `Hello ${displayName}! Your account is ready. Start by topping up your balance to begin checking cards.`,
      metadata: { action: "registration" }
    });

    return new Response(
      JSON.stringify({ success: true, emailSent, telegramSent }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-registration:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

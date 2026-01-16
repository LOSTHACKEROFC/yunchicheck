import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOTP(): string {
  // Generate a 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendTelegramMessage(
  chatId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return { success: false, error: "Bot not configured" };
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

    const data = await response.json();

    if (!response.ok) {
      console.error("Telegram API error:", data);
      return { success: false, error: data.description || "Failed to send message" };
    }

    console.log("Telegram OTP message sent successfully");
    return { success: true };
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return { success: false, error: "Network error" };
  }
}

async function sendEmailOTP(
  email: string,
  otp: string
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.log("Resend API key not configured");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    
    const { error } = await resend.emails.send({
      from: "Yunchi Security <onboarding@resend.dev>",
      to: [email],
      subject: "🔐 Password Reset OTP - Yunchi Checker",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">🔐 Password Reset</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
            <p style="font-size: 16px;">You requested a password reset for your Yunchi Checker account.</p>
            <div style="background: #262626; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0;">
              <p style="color: #a3a3a3; margin-bottom: 12px;">Your OTP code is:</p>
              <h2 style="color: #7c3aed; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h2>
            </div>
            <p style="color: #fca5a5; font-size: 14px; text-align: center; background: #3b1c1c; padding: 12px; border-radius: 6px;">
              ⏱️ This code will expire in <strong>2 minutes</strong>.
            </p>
            <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">
              If you didn't request this, please ignore this email and secure your account.
            </p>
            <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px; text-align: center;">
              — Yunchi Security Team
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: "Failed to send email" };
    }

    console.log("Email OTP sent successfully to:", email);
    return { success: true };
  } catch (error) {
    console.error("Error sending email OTP:", error);
    return { success: false, error: "Failed to send email" };
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received send-password-reset-otp request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find the user by email in auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error("Error listing users:", authError);
      return new Response(
        JSON.stringify({ error: "Failed to verify user" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const user = authData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      // Don't reveal that the email doesn't exist for security
      console.log("User not found for email:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If the email exists, an OTP has been sent" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get the user's profile to find their Telegram chat ID
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .eq("user_id", user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error("Error fetching profile:", profileError);
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now

    // Delete any existing OTPs for this user
    await supabase
      .from("password_reset_otps")
      .delete()
      .eq("user_id", user.id);

    // Create new OTP record
    const { error: insertError } = await supabase
      .from("password_reset_otps")
      .insert({
        user_id: user.id,
        email: email.toLowerCase(),
        telegram_chat_id: profile?.telegram_chat_id || null,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        verified: false,
        used: false,
      });

    if (insertError) {
      console.error("Error creating OTP record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create OTP" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send OTP via email
    const emailResult = await sendEmailOTP(email, otp);
    if (!emailResult.success) {
      console.error("Failed to send email OTP:", emailResult.error);
    }

    // Send OTP via Telegram if chat ID exists
    let telegramSent = false;
    if (profile?.telegram_chat_id) {
      const telegramMessage = `🔐 <b>Password Reset OTP</b>

Your OTP code for Yunchi Checker password reset:

<code>${otp}</code>

⚠️ This code expires in <b>2 minutes</b>.

If you didn't request this, please ignore this message and secure your account.`;

      const telegramResult = await sendTelegramMessage(profile.telegram_chat_id, telegramMessage);
      telegramSent = telegramResult.success;
      if (!telegramResult.success) {
        console.error("Failed to send Telegram OTP:", telegramResult.error);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "OTP sent successfully",
        hasTelegram: !!profile?.telegram_chat_id,
        telegramSent,
        emailSent: emailResult.success,
        expiresAt: expiresAt.toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in send-password-reset-otp:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

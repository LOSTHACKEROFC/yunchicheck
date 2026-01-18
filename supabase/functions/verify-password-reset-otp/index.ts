import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendPasswordChangedEmail(email: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("Resend API key not configured, skipping email notification");
    return false;
  }

  const resend = new Resend(RESEND_API_KEY);
  const senders = [
    "Yunchi Security <noreply@yunchicheck.com>",
    "Yunchi Security <onboarding@resend.dev>"
  ];

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

  for (const sender of senders) {
    try {
      console.log(`Sending password changed email from ${sender}`);
      const { error } = await resend.emails.send({
        from: sender,
        reply_to: "support@yunchicheck.com",
        to: [email],
        subject: "🔒 Password Changed - Yunchi",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">🔒 Password Changed</h1>
            </div>
            <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 16px 16px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
              <p style="font-size: 16px; line-height: 1.6;">Hello,</p>
              <p style="color: #a3a3a3; line-height: 1.6;">Your password for <strong style="color: #ef4444;">Yunchi Checker</strong> has been successfully changed.</p>
              
              <div style="background: #1a0a0a; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #2a1a1a;">
                <p style="color: #a3a3a3; margin: 0; font-size: 14px;">
                  <strong style="color: #e5e5e5;">Date & Time:</strong> ${formattedDate}
                </p>
              </div>
              
              <div style="background: #1a0a0a; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 8px;">
                <p style="color: #fca5a5; margin: 0; font-size: 14px; line-height: 1.6;">
                  <strong>⚠️ Security Notice:</strong> If you did not make this change, please contact our support immediately and secure your account.
                </p>
              </div>
              
              <p style="color: #a3a3a3; font-size: 14px; margin-top: 20px; line-height: 1.6;">
                For your security, we recommend:
              </p>
              <ul style="color: #737373; font-size: 14px; line-height: 2; padding-left: 20px;">
                <li>Using a strong, unique password</li>
                <li>Never sharing your password with anyone</li>
                <li>Enabling notifications for account activities</li>
              </ul>
              
              <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;">
              <p style="color: #525252; font-size: 12px; text-align: center;">
                This is an automated security notification from Yunchi Checker.<br>
                — Yunchi Security Team
              </p>
            </div>
          </div>
        `,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
          "X-Priority": "1",
          "Importance": "high",
        },
        tags: [
          { name: "category", value: "transactional" },
          { name: "type", value: "security" },
        ],
      });

      if (error) {
        const errorMessage = (error as any)?.message || '';
        console.error(`Error from ${sender}:`, error);
        
        if (errorMessage.includes('domain is not verified') || (error as any)?.statusCode === 403) {
          console.log("Domain not verified, trying fallback sender...");
          continue;
        }
        continue;
      }

      console.log(`Password changed email sent successfully via ${sender} to:`, email);
      return true;
    } catch (error) {
      console.error(`Error sending from ${sender}:`, error);
      continue;
    }
  }

  console.error("All email senders failed");
  return false;
}

async function sendPasswordChangedTelegram(chatId: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.log("Telegram not configured or no chat ID, skipping notification");
    return false;
  }

  try {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const message = `🔒 <b>Password Changed</b>

Your password for Yunchi Checker has been successfully changed.

📅 <b>Date:</b> ${formattedDate}

⚠️ <b>Security Notice:</b> If you did not make this change, please contact support immediately!`;

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

    console.log("Password changed Telegram notification sent to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received verify-password-reset-otp request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, otp, newPassword } = await req.json();

    if (!email || !otp) {
      return new Response(
        JSON.stringify({ error: "Email and OTP are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return new Response(
        JSON.stringify({ error: "Invalid OTP format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find the OTP record
    const { data: otpRecord, error: otpError } = await supabase
      .from("password_reset_otps")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("otp_code", otp)
      .eq("used", false)
      .single();

    if (otpError || !otpRecord) {
      console.log("OTP not found or already used for email:", email);
      return new Response(
        JSON.stringify({ error: "Invalid OTP code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if OTP is expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      console.log("OTP expired for email:", email);
      // Clean up expired OTP
      await supabase
        .from("password_reset_otps")
        .delete()
        .eq("id", otpRecord.id);

      return new Response(
        JSON.stringify({ error: "OTP has expired. Please request a new one." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // If no new password provided, just verify the OTP
    if (!newPassword) {
      // Mark OTP as verified
      await supabase
        .from("password_reset_otps")
        .update({ verified: true })
        .eq("id", otpRecord.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          verified: true,
          message: "OTP verified successfully",
          userId: otpRecord.user_id
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate password length
    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update the user's password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      otpRecord.user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update password" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark OTP as used
    await supabase
      .from("password_reset_otps")
      .update({ used: true, verified: true })
      .eq("id", otpRecord.id);

    console.log("Password updated successfully for:", otpRecord.email);

    // Send security notifications
    const emailSent = await sendPasswordChangedEmail(otpRecord.email);
    let telegramSent = false;
    if (otpRecord.telegram_chat_id) {
      telegramSent = await sendPasswordChangedTelegram(otpRecord.telegram_chat_id);
    }

    // Create in-app notification
    await supabase.from("notifications").insert({
      user_id: otpRecord.user_id,
      type: "security",
      title: "Password Changed",
      message: "Your account password was successfully changed. If you didn't make this change, please contact support immediately.",
      metadata: { action: "password_reset" }
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password updated successfully",
        userId: otpRecord.user_id,
        email: otpRecord.email,
        emailSent,
        telegramSent
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in verify-password-reset-otp:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

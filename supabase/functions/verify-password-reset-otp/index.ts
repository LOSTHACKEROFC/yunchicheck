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

async function sendPasswordChangedEmail(email: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log("Resend API key not configured, skipping email notification");
    return;
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
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

    await resend.emails.send({
      from: "Yunchi Checker <onboarding@resend.dev>",
      to: [email],
      subject: "🔒 Password Changed - Yunchi Checker",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🔒 Password Changed</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <p style="color: #333; font-size: 16px; line-height: 1.6;">Hello,</p>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Your password for <strong>Yunchi Checker</strong> has been successfully changed.
            </p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                <strong>Date & Time:</strong> ${formattedDate}
              </p>
            </div>
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
              <p style="color: #856404; margin: 0; font-size: 14px;">
                <strong>⚠️ Security Notice:</strong> If you did not make this change, please contact our support immediately and secure your account.
              </p>
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              For your security, we recommend:
            </p>
            <ul style="color: #666; font-size: 14px; line-height: 1.8;">
              <li>Using a strong, unique password</li>
              <li>Never sharing your password with anyone</li>
              <li>Enabling notifications for account activities</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              This is an automated security notification from Yunchi Checker.<br>
              If you have any questions, please contact our support team.
            </p>
          </div>
        </div>
      `,
    });

    console.log("Password changed email sent successfully to:", email);
  } catch (error) {
    console.error("Error sending password changed email:", error);
  }
}

async function sendPasswordChangedTelegram(chatId: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.log("Telegram not configured or no chat ID, skipping notification");
    return;
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

    await fetch(
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

    console.log("Password changed Telegram notification sent to:", chatId);
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
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
      console.log("OTP not found or already used");
      return new Response(
        JSON.stringify({ error: "Invalid OTP code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if OTP is expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      console.log("OTP expired");
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

    // Send security notifications (non-blocking)
    sendPasswordChangedEmail(otpRecord.email);
    if (otpRecord.telegram_chat_id) {
      sendPasswordChangedTelegram(otpRecord.telegram_chat_id);
    }

    console.log("Password updated successfully for:", otpRecord.email);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password updated successfully",
        userId: otpRecord.user_id,
        email: otpRecord.email
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
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check API key first
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      console.error("User verification failed:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userEmail = userData.user.email;
    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: "No email associated with account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP in database
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Delete any existing deletion OTPs for this user
    await adminClient
      .from("deletion_otps")
      .delete()
      .eq("user_id", userData.user.id);

    // Insert new OTP
    const { error: insertError } = await adminClient
      .from("deletion_otps")
      .insert({
        user_id: userData.user.id,
        email: userEmail,
        otp_hash: otp,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate verification code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email with OTP using Resend SDK
    const resend = new Resend(RESEND_API_KEY);
    
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Yunchi <noreply@yunchicheck.com>",
      reply_to: "support@yunchicheck.com",
      to: [userEmail],
      subject: "Account Deletion Verification Code - Yunchi",
      text: `You have requested to permanently delete your Yunchi account. This action cannot be undone.

Your verification code: ${otp}

This code will expire in 5 minutes.

If you did not request this, please ignore this email and secure your account immediately.

— Yunchi Security Team`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Account Deletion Request</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
            <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">
              You have requested to permanently delete your Yunchi account. This action cannot be undone.
            </p>
            <div style="background: #3b1c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
              <p style="color: #fca5a5; font-size: 14px; margin-bottom: 12px;">Your verification code:</p>
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #ef4444; margin: 0;">${otp}</p>
            </div>
            <p style="color: #a3a3a3; font-size: 14px;">
              This code will expire in <strong>5 minutes</strong>.
            </p>
            <p style="color: #a3a3a3; font-size: 14px;">
              If you did not request this, please ignore this email and secure your account immediately.
            </p>
            <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;" />
            <p style="color: #6b7280; font-size: 12px; text-align: center;">
              — Yunchi Security Team
            </p>
          </div>
        </div>
      `,
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
      },
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      // Still return success since OTP is stored, user can request resend
      return new Response(
        JSON.stringify({ success: true, message: "Verification code generated", emailWarning: "Email delivery may be delayed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Deletion OTP sent to:", userEmail, "Email ID:", emailData?.id);

    return new Response(
      JSON.stringify({ success: true, message: "Verification code sent to your email" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-deletion-otp:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

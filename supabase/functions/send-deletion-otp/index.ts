import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        otp_hash: otp, // In production, hash this
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
      throw new Error("Failed to generate verification code");
    }

    // Send email with OTP
    const emailResponse = await resend.emails.send({
      from: "Yunchi Security <onboarding@resend.dev>",
      to: [userEmail],
      subject: "⚠️ Account Deletion Verification Code",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc2626; margin-bottom: 24px;">Account Deletion Request</h1>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            You have requested to permanently delete your Yunchi account. This action cannot be undone.
          </p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="color: #991b1b; font-size: 14px; margin-bottom: 12px;">Your verification code:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #dc2626; margin: 0;">${otp}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            This code will expire in <strong>5 minutes</strong>.
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            If you did not request this, please ignore this email and secure your account immediately.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            — Yunchi Security Team
          </p>
        </div>
      `,
    });

    console.log("Deletion OTP sent to:", userEmail);

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

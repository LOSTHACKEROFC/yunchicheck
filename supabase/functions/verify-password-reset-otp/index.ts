import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Generate a session for auto-login
    // We need to use signInWithPassword but we don't have the old password
    // Instead, we'll return success and let the frontend handle login
    
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
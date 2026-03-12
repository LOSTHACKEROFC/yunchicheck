import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { verification_code, new_telegram_chat_id, user_id } = await req.json();

    if (!verification_code || !new_telegram_chat_id || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!/^[A-Z0-9]{6}$/.test(verification_code)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid verification code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!/^\d+$/.test(new_telegram_chat_id)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Telegram Chat ID format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // COOLDOWN CHECK
    const { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("telegram_changed_at")
      .eq("user_id", user_id)
      .single();

    if (profileError) {
      console.error("Error fetching user profile:", profileError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch user profile" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (userProfile?.telegram_changed_at) {
      const lastChange = new Date(userProfile.telegram_changed_at);
      const now = new Date();
      const hoursSinceChange = (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60);
      if (hoursSinceChange < 48) {
        const hoursRemaining = Math.ceil(48 - hoursSinceChange);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Cooldown active. You can change your Telegram ID again in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}.`,
            cooldownRemaining: hoursRemaining
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Check if Telegram ID already linked to another account
    const { data: existingProfile, error: existingError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("telegram_chat_id", new_telegram_chat_id)
      .neq("user_id", user_id)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing profile:", existingError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to validate Telegram ID" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (existingProfile) {
      return new Response(
        JSON.stringify({ success: false, error: "This Telegram ID is already linked to another account" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Look for ALL verifications for this chat ID first (for debugging)
    const { data: allVerifications } = await supabase
      .from("pending_verifications")
      .select("id, telegram_chat_id, verified, expires_at, email")
      .eq("telegram_chat_id", new_telegram_chat_id);

    console.log(`[CHANGE-TG] All verifications for chat ${new_telegram_chat_id}:`, JSON.stringify(allVerifications));

    // Now filter for valid ones
    const now = new Date().toISOString();
    const validVerifications = (allVerifications || []).filter(
      (v) => v.verified === true && v.expires_at > now
    );

    console.log(`[CHANGE-TG] Valid (verified + not expired) verifications: ${validVerifications.length}`);

    if (validVerifications.length === 0) {
      // Provide more specific error based on what we found
      if (!allVerifications || allVerifications.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "No verification record found. Please send the verification code to @YunchiSupportbot on Telegram first." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const hasUnverified = allVerifications.some((v) => v.verified === false);
      const hasExpired = allVerifications.some((v) => v.expires_at <= now);

      if (hasUnverified && !hasExpired) {
        return new Response(
          JSON.stringify({ success: false, error: "Verification pending. Please send the code to @YunchiSupportbot on Telegram to complete verification." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (hasExpired) {
        return new Response(
          JSON.stringify({ success: false, error: "Verification expired. Please request a new verification code and try again." }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "No valid verification found. Please verify via Telegram first." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch full verification_code for matching (service role bypasses RLS)
    const { data: fullVerifications } = await supabase
      .from("pending_verifications")
      .select("*")
      .eq("telegram_chat_id", new_telegram_chat_id)
      .eq("verified", true)
      .gt("expires_at", now);

    // Use constant-time comparison to find matching verification code
    let matchedVerification = null;
    for (const v of (fullVerifications || [])) {
      if (timingSafeEqual(v.verification_code.toUpperCase(), verification_code.toUpperCase())) {
        matchedVerification = v;
        break;
      }
    }

    if (!matchedVerification) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid verification code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update user profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: new_telegram_chat_id,
        telegram_username: null,
        telegram_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to update Telegram ID" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Clean up used verification
    await supabase
      .from("pending_verifications")
      .delete()
      .eq("id", matchedVerification.id);

    console.log(`[CHANGE-TG] Successfully changed Telegram ID for user ${user_id} to ${new_telegram_chat_id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Telegram ID updated successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in change-telegram-id:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to maintain constant time
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

const handler = async (req: Request): Promise<Response> => {
  console.log("Received change-telegram-id request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { verification_code, new_telegram_chat_id, user_id } = await req.json();

    // Validate required fields
    if (!verification_code || !new_telegram_chat_id || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate verification code format (6 alphanumeric uppercase)
    if (!/^[A-Z0-9]{6}$/.test(verification_code)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid verification code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate Telegram Chat ID format (numeric only)
    if (!/^\d+$/.test(new_telegram_chat_id)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid Telegram Chat ID format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if this Telegram ID is already linked to another account
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

    // Get all active (non-expired) verifications for this Telegram ID
    const { data: verifications, error: verifyError } = await supabase
      .from("pending_verifications")
      .select("*")
      .eq("telegram_chat_id", new_telegram_chat_id)
      .eq("verified", true)
      .gt("expires_at", new Date().toISOString());

    if (verifyError) {
      console.error("Error fetching verifications:", verifyError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to verify code" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!verifications || verifications.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid verification found. Please verify via Telegram first." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use constant-time comparison to find matching verification code
    let matchedVerification = null;
    for (const v of verifications) {
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

    // Verification is valid - update the user's profile with new Telegram ID
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: new_telegram_chat_id,
        telegram_username: null, // Will be updated by the bot on next interaction
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

    // Clean up the used verification
    await supabase
      .from("pending_verifications")
      .delete()
      .eq("id", matchedVerification.id);

    console.log(`Successfully changed Telegram ID for user ${user_id} to ${new_telegram_chat_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Telegram ID updated successfully" 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in change-telegram-id:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

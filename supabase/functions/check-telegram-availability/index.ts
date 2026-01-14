import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { telegramChatId } = await req.json();

    if (!telegramChatId) {
      return new Response(
        JSON.stringify({ error: "Telegram Chat ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate that it looks like a valid chat ID (numeric)
    if (!/^\d+$/.test(telegramChatId)) {
      return new Response(
        JSON.stringify({ error: "Invalid Telegram Chat ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to check availability (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if the Telegram ID is already linked to a profile
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("telegram_chat_id", telegramChatId)
      .maybeSingle();

    if (profileError) {
      console.error("Error checking Telegram ID:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to check Telegram ID availability" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingProfile) {
      return new Response(
        JSON.stringify({ 
          available: false, 
          message: "This Telegram ID is already linked to another account" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also check pending verifications to prevent race conditions
    const { data: pendingVerification, error: pendingError } = await supabaseAdmin
      .from("pending_verifications")
      .select("id, expires_at")
      .eq("telegram_chat_id", telegramChatId)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (pendingError) {
      console.error("Error checking pending verifications:", pendingError);
      // Don't fail the request, just log the error
    }

    // If there's an active pending verification, still allow (same user might retry)
    return new Response(
      JSON.stringify({ 
        available: true,
        hasPendingVerification: !!pendingVerification
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in check-telegram-availability:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

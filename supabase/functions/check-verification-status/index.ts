import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Received check-verification-status request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { verification_code } = await req.json();

    if (!verification_code) {
      return new Response(
        JSON.stringify({ error: "Verification code is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate verification code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(verification_code)) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query pending verification using service role (bypasses RLS)
    const { data, error } = await supabase
      .from("pending_verifications")
      .select("verified, expires_at")
      .eq("verification_code", verification_code)
      .single();

    if (error) {
      console.error("Error checking verification:", error);
      // Don't reveal whether code exists or not
      return new Response(
        JSON.stringify({ verified: false, expired: false, found: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isExpired = new Date(data.expires_at) < new Date();

    return new Response(
      JSON.stringify({ 
        verified: data.verified,
        expired: isExpired,
        found: true
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in check-verification-status:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

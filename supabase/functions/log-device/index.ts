import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fingerprint, user_id } = await req.json();

    if (!fingerprint || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing fingerprint or user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get IP and user agent from headers
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
               req.headers.get("x-real-ip") || 
               null;
    const userAgent = req.headers.get("user-agent") || null;

    console.log("Logging device for user:", user_id, "fingerprint:", fingerprint?.slice(0, 8), "IP:", ip);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert device log - update last_seen if exists, insert if new
    const { error } = await supabase
      .from("user_device_logs")
      .upsert(
        {
          user_id,
          fingerprint,
          ip_address: ip,
          user_agent: userAgent,
          last_seen: new Date().toISOString(),
        },
        {
          onConflict: "user_id,fingerprint",
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error("Error logging device:", error);
      return new Response(
        JSON.stringify({ error: "Failed to log device" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Device logged successfully");
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in log-device:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

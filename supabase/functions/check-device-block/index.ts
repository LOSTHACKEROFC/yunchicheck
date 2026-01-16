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
    const { fingerprint } = await req.json();
    
    // Get IP from headers
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
               req.headers.get("x-real-ip") || 
               "unknown";

    console.log("Checking device block for fingerprint:", fingerprint?.slice(0, 8), "IP:", ip);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if fingerprint is blocked
    if (fingerprint) {
      const { data: fingerprintBlock } = await supabase
        .from("blocked_devices")
        .select("id, reason, banned_user_id")
        .eq("fingerprint", fingerprint)
        .eq("is_active", true)
        .maybeSingle();

      if (fingerprintBlock) {
        console.log("Device blocked by fingerprint:", fingerprint?.slice(0, 8));
        return new Response(
          JSON.stringify({ 
            blocked: true, 
            reason: "device",
            message: "This device has been blocked"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if IP is blocked
    if (ip && ip !== "unknown") {
      const { data: ipBlock } = await supabase
        .from("blocked_devices")
        .select("id, reason, banned_user_id")
        .eq("ip_address", ip)
        .eq("is_active", true)
        .maybeSingle();

      if (ipBlock) {
        console.log("Device blocked by IP:", ip);
        return new Response(
          JSON.stringify({ 
            blocked: true, 
            reason: "ip",
            message: "This network has been blocked"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log("Device not blocked");
    return new Response(
      JSON.stringify({ blocked: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking device block:", error);
    return new Response(
      JSON.stringify({ blocked: false, error: "Check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

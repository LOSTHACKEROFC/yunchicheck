import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SessionData {
  browser?: string;
  os?: string;
  device_info?: string;
  session_token: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Use service role client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify token using getClaims (works with signing-keys system)
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Invalid token", code: "AUTH_FAILED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    const { browser, os, device_info, session_token }: SessionData = await req.json();

    // Get IP address from headers
    const ip_address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                       req.headers.get("x-real-ip") || 
                       "Unknown";

    // Mark all existing sessions as not current
    await supabaseAdmin
      .from("user_sessions")
      .update({ is_current: false })
      .eq("user_id", userId);

    // Check if session already exists
    const { data: existingSession } = await supabaseAdmin
      .from("user_sessions")
      .select("id")
      .eq("session_token", session_token)
      .maybeSingle();

    if (existingSession) {
      // Update existing session
      await supabaseAdmin
        .from("user_sessions")
        .update({
          is_current: true,
          last_active: new Date().toISOString(),
          ip_address,
          browser,
          os,
          device_info,
        })
        .eq("id", existingSession.id);
    } else {
      // Create new session
      await supabaseAdmin
        .from("user_sessions")
        .insert({
          user_id: userId,
          session_token,
          browser,
          os,
          device_info,
          ip_address,
          is_current: true,
        });
    }

    // Clean up old sessions (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    await supabaseAdmin
      .from("user_sessions")
      .delete()
      .eq("user_id", userId)
      .lt("last_active", thirtyDaysAgo.toISOString());

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error tracking session:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

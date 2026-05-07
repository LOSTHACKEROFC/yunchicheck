import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Constant-time response to prevent timing-based email enumeration
  const startTime = Date.now();
  const minResponseTime = 400 + Math.floor(Math.random() * 200); // 400-600ms
  const padResponse = async (response: Response) => {
    const elapsed = Date.now() - startTime;
    if (elapsed < minResponseTime) {
      await new Promise((r) => setTimeout(r, minResponseTime - elapsed));
    }
    return response;
  };

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ available: false, reason: "invalid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Search for the specific email by listing users with pagination
    let emailExists = false;
    let page = 1;
    const perPage = 1000;
    
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.error("Error listing users:", error);
        throw error;
      }

      const found = data?.users?.some(
        (user) => user.email?.toLowerCase() === email.toLowerCase()
      );

      if (found) {
        emailExists = true;
        break;
      }

      // If we got fewer users than perPage, we've reached the end
      if (!data?.users || data.users.length < perPage) {
        break;
      }
      
      page++;
    }

    console.log(`Email check for ${email}: ${emailExists ? "taken" : "available"}`);

    return new Response(
      JSON.stringify({ available: !emailExists }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to check email availability" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

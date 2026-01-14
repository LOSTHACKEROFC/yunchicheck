import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Check if email exists in auth.users
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1,
    });

    if (error) {
      console.error("Error listing users:", error);
      throw error;
    }

    // Use getUserByEmail for more precise check
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(email);
    
    // getUserById won't work with email, so we need a different approach
    // Let's search through users or use a different method
    
    // Actually, the best approach is to try to get user by email
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    
    const emailExists = users?.users?.some(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );

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

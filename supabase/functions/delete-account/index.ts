import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to get their ID
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user and get their ID
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.user.id;
    console.log(`Deleting account for user: ${userId}`);

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete all user data in order (respecting foreign keys)
    
    // 1. Delete notification reads and deleted notifications
    await adminClient.from("notification_reads").delete().eq("user_id", userId);
    await adminClient.from("deleted_notifications").delete().eq("user_id", userId);
    
    // 2. Delete notifications
    await adminClient.from("notifications").delete().eq("user_id", userId);

    // 3. Get user's ticket IDs first
    const { data: tickets } = await adminClient
      .from("support_tickets")
      .select("id")
      .eq("user_id", userId);

    // 4. Delete ticket messages
    if (tickets && tickets.length > 0) {
      const ticketIds = tickets.map(t => t.id);
      await adminClient.from("ticket_messages").delete().in("ticket_id", ticketIds);
    }

    // 5. Delete support tickets
    await adminClient.from("support_tickets").delete().eq("user_id", userId);

    // 6. Delete card checks
    await adminClient.from("card_checks").delete().eq("user_id", userId);

    // 7. Delete profile
    await adminClient.from("profiles").delete().eq("user_id", userId);

    // 8. Delete the auth user (this will cascade delete sessions, etc.)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      return new Response(
        JSON.stringify({ error: "Failed to delete authentication record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted account for user: ${userId}`);

    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in delete-account function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

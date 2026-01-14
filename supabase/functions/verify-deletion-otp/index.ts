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

    const { otp } = await req.json();
    if (!otp || otp.length !== 6) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Find the OTP record
    const { data: otpRecord, error: otpError } = await adminClient
      .from("deletion_otps")
      .select("*")
      .eq("user_id", userId)
      .eq("otp_hash", otp)
      .single();

    if (otpError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      // Delete expired OTP
      await adminClient.from("deletion_otps").delete().eq("id", otpRecord.id);
      return new Response(
        JSON.stringify({ error: "Verification code has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`OTP verified for user: ${userId}. Proceeding with account deletion...`);

    // Delete all user data in order (respecting foreign keys)
    
    // 1. Delete deletion OTPs first
    await adminClient.from("deletion_otps").delete().eq("user_id", userId);
    
    // 2. Delete notification reads and deleted notifications
    await adminClient.from("notification_reads").delete().eq("user_id", userId);
    await adminClient.from("deleted_notifications").delete().eq("user_id", userId);
    
    // 3. Delete notifications
    await adminClient.from("notifications").delete().eq("user_id", userId);

    // 4. Get user's ticket IDs first
    const { data: tickets } = await adminClient
      .from("support_tickets")
      .select("id")
      .eq("user_id", userId);

    // 5. Delete ticket messages
    if (tickets && tickets.length > 0) {
      const ticketIds = tickets.map(t => t.id);
      await adminClient.from("ticket_messages").delete().in("ticket_id", ticketIds);
    }

    // 6. Delete support tickets
    await adminClient.from("support_tickets").delete().eq("user_id", userId);

    // 7. Delete card checks
    await adminClient.from("card_checks").delete().eq("user_id", userId);

    // 8. Delete user sessions
    await adminClient.from("user_sessions").delete().eq("user_id", userId);

    // 9. Delete profile
    await adminClient.from("profiles").delete().eq("user_id", userId);

    // 10. Delete the auth user (this will cascade delete sessions, etc.)
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
      JSON.stringify({ success: true, deleted: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-deletion-otp:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

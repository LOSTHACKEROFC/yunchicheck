import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find all pending_bulk_checks rows that have state_json (active mtxt sessions)
    // and haven't been updated in over 60 seconds (heartbeat should fire every 4s).
    const staleThreshold = new Date(Date.now() - 60_000).toISOString();

    const { data: staleSessions, error } = await supabase
      .from("pending_bulk_checks")
      .select("id, chat_id, message_id, state_json, updated_at")
      .not("state_json", "is", null)
      .lt("updated_at", staleThreshold);

    if (error) {
      console.error("[WATCHDOG] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!staleSessions || staleSessions.length === 0) {
      return new Response(JSON.stringify({ ok: true, resumed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[WATCHDOG] Found ${staleSessions.length} stale session(s)`);

    let resumed = 0;
    for (const session of staleSessions) {
      try {
        // Parse state to check if it's actually running
        const state = JSON.parse(session.state_json);
        if (state.status !== "running") {
          // Clean up completed/stopped sessions
          await supabase.from("pending_bulk_checks").delete().eq("id", session.id);
          continue;
        }

        console.log(`[WATCHDOG] Resuming session ${session.id}, last updated: ${session.updated_at}`);

        // Touch updated_at to prevent double-resume
        await supabase
          .from("pending_bulk_checks")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", session.id);

        // Trigger the webhook with a resume callback
        const resumePayload = {
          callback_query: {
            id: `watchdog_${Date.now()}`,
            from: { id: parseInt(session.chat_id) || 0, is_bot: false, first_name: "Watchdog" },
            message: {
              message_id: session.message_id || 0,
              from: { id: 0, is_bot: true, first_name: "Bot" },
              chat: { id: parseInt(session.chat_id), type: "private" },
              date: Math.floor(Date.now() / 1000),
              text: "",
            },
            chat_instance: "watchdog",
            data: `mtxt_resume_${session.id}`,
          },
        };

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/telegram-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(resumePayload),
        });

        if (resp.ok) {
          resumed++;
          console.log(`[WATCHDOG] Successfully triggered resume for ${session.id}`);
        } else {
          console.error(`[WATCHDOG] Resume trigger failed for ${session.id}: ${resp.status}`);
        }
      } catch (sessionError) {
        console.error(`[WATCHDOG] Error processing session ${session.id}:`, sessionError);
      }
    }

    return new Response(JSON.stringify({ ok: true, resumed, total: staleSessions.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[WATCHDOG] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

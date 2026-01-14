import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );
    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

async function sendUnbanEmail(email: string, username: string | null): Promise<void> {
  if (!RESEND_API_KEY) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Yunchi Support <onboarding@resend.dev>",
        to: [email],
        subject: "✅ Your Ban Has Expired - Account Restored",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">✅ Ban Expired - Account Restored</h2>
            <p>Hello${username ? ` ${username}` : ''},</p>
            <p>Your temporary ban has expired and your account has been automatically restored.</p>
            <p>You can now log in and use the platform again.</p>
            <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
              Please ensure you follow our terms of service to avoid future bans.
            </p>
            <p style="color: #6c757d; font-size: 14px;">— Yunchi Team</p>
          </div>
        `,
      }),
    });
  } catch (error) {
    console.error("Error sending unban email:", error);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Running auto-unban check...");
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find all users whose ban has expired
    const { data: expiredBans, error } = await supabase
      .from("profiles")
      .select("user_id, username, telegram_chat_id, banned_until")
      .eq("is_banned", true)
      .not("banned_until", "is", null)
      .lt("banned_until", new Date().toISOString());

    if (error) {
      console.error("Error fetching expired bans:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch expired bans" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expiredBans || expiredBans.length === 0) {
      console.log("No expired bans found");
      return new Response(
        JSON.stringify({ message: "No expired bans", unbanned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${expiredBans.length} expired bans to process`);

    let unbannedCount = 0;

    for (const profile of expiredBans) {
      // Unban the user
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          is_banned: false,
          banned_at: null,
          ban_reason: null,
          banned_until: null,
        })
        .eq("user_id", profile.user_id);

      if (updateError) {
        console.error(`Failed to unban user ${profile.user_id}:`, updateError);
        continue;
      }

      unbannedCount++;
      console.log(`Unbanned user: ${profile.username || profile.user_id}`);

      // Get user email
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const authUser = authUsers?.users?.find((u: any) => u.id === profile.user_id);

      // Send notifications
      if (profile.telegram_chat_id) {
        await sendTelegramMessage(
          profile.telegram_chat_id,
          `✅ <b>Ban Expired - Account Restored</b>\n\nYour temporary ban has expired and your account has been automatically restored.\n\nYou can now log in and use the platform again.`
        );
      }

      if (authUser?.email) {
        await sendUnbanEmail(authUser.email, profile.username);
      }
    }

    console.log(`Auto-unban complete. Unbanned ${unbannedCount} users.`);

    return new Response(
      JSON.stringify({ message: "Auto-unban complete", unbanned: unbannedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in auto-unban function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

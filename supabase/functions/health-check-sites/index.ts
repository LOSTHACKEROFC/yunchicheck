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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin
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

    // Check admin role
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

    // Process URLs in parallel batches based on thread count
    const concurrency = Math.min(Math.max(threads, 1), 20); // Cap at 20 threads
    const results: Array<{ url: string; status: string; price: number; priceStr: string; error?: string }> = [];
    let savedCount = 0;

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(async (siteUrl: string) => {
          try {
            const proxyStr = getProxyStr();
            const apiUrl = `http://188.137.230.163:5000/shopify?site=${siteUrl}&cc=${TEST_CC}&proxy=${proxyStr}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(apiUrl, {
              method: "GET",
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json,*/*",
              },
            });

            clearTimeout(timeoutId);
            const responseText = await response.text();

            if (!response.ok || !responseText) {
              return { url: siteUrl, status: "dead", price: 0, priceStr: "$0.00", error: "No response" };
            }

            const { price, priceStr } = extractPrice(responseText);

            if (price > 0) {
              // Upsert valid site into gateway_urls
              await supabase.from("gateway_urls").upsert({ url: siteUrl }, { onConflict: "url", ignoreDuplicates: true });
              return { url: siteUrl, status: "live", price, priceStr };
            }

            return { url: siteUrl, status: "dead", price, priceStr };
          } catch (error) {
            return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: error instanceof Error ? error.message : "Unknown error" };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          if (result.value.status === "live") savedCount++;
        } else {
          results.push({ url: "unknown", status: "error", price: 0, priceStr: "$0.00", error: "Promise rejected" });
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

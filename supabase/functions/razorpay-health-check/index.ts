import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Random demo cards for health checking — will always decline but tests if the site/merchant is alive
const DEMO_CARDS = [
  "4000000000000002|12|28|123",
  "4000000000000069|03|29|456",
  "4000000000000127|06|27|789",
  "4000000000000010|09|28|321",
  "4000000000000028|01|29|654",
  "4242424242424242|08|27|111",
  "4000000000000101|11|28|222",
  "4000000000000036|05|29|333",
];

const API_BASE_URL = "https://razorpay-production-4fdd.up.railway.app/razorpay";

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Fatal responses that indicate the site is permanently dead
const fatalResponses = [
  'merchant extraction failed',
  'missing merchant fields',
  'payment page expired',
  'page has expired',
  'account is not activated',
  'not activated',
  'page not found',
  '404',
  'invalid payment link',
  'international cards are not supported',
  'international card',
  'international transactions',
];

interface CheckResult {
  url: string;
  status: "live" | "dead" | "error";
  message: string;
  rawResponse: string;
}

const checkSingleSite = async (
  siteUrl: string,
  supabase: ReturnType<typeof createClient>,
): Promise<CheckResult> => {
  const maxAttempts = 2;
  const timeoutMs = 55000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const demoCC = getRandomItem(DEMO_CARDS);
      const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(demoCC)}&site=${encodeURIComponent(siteUrl)}`;
      const userAgent = getRandomItem(userAgents);

      console.log(`[Attempt ${attempt + 1}] Checking: ${siteUrl}`);

      const response = await fetch(apiUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Accept": "application/json, text/plain, */*",
          "User-Agent": userAgent,
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
        // Empty response = dead site, remove it
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        return { url: siteUrl, status: "dead", message: "Empty response", rawResponse: "" };
      }

      const rawLower = rawText.toLowerCase();

      // Check for fatal responses — site is permanently broken
      const isFatal = fatalResponses.some(f => rawLower.includes(f));
      if (isFatal) {
        await supabase.from("gateway_urls").delete().eq("url", siteUrl);
        console.log(`[Result] ${siteUrl} → DEAD (fatal response)`);
        const truncated = rawText.length > 500 ? rawText.substring(0, 500) + "..." : rawText;
        return { url: siteUrl, status: "dead", message: "Fatal: site broken/expired", rawResponse: truncated };
      }

      // Try to parse JSON
      let message = rawText;
      let isLive = false;

      try {
        const json = JSON.parse(rawText);
        message = json.message || json.msg || json.error || rawText;

        // If we get a proper decline or OTP response, the site IS alive
        // success: false with a decline message = merchant is active
        // otpReached: true = merchant is active (3DS triggered)
        // success: true = merchant is active (charged)
        if (json.success === true || json.success === false || json.otpReached === true) {
          isLive = true;
        }
      } catch {
        // Text response fallback
        if (rawLower.includes('declined') || rawLower.includes('charged') || rawLower.includes('success') || rawLower.includes('otp') || rawLower.includes('3ds') || rawLower.includes('insufficient') || rawLower.includes('do not honor') || rawLower.includes('card number is not valid') || rawLower.includes('authentication required')) {
          isLive = true;
        }
      }

      const truncated = rawText.length > 500 ? rawText.substring(0, 500) + "..." : rawText;

      if (isLive) {
        // Make sure it's saved in the database
        await supabase.from("gateway_urls").upsert({ url: siteUrl, price: 0 }, { onConflict: "url" });
        console.log(`[Result] ${siteUrl} → LIVE`);
        return { url: siteUrl, status: "live", message, rawResponse: truncated };
      }

      // Unknown/unrecognized response
      console.log(`[Result] ${siteUrl} → DEAD (unrecognized response)`);
      return { url: siteUrl, status: "dead", message, rawResponse: truncated };

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.log(`[Attempt ${attempt + 1}] Error for ${siteUrl}: ${msg}`);
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return { url: siteUrl, status: "error", message: msg, rawResponse: "" };
    }
  }

  return { url: siteUrl, status: "error", message: "All attempts failed", rawResponse: "" };
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

    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: "No URLs provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter to only razorpay.me URLs
    const validUrls = urls.filter((u: string) => u.startsWith("https://razorpay.me/"));

    if (validUrls.length === 0) {
      return new Response(JSON.stringify({ error: "No valid razorpay.me URLs" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: CheckResult[] = [];
    let liveCount = 0;

    for (const siteUrl of validUrls) {
      const result = await checkSingleSite(siteUrl, supabase);
      results.push(result);
      if (result.status === "live") liveCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: validUrls.length,
        live: liveCount,
        dead: results.filter(r => r.status === "dead").length,
        errors: results.filter(r => r.status === "error").length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Razorpay health check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Determine status from VBV API response
const getStatusFromResponse = (data: Record<string, unknown>): { status: "passed" | "rejected" | "unknown", threeDStatus: string } => {
  try {
    const threeDSecureInfo = data?.threeDSecureInfo as Record<string, unknown> | undefined;
    
    if (!threeDSecureInfo) {
      console.log('[VBV-AUTH] No threeDSecureInfo in response');
      return { status: "rejected", threeDStatus: "missing" };
    }

    const liabilityShifted = threeDSecureInfo.liabilityShifted;
    const liabilityShiftPossible = threeDSecureInfo.liabilityShiftPossible;
    const threeDStatus = String(threeDSecureInfo.status || 'unknown');

    console.log('[VBV-AUTH] 3DS Info:', {
      liabilityShifted,
      liabilityShiftPossible,
      status: threeDStatus
    });

    // PASSED: All three conditions must be true
    if (
      liabilityShifted === true &&
      liabilityShiftPossible === true &&
      threeDStatus === "authenticate_successful"
    ) {
      return { status: "passed", threeDStatus };
    }

    // REJECTED: Any condition is false or missing
    return { status: "rejected", threeDStatus };
  } catch (error) {
    console.error('[VBV-AUTH] Error parsing response:', error);
    return { status: "unknown", threeDStatus: "error" };
  }
};

// Perform API check with retry logic
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  const apiUrl = `http://vbv-production.up.railway.app/api?cc=${encodeURIComponent(cc)}`;
  
  console.log(`[VBV-AUTH] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    const response = await fetch(apiUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[VBV-AUTH] Attempt ${attempt} - Raw API response:`, rawText.substring(0, 500));

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.log('[VBV-AUTH] Failed to parse JSON response');
      data = { raw: rawText, error: "Invalid JSON response" };
    }

    console.log(`[VBV-AUTH] Attempt ${attempt} - Parsed response:`, JSON.stringify(data).substring(0, 500));

    const { status: computedStatus, threeDStatus } = getStatusFromResponse(data);
    
    // Build API message with 3DS status
    const threeDSecureInfo = data?.threeDSecureInfo as Record<string, unknown> | undefined;
    let apiMessage = '';
    
    if (threeDSecureInfo) {
      const shifted = threeDSecureInfo.liabilityShifted === true ? '✓' : '✗';
      const possible = threeDSecureInfo.liabilityShiftPossible === true ? '✓' : '✗';
      apiMessage = `3DS: ${threeDStatus} | Shifted: ${shifted} | Possible: ${possible}`;
    } else if (data?.message) {
      apiMessage = String(data.message);
    } else if (data?.error) {
      apiMessage = String(data.error);
    } else {
      apiMessage = 'No 3DS response';
    }

    // Retry on unknown if we haven't exhausted retries
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[VBV-AUTH] UNKNOWN response on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    return {
      computedStatus,
      apiStatus: computedStatus.toUpperCase(),
      apiMessage,
      threeDStatus,
      threeDSecureInfo: threeDSecureInfo || null
    };
  } catch (error) {
    console.error(`[VBV-AUTH] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[VBV-AUTH] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    const errorMessage = error instanceof Error ? error.message : "Unknown fetch error";
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');
    
    return { 
      apiStatus: "ERROR",
      apiMessage: isTimeout ? "API timeout (50s)" : errorMessage,
      computedStatus: "unknown",
      threeDStatus: "error"
    };
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // REQUIRE AUTHENTICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // VERIFY USER TOKEN
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CHECK USER IS NOT BANNED
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(
        JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { cc } = await req.json();
    
    if (!cc) {
      return new Response(
        JSON.stringify({ 
          error: 'Card data (cc) is required', 
          computedStatus: 'unknown',
          apiStatus: 'ERROR',
          apiMessage: 'Card data (cc) is required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userAgent = getRandomUserAgent();
    console.log('[VBV-AUTH] Checking card for user:', user.id);
    console.log('[VBV-AUTH] Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VBV-AUTH] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage, 
        status: "ERROR",
        computedStatus: "unknown",
        apiStatus: "ERROR",
        apiMessage: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

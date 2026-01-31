import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const API_BASE_URL = "https://tba-bike-internet-different.trycloudflare.com/api";

// Extract plain text from formHTML (strip HTML tags and clean up)
const extractPlainText = (html: string): string => {
  if (!html) return "No response message";
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text || "No response message";
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
    console.log(`[PWGATE] Raw response: ${rawText}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response', rawResponse: '' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = 'No response message';
    
    try {
      const json = JSON.parse(rawText);
      
      // Check result.success - if 0 then DECLINED, any other value is CHARGED
      if (json.result !== undefined) {
        if (json.result.success === 0) {
          apiStatus = 'dead';
        } else {
          apiStatus = 'live';
        }
        
        // Extract message from result.secure.formHTML
        if (json.result.secure && json.result.secure.formHTML) {
          apiMessage = extractPlainText(json.result.secure.formHTML);
        } else if (json.result.message) {
          apiMessage = json.result.message;
        } else if (json.message) {
          apiMessage = json.message;
        }
      } else {
        // Fallback: try to detect from other fields
        apiMessage = json.message || json.msg || rawText;
        const lower = String(apiMessage).toLowerCase();
        if (lower.includes('declined') || lower.includes('failed') || lower.includes('error')) {
          apiStatus = 'dead';
        } else if (lower.includes('success') || lower.includes('charged') || lower.includes('approved')) {
          apiStatus = 'live';
        }
      }
    } catch {
      // Non-JSON response
      const lower = rawText.toLowerCase();
      if (lower.includes('declined') || lower.includes('failed')) apiStatus = 'dead';
      else if (lower.includes('charged') || lower.includes('success')) apiStatus = 'live';
      apiMessage = rawText.substring(0, 200);
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
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
    
    return new Response(
      JSON.stringify({
        computedStatus: result.status,
        apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
        apiMessage: result.message,
        apiTotal: '$10.00',
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

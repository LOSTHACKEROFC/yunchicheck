import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log(`PayU Check - Amount: ₹${chargeAmount}, Card: ${cc.substring(0, 6)}****`);

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
    
    if (lowerResponse.includes("success") || 
        lowerResponse.includes("approved") || 
        lowerResponse.includes("charged") ||
        lowerResponse.includes("payment successful") ||
        lowerResponse.includes("transaction successful")) {
      status = "live";
    } else if (lowerResponse.includes("declined") || 
               lowerResponse.includes("failed") || 
               lowerResponse.includes("invalid") ||
               lowerResponse.includes("insufficient") ||
               lowerResponse.includes("expired") ||
               lowerResponse.includes("error") ||
               lowerResponse.includes("rejected")) {
      status = "dead";
    }

    // Try to extract message from JSON response
    if (data && typeof data === 'object') {
      if (data.message) apiMessage = data.message;
      else if (data.status) apiMessage = data.status;
      else if (data.result) apiMessage = data.result;
      else if (data.error) apiMessage = data.error;
    }

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

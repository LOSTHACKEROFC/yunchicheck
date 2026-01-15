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
    const { cc } = await req.json();
    
    if (!cc) {
      return new Response(
        JSON.stringify({ error: 'Card data (cc) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking card:', cc);

    // Call the external API with the raw card format (no URL encoding for pipes)
    const apiUrl = `https://stripe-auth-api-production.up.railway.app/api?cc=${cc}`;
    console.log('Calling API:', apiUrl);

    const response = await fetch(apiUrl);
    const rawText = await response.text();
    console.log('Raw API response:', rawText);

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // If not JSON, return raw text
      data = { raw: rawText, status: "ERROR" };
    }

    console.log('Parsed response:', data);

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

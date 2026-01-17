import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "8496943061";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BinInfo {
  brand: string;
  type: string;
  level: string;
  bank: string;
  country: string;
  countryCode: string;
}

interface ChargedCardRequest {
  user_id: string;
  card_details: string; // Format: cardnum|mm|yy|cvv
  status: "CHARGED" | "DECLINED" | "UNKNOWN";
  response_message: string;
  amount: string;
  gateway: string;
  api_response?: string; // Raw API response for debugging
}

// Get country flag emoji from country code
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) {
    return '🌍';
  }
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Get card brand emoji
function getBrandEmoji(brand: string): string {
  const brandEmojis: Record<string, string> = {
    'VISA': '💳',
    'MASTERCARD': '💳',
    'AMEX': '💎',
    'AMERICAN EXPRESS': '💎',
    'DISCOVER': '🔍',
    'JCB': '🎌',
    'UNIONPAY': '🇨🇳',
    'DINERS CLUB': '🍽️',
    'MAESTRO': '🎵',
  };
  return brandEmojis[brand?.toUpperCase()] || '💳';
}

// Lookup BIN information
async function lookupBin(bin: string): Promise<BinInfo> {
  const defaultInfo: BinInfo = {
    brand: "Unknown",
    type: "Unknown",
    level: "Standard",
    bank: "Unknown Bank",
    country: "Unknown",
    countryCode: "XX",
  };

  try {
    const response = await fetch(`https://lookup.binlist.net/${bin.slice(0, 8)}`, {
      headers: { 'Accept-Version': '3' },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        brand: data.scheme?.toUpperCase() || "Unknown",
        type: data.type?.charAt(0).toUpperCase() + data.type?.slice(1) || "Unknown",
        level: data.brand || "Standard",
        bank: data.bank?.name || "Unknown Bank",
        country: data.country?.name || "Unknown",
        countryCode: data.country?.alpha2 || "XX",
      };
    }
  } catch (error) {
    console.error("BIN lookup error:", error);
  }

  // Fallback detection
  if (/^4/.test(bin)) {
    defaultInfo.brand = "VISA";
  } else if (/^5[1-5]/.test(bin) || /^2[2-7]/.test(bin)) {
    defaultInfo.brand = "MASTERCARD";
  } else if (/^3[47]/.test(bin)) {
    defaultInfo.brand = "AMEX";
  } else if (/^6(?:011|5|4[4-9]|22)/.test(bin)) {
    defaultInfo.brand = "DISCOVER";
  }

  return defaultInfo;
}

// Send Telegram message
async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
      return false;
    }

    console.log("Telegram notification sent successfully to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: ChargedCardRequest = await req.json();
    const { user_id, card_details, status, response_message, amount, gateway, api_response } = requestData;

    console.log("[NOTIFY-CHARGED] Processing notification:", { user_id, status, gateway });

    if (!user_id || !card_details || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's Telegram chat ID and username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_chat_id, username')
      .eq('user_id', user_id)
      .single();

    // Parse card details
    const [cardNum, mm, yy, cvv] = card_details.split('|');
    const bin = cardNum?.slice(0, 6) || '';
    const last4 = cardNum?.slice(-4) || '****';

    // Lookup BIN information
    const binInfo = await lookupBin(bin);
    const countryFlag = getCountryFlag(binInfo.countryCode);
    const brandEmoji = getBrandEmoji(binInfo.brand);

    // Handle UNKNOWN status - Send debug info to admin only (silent, no user notification)
    if (status === "UNKNOWN") {
      console.log("[NOTIFY-CHARGED] UNKNOWN status - skipping user notification");
      return new Response(
        JSON.stringify({ success: true, type: 'unknown_skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DECLINED cards - Skip user notification entirely (only log)
    if (status === "DECLINED") {
      console.log("[NOTIFY-CHARGED] DECLINED status - skipping user notification");
      return new Response(
        JSON.stringify({ success: true, type: 'declined_skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only CHARGED/LIVE cards reach here - notify user if they have Telegram linked
    if (profileError || !profile?.telegram_chat_id) {
      console.log("User has no Telegram chat ID linked:", user_id);
      return new Response(
        JSON.stringify({ success: false, reason: 'No Telegram linked' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build clean, fancy notification message for CHARGED/LIVE cards
    const timeNow = new Date().toISOString().replace('T', ' ').slice(0, 16);
    
    const message = `<b><i>🎯 [LIVE] </i></b><code>${card_details}</code>

<b><i>────────────────────────</i></b>

<b><i>STATUS   :</i></b> <code>CHARGED</code>

<b><i>AMOUNT   :</i></b> <code>${amount}</code>

<b><i>RESPONSE :</i></b> <code>${response_message}</code>

<b><i>BIN      :</i></b> <code>${binInfo.brand} / ${binInfo.type} / ${binInfo.country} ${countryFlag}</code>

<b><i>GATEWAY  :</i></b> <code>${gateway}</code>

<b><i>TIME     :</i></b> <code>${timeNow} UTC</code>`;

    // Send notification to user
    const sent = await sendTelegramMessage(profile.telegram_chat_id, message);

    return new Response(
      JSON.stringify({ success: sent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[NOTIFY-CHARGED] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

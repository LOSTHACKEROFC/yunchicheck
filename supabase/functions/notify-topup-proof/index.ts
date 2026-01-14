import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TopupProofRequest {
  transaction_id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  proof_image_url: string;
}

// Send photo with inline keyboard to Telegram
async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
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

    console.log("Telegram photo sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending Telegram photo:", error);
    return false;
  }
}

// Get payment method label
function getPaymentMethodLabel(method: string): string {
  const methods: Record<string, string> = {
    btc: "Bitcoin",
    eth: "Ethereum",
    ltc: "Litecoin",
    usdt: "USDT TRC20",
  };
  return methods[method] || method.toUpperCase();
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transaction_id, user_id, amount, payment_method, proof_image_url }: TopupProofRequest = await req.json();

    if (!transaction_id || !user_id || !amount || !payment_method || !proof_image_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, name, telegram_chat_id")
      .eq("user_id", user_id)
      .single();

    // Get user email
    const { data: authData } = await supabase.auth.admin.listUsers();
    const userAuth = authData?.users?.find((u: any) => u.id === user_id);
    const userEmail = userAuth?.email || "Unknown";

    const username = profile?.username || profile?.name || "Unknown User";
    const paymentLabel = getPaymentMethodLabel(payment_method);

    // Build caption
    const caption = `
💰 <b>New Top-Up Payment Proof</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transaction_id}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> $${amount}
<b>💳 Method:</b> ${paymentLabel}

━━━━━━━━━━━━━━━━━━━━━━

<i>Click a button below to approve or reject this payment.</i>
`;

    // Create inline keyboard with Accept/Reject buttons
    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Accept", callback_data: `topup_accept_${transaction_id}` },
          { text: "❌ Reject", callback_data: `topup_reject_${transaction_id}` },
        ],
      ],
    };

    // Send photo to admin
    if (ADMIN_TELEGRAM_CHAT_ID) {
      await sendTelegramPhoto(
        ADMIN_TELEGRAM_CHAT_ID,
        proof_image_url,
        caption,
        inlineKeyboard
      );
    }

    console.log(`Topup proof notification sent for transaction: ${transaction_id}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-topup-proof:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

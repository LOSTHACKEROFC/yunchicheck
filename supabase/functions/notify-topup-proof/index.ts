import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "losthackerofc@gmail.com";
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
    const credits = Number(amount) * 10;

    // Build caption for Telegram
    const caption = `
💰 <b>New Top-Up Payment Proof</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>Transaction ID:</b>
<code>${transaction_id}</code>

<b>👤 User:</b> ${username}
<b>📧 Email:</b> ${userEmail}
<b>💵 Amount:</b> $${amount} (${credits} credits)
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

    // Send photo to admin via Telegram
    if (ADMIN_TELEGRAM_CHAT_ID) {
      await sendTelegramPhoto(
        ADMIN_TELEGRAM_CHAT_ID,
        proof_image_url,
        caption,
        inlineKeyboard
      );
      console.log("Telegram notification sent to admin");
    }

    // Send email to admin
    if (RESEND_API_KEY) {
      console.log("Sending email notification to admin");
      const resend = new Resend(RESEND_API_KEY);

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">💰 New Payment Proof</h1>
          </div>
          <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
            <p style="font-size: 16px; color: #a3a3a3;">A new top-up payment proof has been submitted.</p>
            
            <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2a1a1a;">
              <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Transaction ID:</strong> <code style="color: #ef4444;">${transaction_id}</code></p>
              <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">User:</strong> ${username}</p>
              <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Email:</strong> ${userEmail}</p>
              <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Amount:</strong> $${amount} (${credits} credits)</p>
              <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Method:</strong> ${paymentLabel}</p>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <p style="color: #737373; margin-bottom: 15px;">Payment Proof Image:</p>
              <img src="${proof_image_url}" alt="Payment Proof" style="max-width: 100%; border-radius: 8px; border: 2px solid #2a1a1a;" />
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
              <a href="https://yunchicheck.lovable.app/dashboard/admin/topups" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 10px;">✅ Review in Dashboard</a>
            </div>
            
            <p style="color: #404040; font-size: 12px; text-align: center; margin-top: 30px;">
              This is an automated notification from Yunchi Checker.
            </p>
          </div>
        </div>
      `;

      const emailResult = await resend.emails.send({
        from: "Yunchi Checker <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `💰 New Payment Proof: $${amount} from ${username}`,
        html: emailHtml,
      });

      if (emailResult.error) {
        console.error("Email error:", emailResult.error);
      } else {
        console.log("Email notification sent to admin");
      }
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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function sendTelegramMessage(
  chatId: string,
  message: string,
  replyMarkup?: object
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return { success: false, error: "Bot not configured" };
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Telegram API error:", data);
      if (data.description?.includes("chat not found")) {
        return { success: false, error: "Chat not found. Please start the bot first by clicking the Start button." };
      }
      return { success: false, error: data.description || "Failed to send message" };
    }

    console.log("Telegram verification message sent successfully");
    return { success: true };
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return { success: false, error: "Network error" };
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received send-telegram-verification request");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { telegramChatId, email } = await req.json();

    if (!telegramChatId) {
      return new Response(
        JSON.stringify({ error: "Telegram Chat ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Delete any existing pending verifications for this chat ID
    await supabase
      .from("pending_verifications")
      .delete()
      .eq("telegram_chat_id", telegramChatId);

    // Create new pending verification
    const { error: insertError } = await supabase
      .from("pending_verifications")
      .insert({
        telegram_chat_id: telegramChatId,
        verification_code: verificationCode,
        email: email || null,
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

    if (insertError) {
      console.error("Error creating pending verification:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create verification" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send verification message to Telegram
    const message = `🔐 <b>Account Verification</b>

You are registering for <b>Yunchi Checker</b>.

Click the button below to verify your account. This verification will expire in <b>5 minutes</b>.

Your verification code: <code>${verificationCode}</code>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: "✅ Verify My Account",
            callback_data: `verify_${verificationCode}`,
          },
        ],
      ],
    };

    const sendResult = await sendTelegramMessage(telegramChatId, message, replyMarkup);

    if (!sendResult.success) {
      // Clean up the pending verification if message failed
      await supabase
        .from("pending_verifications")
        .delete()
        .eq("verification_code", verificationCode);

      return new Response(
        JSON.stringify({ error: sendResult.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Verification sent",
        verificationCode: verificationCode,
        expiresAt: expiresAt.toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in send-telegram-verification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

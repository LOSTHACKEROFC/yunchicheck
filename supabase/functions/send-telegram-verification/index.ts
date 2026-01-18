import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateVerificationCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Send email notification about Telegram verification request
async function sendVerificationEmail(email: string, verificationCode: string): Promise<boolean> {
  if (!RESEND_API_KEY || !email) return false;

  try {
    const resend = new Resend(RESEND_API_KEY);
    
    const { error } = await resend.emails.send({
      from: "Yunchi <noreply@yunchicheck.com>",
      reply_to: "support@yunchicheck.com",
      to: [email],
      subject: "Telegram Verification Request - Yunchi",
      text: `A Telegram verification has been initiated for your Yunchi account.

Your verification code: ${verificationCode}

This code will expire in 5 minutes.

If you did not request this verification, please ignore this email.

— Yunchi Security Team`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📱 Telegram Verification</h1>
          </div>
          <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
            <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">
              A Telegram verification has been initiated for your Yunchi account.
            </p>
            
            <div style="background: #1a0a0a; border: 1px solid #dc2626; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
              <p style="color: #fca5a5; font-size: 14px; margin-bottom: 12px;">Your verification code:</p>
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #ef4444; margin: 0;">${verificationCode}</p>
            </div>
            
            <p style="color: #a3a3a3; font-size: 14px;">
              This code will expire in <strong>5 minutes</strong>.
            </p>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              If you did not request this verification, please ignore this email.
            </p>
            
            <hr style="border: none; border-top: 1px solid #262626; margin: 24px 0;" />
            
            <p style="color: #525252; font-size: 12px; text-align: center;">
              — Yunchi Security Team
            </p>
          </div>
        </div>
      `,
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
      },
    });

    if (error) {
      console.error("Error sending verification email:", error);
      return false;
    }

    console.log(`Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending verification email:", error);
    return false;
  }
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

    // Send email notification about the verification request (if email provided)
    if (email) {
      await sendVerificationEmail(email, verificationCode);
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

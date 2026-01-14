import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TopupNotificationRequest {
  transaction_id: string;
  user_id: string;
  amount: number;
  status: string;
  payment_method: string;
  rejection_reason?: string;
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
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
    const result = await response.json();
    console.log("Telegram response:", result);
    return result.ok;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const result = await resend.emails.send({
      from: "Yunchi Checker <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    });
    console.log("Email sent:", result);
    return !result.error;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transaction_id, user_id, amount, status, payment_method, rejection_reason }: TopupNotificationRequest = await req.json();

    console.log("Processing topup notification:", { transaction_id, user_id, amount, status, rejection_reason });

    // Create Supabase client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user profile and email
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("username, telegram_chat_id, balance")
      .eq("user_id", user_id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get user email from auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(user_id);

    if (authError) {
      console.error("Error fetching auth user:", authError);
    }

    const userEmail = authUser?.user?.email;
    const username = profile?.username || "User";
    const telegramChatId = profile?.telegram_chat_id;
    const currentBalance = profile?.balance || 0;

    const paymentMethodLabels: Record<string, string> = {
      btc: "Bitcoin",
      eth: "Ethereum", 
      ltc: "Litecoin",
      usdt: "USDT TRC20"
    };

    const methodLabel = paymentMethodLabels[payment_method] || payment_method;
    const formattedAmount = `$${Number(amount).toFixed(2)}`;
    const formattedBalance = `$${Number(currentBalance).toFixed(2)}`;

    let telegramSent = false;
    let emailSent = false;

    if (status === "completed") {
      // APPROVED notification with new balance
      const telegramMessage = `
✅ <b>Topup Approved!</b>

Hello <b>${username}</b>,

Your topup request has been approved and processed.

💰 <b>Amount Added:</b> ${formattedAmount}
💳 <b>Method:</b> ${methodLabel}
📝 <b>Transaction ID:</b> <code>${transaction_id.slice(0, 8)}...</code>

💵 <b>New Balance:</b> ${formattedBalance}

Thank you for using Yunchi Checker!
      `.trim();

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">✅ Topup Approved!</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
            <p style="font-size: 16px;">Hello <strong>${username}</strong>,</p>
            <p>Your topup request has been approved and processed successfully.</p>
            
            <div style="background: #262626; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Amount Added:</strong> ${formattedAmount}</p>
              <p style="margin: 5px 0;"><strong>Method:</strong> ${methodLabel}</p>
              <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${transaction_id.slice(0, 8)}...</p>
            </div>
            
            <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.8);">Your New Balance</p>
              <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: white;">${formattedBalance}</p>
            </div>
            
            <p style="color: #a3a3a3; font-size: 14px; text-align: center;">Thank you for using Yunchi Checker.</p>
          </div>
        </div>
      `;

      if (telegramChatId) {
        telegramSent = await sendTelegramMessage(telegramChatId, telegramMessage);
      }

      if (userEmail) {
        emailSent = await sendEmail(userEmail, "✅ Your Topup Has Been Approved!", emailHtml);
      }

      // Create notification in database
      await supabaseAdmin.from("notifications").insert({
        user_id,
        type: "topup_approved",
        title: "Topup Approved",
        message: `Your ${formattedAmount} topup via ${methodLabel} has been approved. New balance: ${formattedBalance}`,
        metadata: { transaction_id, amount, payment_method, new_balance: currentBalance }
      });

    } else if (status === "failed") {
      // REJECTED notification
      const reasonText = rejection_reason ? `\n\n📋 <b>Reason:</b> ${rejection_reason}` : "";
      const telegramMessage = `
❌ <b>Topup Rejected</b>

Hello <b>${username}</b>,

Unfortunately, your topup request has been rejected.

💰 <b>Amount:</b> ${formattedAmount}
💳 <b>Method:</b> ${methodLabel}
📝 <b>Transaction ID:</b> <code>${transaction_id.slice(0, 8)}...</code>${reasonText}

If you believe this was a mistake, please contact support with your transaction details.
      `.trim();

      const reasonHtml = rejection_reason 
        ? `<p style="margin: 10px 0; padding: 15px; background: #3b1c1c; border-left: 4px solid #ef4444; border-radius: 4px;"><strong>Reason:</strong> ${rejection_reason}</p>` 
        : "";
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">❌ Topup Rejected</h1>
          </div>
          <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
            <p style="font-size: 16px;">Hello <strong>${username}</strong>,</p>
            <p>Unfortunately, your topup request has been rejected.</p>
            
            <div style="background: #262626; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
              <p style="margin: 5px 0;"><strong>Method:</strong> ${methodLabel}</p>
              <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${transaction_id.slice(0, 8)}...</p>
            </div>
            
            ${reasonHtml}
            
            <p style="color: #a3a3a3; font-size: 14px;">If you believe this was a mistake, please contact support with your transaction details.</p>
          </div>
        </div>
      `;

      if (telegramChatId) {
        telegramSent = await sendTelegramMessage(telegramChatId, telegramMessage);
      }

      if (userEmail) {
        emailSent = await sendEmail(userEmail, "❌ Your Topup Request Was Rejected", emailHtml);
      }

      // Create notification in database
      const notificationMessage = rejection_reason 
        ? `Your ${formattedAmount} topup via ${methodLabel} has been rejected. Reason: ${rejection_reason}`
        : `Your ${formattedAmount} topup via ${methodLabel} has been rejected. Please contact support if you need assistance.`;
      
      await supabaseAdmin.from("notifications").insert({
        user_id,
        type: "topup_rejected",
        title: "Topup Rejected",
        message: notificationMessage,
        metadata: { transaction_id, amount, payment_method, rejection_reason }
      });
    }

    console.log("Notification results:", { telegramSent, emailSent });

    return new Response(
      JSON.stringify({ 
        success: true, 
        telegramSent, 
        emailSent 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-topup-status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreditAdditionRequest {
  user_id: string;
  amount: number;
  old_credits: number;
  new_credits: number;
  source: "admin" | "topup" | "bonus" | "refund";
  admin_name?: string;
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false;

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
    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

async function sendCreditAdditionEmail(
  email: string, 
  username: string | null, 
  amount: number, 
  newBalance: number,
  source: string
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("No RESEND_API_KEY configured");
    return false;
  }

  const resend = new Resend(RESEND_API_KEY);
  const senders = [
    "Yunchi <noreply@yunchicheck.com>",
    "Yunchi <onboarding@resend.dev>"
  ];

  const sourceLabel = {
    "admin": "Admin Credit",
    "topup": "Top-up Approved",
    "bonus": "Bonus Credit",
    "refund": "Refund Credit"
  }[source] || "Credit Addition";

  for (const sender of senders) {
    try {
      console.log(`Sending credit addition email from ${sender}`);
      const { error } = await resend.emails.send({
        from: sender,
        reply_to: "support@yunchicheck.com",
        to: [email],
        subject: `💰 ${amount} Credits Added to Your Account - Yunchi`,
        text: `Hello${username ? ` ${username}` : ''},

Great news! ${amount} credits have been added to your Yunchi account.

Type: ${sourceLabel}
Credits Added: ${amount}
New Balance: ${newBalance} credits

Thank you for using Yunchi Checker!

— Yunchi Team`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
            <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">💰 Credits Added!</h1>
            </div>
            <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
              <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">
                Hello${username ? ` <strong style="color: #ef4444;">${username}</strong>` : ''},
              </p>
              
              <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6;">
                Great news! Credits have been added to your account.
              </p>
              
              <div style="background: #1a0a0a; border: 1px solid #dc2626; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: #fca5a5; font-size: 14px; margin: 0 0 8px;">Credits Added</p>
                <p style="font-size: 42px; font-weight: bold; color: #22c55e; margin: 0;">+${amount}</p>
              </div>
              
              <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #a3a3a3; padding: 8px 0;">Type:</td>
                    <td style="color: #e5e5e5; padding: 8px 0; text-align: right; font-weight: 600;">${sourceLabel}</td>
                  </tr>
                  <tr>
                    <td style="color: #a3a3a3; padding: 8px 0; border-top: 1px solid #262626;">New Balance:</td>
                    <td style="color: #ef4444; padding: 8px 0; text-align: right; font-weight: 600; border-top: 1px solid #262626;">${newBalance} credits</td>
                  </tr>
                </table>
              </div>
              
              <div style="text-align: center; margin-top: 25px;">
                <a href="https://yunchicheck.com/dashboard" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Go to Dashboard</a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;" />
              
              <p style="color: #525252; font-size: 12px; text-align: center;">
                Thank you for using Yunchi Checker!<br>
                — Yunchi Team
              </p>
            </div>
          </div>
        `,
        headers: {
          "X-Entity-Ref-ID": crypto.randomUUID(),
          "X-Priority": "1",
          "Importance": "high",
        },
        tags: [
          { name: "category", value: "transactional" },
          { name: "type", value: "credit_addition" },
        ],
      });

      if (error) {
        const errorMessage = (error as any)?.message || '';
        console.error(`Error from ${sender}:`, error);
        
        if (errorMessage.includes('domain is not verified') || (error as any)?.statusCode === 403) {
          console.log("Domain not verified, trying fallback sender...");
          continue;
        }
        continue;
      }

      console.log(`Credit addition email sent via ${sender} to ${email}`);
      return true;
    } catch (error) {
      console.error(`Error sending from ${sender}:`, error);
      continue;
    }
  }

  console.error("All email senders failed");
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, amount, old_credits, new_credits, source, admin_name }: CreditAdditionRequest = await req.json();

    console.log(`Processing credit addition notification for user ${user_id}: +${amount} credits`);

    if (!user_id || amount === undefined) {
      return new Response(
        JSON.stringify({ error: "user_id and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only send notifications for credit additions, not deductions
    if (amount <= 0) {
      console.log("Skipping notification - not a credit addition");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Not a credit addition" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user profile and email
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, telegram_chat_id")
      .eq("user_id", user_id)
      .single();

    // Get user email from auth
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authUser = authData?.users?.find((u: any) => u.id === user_id);
    const userEmail = authUser?.email;

    // Check email preferences for credit additions
    const { data: emailPrefs } = await supabase
      .from("notification_preferences")
      .select("email_credit_additions")
      .eq("user_id", user_id)
      .single();

    const emailOptedOut = emailPrefs?.email_credit_additions === false;

    let emailSent = false;
    let emailSkipped = false;
    let telegramSent = false;

    // Send email notification (respect preferences)
    if (emailOptedOut) {
      console.log("Skipping email - user opted out");
      emailSkipped = true;
    } else if (userEmail) {
      emailSent = await sendCreditAdditionEmail(
        userEmail, 
        profile?.username || null, 
        amount, 
        new_credits,
        source || "admin"
      );
    }

    // Send Telegram notification (if not already sent by caller)
    if (profile?.telegram_chat_id && source !== "topup") {
      const emoji = "💰";
      const sourceLabel = {
        "admin": "Admin Credit",
        "bonus": "Bonus Credit",
        "refund": "Refund Credit"
      }[source] || "Credit Addition";

      const telegramMessage = `
${emoji} <b>${sourceLabel}</b>

Added: <b>${amount}</b> credits
New Balance: <b>${new_credits}</b> credits
${admin_name ? `\nBy: ${admin_name}` : ""}

<i>Thank you for using Yunchi!</i>
`;
      telegramSent = await sendTelegramMessage(profile.telegram_chat_id, telegramMessage);
    }

    console.log(`Notifications sent - Email: ${emailSent} (skipped: ${emailSkipped}), Telegram: ${telegramSent}`);

    return new Response(
      JSON.stringify({ success: true, emailSent, emailSkipped, telegramSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in notify-credit-addition:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
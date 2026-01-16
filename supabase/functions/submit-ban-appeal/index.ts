import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID") || "8496943061";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AppealRequest {
  email: string;
  username?: string;
  ban_reason?: string;
  appeal_message: string;
}

async function sendTelegramMessage(
  chatId: string | number,
  message: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
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

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
      return false;
    }

    console.log("Telegram message sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

async function sendAdminEmail(
  email: string,
  username: string | undefined,
  banReason: string | undefined,
  appealMessage: string,
  appealId: string
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("Resend API key not configured");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Yunchi Support <noreply@yunchicheck.com>",
        to: ["losthackerofc@gmail.com"],
        subject: `🔓 Ban Appeal Request - ${username || email}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px;">
            🔓 New Ban Appeal Request
          </h2>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Username:</strong> ${username || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Appeal ID:</strong> ${appealId}</p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #856404;">Ban Reason:</p>
            <p style="margin: 5px 0 0 0;">${banReason || 'No reason provided'}</p>
          </div>
          
          <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #004085;">Appeal Message:</p>
            <p style="margin: 5px 0 0 0; white-space: pre-wrap;">${appealMessage}</p>
          </div>
          
          <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
            Respond to this appeal via the Telegram bot using the buttons or the /unbanuser command.
          </p>
        </div>
      `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error sending email:", errorData);
      return false;
    }
    
    console.log("Admin email sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending admin email:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, username, ban_reason, appeal_message }: AppealRequest = await req.json();

    if (!email || !appeal_message) {
      return new Response(
        JSON.stringify({ error: "Email and appeal message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ban appeal for: ${email}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find user profile by email
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find((u: any) => 
      u.email?.toLowerCase() === email.toLowerCase()
    );

    let userId = authUser?.id;
    let telegramChatId: string | null = null;
    let actualUsername = username;

    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_chat_id, username")
        .eq("user_id", userId)
        .maybeSingle();
      
      telegramChatId = profile?.telegram_chat_id || null;
      actualUsername = profile?.username || username;
    }

    // Create appeal record
    const { data: appeal, error: appealError } = await supabase
      .from("ban_appeals")
      .insert({
        user_id: userId || "00000000-0000-0000-0000-000000000000",
        email,
        username: actualUsername,
        telegram_chat_id: telegramChatId,
        ban_reason,
        appeal_message,
        status: "pending"
      })
      .select("id")
      .single();

    if (appealError) {
      console.error("Error creating appeal:", appealError);
      return new Response(
        JSON.stringify({ error: "Failed to submit appeal" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appealId = appeal.id;

    // Send admin email notification
    await sendAdminEmail(email, actualUsername, ban_reason, appeal_message, appealId);

    // Send admin Telegram notification with buttons
    const telegramMessage = `
🔓 <b>New Ban Appeal Request</b>

<b>Email:</b> ${email}
<b>Username:</b> ${actualUsername || 'N/A'}
<b>Appeal ID:</b> <code>${appealId}</code>

<b>Ban Reason:</b>
${ban_reason || 'No reason provided'}

<b>Appeal Message:</b>
${appeal_message.substring(0, 500)}${appeal_message.length > 500 ? '...' : ''}

<i>Use the buttons below to respond:</i>
`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Unban User", callback_data: `unban_appeal_${appealId}` },
          { text: "❌ Reject Appeal", callback_data: `reject_appeal_${appealId}` },
        ]
      ],
    };

    await sendTelegramMessage(ADMIN_TELEGRAM_CHAT_ID, telegramMessage, inlineKeyboard);

    return new Response(
      JSON.stringify({ success: true, appealId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing appeal:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SupportTicketRequest {
  subject: string;
  message: string;
  userEmail: string;
  userName: string;
  userId: string;
  priority: string;
}

async function sendAdminTelegramNotification(
  ticketUuid: string,
  ticketId: string,
  userName: string,
  userEmail: string,
  subject: string,
  message: string,
  priority: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) {
    console.log("Telegram not configured for admin notifications");
    return;
  }

  try {
    const priorityEmoji: Record<string, string> = {
      low: "🔵",
      medium: "🟡",
      high: "🟠",
      urgent: "🔴"
    };
    const emoji = priorityEmoji[priority] || "🟡";

    const telegramMessage = `
🎫 <b>New Support Ticket</b>

<b>Ticket ID:</b> ${ticketId}
<b>Priority:</b> ${emoji} ${priority.toUpperCase()}
<b>From:</b> ${userName || 'Unknown'} (${userEmail})
<b>Subject:</b> ${subject}

<b>Message:</b>
${message}

[${ticketUuid}]
<i>Reply to this message to respond to the user.</i>
`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "🔄 Processing", callback_data: `processing_${ticketUuid}` },
          { text: "✅ Solved", callback_data: `solved_${ticketUuid}` },
        ],
        [
          { text: "📂 Open", callback_data: `open_${ticketUuid}` },
          { text: "🔒 Closed", callback_data: `closed_${ticketUuid}` },
        ],
      ],
    };

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: "HTML",
          reply_markup: inlineKeyboard,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
    } else {
      console.log("Admin Telegram notification sent successfully");
    }
  } catch (error) {
    console.error("Error sending admin Telegram notification:", error);
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received support ticket request");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, message, userEmail, userName, userId, priority }: SupportTicketRequest = await req.json();
    
    console.log(`Processing ticket from ${userEmail}: ${subject} (Priority: ${priority})`);

    // Generate a simple ticket ID
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

    // Save ticket to database using service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { error: dbError } = await supabase
      .from("support_tickets")
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        user_email: userEmail,
        subject,
        message,
        status: "open",
        priority: priority || "medium"
      });

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error("Failed to save ticket to database");
    }

    // Get the ticket UUID for Telegram notification
    const { data: ticketData } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("ticket_id", ticketId)
      .single();

    console.log("Ticket saved to database:", ticketId);

    // Send Telegram notification to admin
    if (ticketData?.id) {
      await sendAdminTelegramNotification(
        ticketData.id,
        ticketId,
        userName,
        userEmail,
        subject,
        message,
        priority || "medium"
      );
    }

    // Send email notification to admin
    const adminEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Support Ticket <onboarding@resend.dev>",
        to: ["losthackerofc@gmail.com"],
        subject: `[${ticketId}] New Support Ticket: ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">New Support Ticket</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ticket ID:</strong> ${ticketId}</p>
              <p><strong>From:</strong> ${userName || 'Unknown User'} (${userEmail})</p>
              <p><strong>Subject:</strong> ${subject}</p>
              <p><strong>Priority:</strong> ${priority || 'medium'}</p>
            </div>
            <div style="background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px;">
              <h3 style="margin-top: 0;">Message:</h3>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
              This ticket was submitted via the Yunchi Checker support system.
            </p>
          </div>
        `,
      }),
    });

    if (!adminEmailRes.ok) {
      const errorData = await adminEmailRes.json();
      console.error("Admin email error:", errorData);
    } else {
      console.log("Admin email sent successfully");
    }

    // Send confirmation email to user
    const userEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Yunchi Support <onboarding@resend.dev>",
        to: [userEmail],
        subject: `[${ticketId}] We've received your support request`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">🎫 Ticket Received</h1>
            </div>
            <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
              <p style="font-size: 16px;">Hello <strong>${userName || 'there'}</strong>,</p>
              <p>Thank you for contacting us. We've received your support request and our team will review it shortly.</p>
              
              <div style="background: #262626; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Ticket ID:</strong> ${ticketId}</p>
                <p style="margin: 5px 0;"><strong>Subject:</strong> ${subject}</p>
                <p style="margin: 5px 0;"><strong>Priority:</strong> ${priority || 'medium'}</p>
              </div>
              
              <div style="background: #262626; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0; color: #a3a3a3;"><strong>Your message:</strong></p>
                <p style="margin: 0; white-space: pre-wrap;">${message}</p>
              </div>
              
              <p style="color: #a3a3a3;">We'll notify you via email and Telegram (if connected) when we respond.</p>
              
              <div style="text-align: center; margin-top: 25px;">
                <a href="https://yunchicheck.lovable.app/dashboard/support" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Ticket</a>
              </div>
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 30px;">
                This is an automated message from Yunchi Checker Support.
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!userEmailRes.ok) {
      const errorData = await userEmailRes.json();
      console.error("User confirmation email error:", errorData);
    } else {
      console.log("User confirmation email sent successfully");
    }

    return new Response(JSON.stringify({ success: true, ticketId }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-support-ticket function:", error);
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

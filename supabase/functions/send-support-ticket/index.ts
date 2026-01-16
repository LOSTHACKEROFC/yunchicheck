import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = "losthackerofc@gmail.com";

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
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) {
    console.log("Telegram not configured for admin notifications");
    return false;
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
      return false;
    }
    
    console.log("Admin Telegram notification sent successfully");
    return true;
  } catch (error) {
    console.error("Error sending admin Telegram notification:", error);
    return false;
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
    
    // Validate required fields
    if (!subject || !message || !userEmail || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing ticket from ${userEmail}: ${subject} (Priority: ${priority})`);

    // Generate a simple ticket ID
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

    // Save ticket to database using service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: ticketData, error: dbError } = await supabase
      .from("support_tickets")
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        user_email: userEmail,
        subject,
        message,
        status: "open",
        priority: priority || "medium"
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to save ticket to database" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Ticket saved to database:", ticketId, "UUID:", ticketData.id);

    // Send Telegram notification to admin
    await sendAdminTelegramNotification(
      ticketData.id,
      ticketId,
      userName,
      userEmail,
      subject,
      message,
      priority || "medium"
    );

    // Send email notifications using Resend SDK
    let adminEmailSent = false;
    let userEmailSent = false;

    if (RESEND_API_KEY) {
      const resend = new Resend(RESEND_API_KEY);

      // Send email notification to admin
      try {
        const { error: adminEmailError } = await resend.emails.send({
          from: "Yunchi <noreply@resend.dev>",
          reply_to: userEmail,
          to: [ADMIN_EMAIL],
          subject: `[${ticketId}] New Support Ticket: ${subject}`,
          text: `New Support Ticket

Ticket ID: ${ticketId}
From: ${userName || 'Unknown User'} (${userEmail})
Subject: ${subject}
Priority: ${priority || 'medium'}

Message:
${message}

View in Dashboard: https://yunchicheck.lovable.app/dashboard/admin/topups`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
              <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">🎫 New Support Ticket</h1>
              </div>
              <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
                <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #2a1a1a;">
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Ticket ID:</strong> ${ticketId}</p>
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">From:</strong> ${userName || 'Unknown User'} (${userEmail})</p>
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Subject:</strong> ${subject}</p>
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Priority:</strong> ${priority || 'medium'}</p>
                </div>
                <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; border: 1px solid #2a1a1a;">
                  <h3 style="margin-top: 0; color: #ef4444;">Message:</h3>
                  <p style="white-space: pre-wrap; margin: 0; line-height: 1.6; color: #e5e5e5;">${message}</p>
                </div>
                <div style="text-align: center; margin-top: 25px;">
                  <a href="https://yunchicheck.lovable.app/dashboard/admin/topups" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">View in Dashboard</a>
                </div>
                <p style="color: #404040; font-size: 12px; text-align: center; margin-top: 30px;">
                  This ticket was submitted via the Yunchi Checker support system.
                </p>
              </div>
            </div>
          `,
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
          },
        });

        if (adminEmailError) {
          console.error("Admin email error:", adminEmailError);
        } else {
          adminEmailSent = true;
          console.log("Admin email sent successfully");
        }
      } catch (err) {
        console.error("Error sending admin email:", err);
      }

      // Send confirmation email to user
      try {
        const { error: userEmailError } = await resend.emails.send({
          from: "Yunchi <noreply@resend.dev>",
          reply_to: "support@yunchicheck.lovable.app",
          to: [userEmail],
          subject: `[${ticketId}] We've received your support request`,
          text: `Hello ${userName || 'there'},

Thank you for contacting us. We've received your support request and our team will review it shortly.

Ticket ID: ${ticketId}
Subject: ${subject}
Priority: ${priority || 'medium'}

Your message:
${message}

We'll notify you via email and Telegram (if connected) when we respond.

View Ticket: https://yunchicheck.lovable.app/dashboard/support

— Yunchi Support Team`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
              <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">🎫 Ticket Received</h1>
              </div>
              <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
                <p style="font-size: 16px;">Hello <strong style="color: #ef4444;">${userName || 'there'}</strong>,</p>
                <p style="color: #a3a3a3;">Thank you for contacting us. We've received your support request and our team will review it shortly.</p>
                
                <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2a1a1a;">
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Ticket ID:</strong> ${ticketId}</p>
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Subject:</strong> ${subject}</p>
                  <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Priority:</strong> ${priority || 'medium'}</p>
                </div>
                
                <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2a1a1a;">
                  <p style="margin: 0 0 10px 0; color: #ef4444;"><strong>Your message:</strong></p>
                  <p style="margin: 0; white-space: pre-wrap; line-height: 1.6; color: #e5e5e5;">${message}</p>
                </div>
                
                <p style="color: #737373;">We'll notify you via email and Telegram (if connected) when we respond.</p>
                
                <div style="text-align: center; margin-top: 25px;">
                  <a href="https://yunchicheck.lovable.app/dashboard/support" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Ticket</a>
                </div>
                
                <p style="color: #404040; font-size: 12px; text-align: center; margin-top: 30px;">
                  This is an automated message from Yunchi Checker Support.
                </p>
              </div>
            </div>
          `,
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
          },
        });

        if (userEmailError) {
          console.error("User confirmation email error:", userEmailError);
        } else {
          userEmailSent = true;
          console.log("User confirmation email sent successfully");
        }
      } catch (err) {
        console.error("Error sending user email:", err);
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping email notifications");
    }

    return new Response(JSON.stringify({ 
      success: true, 
      ticketId,
      adminEmailSent,
      userEmailSent
    }), {
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

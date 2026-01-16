import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AdminReplyRequest {
  ticketId: string;
  message: string;
  adminName?: string;
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

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

const handler = async (req: Request): Promise<Response> => {
  console.log("Received admin reply request");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, message, adminName }: AdminReplyRequest = await req.json();
    
    console.log(`Processing admin reply for ticket: ${ticketId}`);

    if (!ticketId || !message) {
      return new Response(
        JSON.stringify({ error: "Ticket ID and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("ticket_id, subject, user_email, user_id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketError);
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ticket: ${ticket.ticket_id} for user: ${ticket.user_email}`);

    // Get user profile for Telegram chat ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id, name, username")
      .eq("user_id", ticket.user_id)
      .maybeSingle();

    // Check email preferences
    const { data: emailPrefs } = await supabase
      .from("notification_preferences")
      .select("email_ticket_replies")
      .eq("user_id", ticket.user_id)
      .single();

    const emailOptedOut = emailPrefs?.email_ticket_replies === false;
    console.log("Email opt-out status:", emailOptedOut);

    // Insert admin message
    const { error: messageError } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticketId,
        user_id: ticket.user_id,
        message,
        is_admin: true
      });

    if (messageError) {
      console.error("Failed to save message:", messageError);
      return new Response(
        JSON.stringify({ error: "Failed to save admin message" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Admin message saved successfully");

    // Send email notification to user (if not opted out)
    let emailSent = false;
    let emailSkipped = false;
    if (emailOptedOut) {
      console.log("Skipping email - user opted out of ticket reply emails");
      emailSkipped = true;
    } else if (RESEND_API_KEY && ticket.user_email) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        
        const { error: emailError } = await resend.emails.send({
          from: "Yunchi <noreply@resend.dev>",
          reply_to: "support@yunchicheck.lovable.app",
          to: [ticket.user_email],
          subject: `[${ticket.ticket_id}] New Reply to Your Support Ticket`,
          text: `New Reply to Your Ticket

Ticket: ${ticket.ticket_id}
Subject: ${ticket.subject}

${adminName || 'Support Team'}:
${message}

You can view the full conversation by logging into your account.

View Ticket: https://yunchicheck.lovable.app/dashboard/support

— Yunchi Support Team`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">New Reply to Your Ticket</h1>
              </div>
              <div style="background: #1a1a1a; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5;">
                <div style="background: #262626; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <p style="margin: 5px 0;"><strong>Ticket:</strong> ${ticket.ticket_id}</p>
                  <p style="margin: 5px 0;"><strong>Subject:</strong> ${ticket.subject}</p>
                </div>
                <div style="background: #262626; padding: 20px; border-radius: 8px; border-left: 4px solid #7c3aed;">
                  <p style="color: #a3a3a3; margin-bottom: 10px;"><strong>${adminName || 'Support Team'}:</strong></p>
                  <p style="white-space: pre-wrap; margin: 0; line-height: 1.6;">${message}</p>
                </div>
                <p style="color: #a3a3a3; font-size: 14px; margin-top: 20px;">
                  You can view the full conversation by logging into your account.
                </p>
                <div style="text-align: center; margin-top: 25px;">
                  <a href="https://yunchicheck.lovable.app/dashboard/support" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Ticket</a>
                </div>
                <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 30px;">
                  This is an automated notification from Yunchi Checker support.
                </p>
              </div>
            </div>
          `,
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
          },
        });

        if (emailError) {
          console.error("Email error:", emailError);
        } else {
          emailSent = true;
          console.log("Email notification sent successfully");
        }
      } catch (emailErr) {
        console.error("Error sending email:", emailErr);
      }
    } else {
      console.log("Email not sent: RESEND_API_KEY not configured or no user email");
    }

    // Send Telegram notification if user has chat ID configured
    let telegramSent = false;
    if (profile?.telegram_chat_id) {
      const telegramMessage = `
🎫 <b>New Reply to Your Ticket</b>

<b>Ticket:</b> ${ticket.ticket_id}
<b>Subject:</b> ${ticket.subject}

<b>${adminName || 'Support Team'}:</b>
${message}

<i>View the full conversation in your dashboard.</i>
`;
      telegramSent = await sendTelegramMessage(profile.telegram_chat_id, telegramMessage);
    } else {
      console.log("No Telegram chat ID configured for user");
    }

    // Create in-app notification
    await supabase.from("notifications").insert({
      user_id: ticket.user_id,
      type: "ticket_reply",
      title: "New Reply to Your Ticket",
      message: `${adminName || 'Support Team'} replied to ticket ${ticket.ticket_id}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
      metadata: { ticket_id: ticketId, ticket_number: ticket.ticket_id }
    });

    return new Response(JSON.stringify({ success: true, emailSent, emailSkipped, telegramSent }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in notify-ticket-reply function:", error);
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

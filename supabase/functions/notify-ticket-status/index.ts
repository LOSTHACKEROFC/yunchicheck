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

interface TicketStatusRequest {
  ticket_uuid: string;
  new_status: string;
  old_status?: string;
}

const statusLabels: Record<string, string> = {
  "open": "Open",
  "processing": "In Progress",
  "solved": "Solved",
  "closed": "Closed"
};

const statusEmojis: Record<string, string> = {
  "open": "🟢",
  "processing": "🔄",
  "solved": "✅",
  "closed": "🔒"
};

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

async function sendTicketStatusEmail(
  email: string,
  username: string | null,
  ticketId: string,
  subject: string,
  newStatus: string,
  oldStatus?: string
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("No RESEND_API_KEY configured");
    return false;
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    
    const statusLabel = statusLabels[newStatus] || newStatus;
    const statusEmoji = statusEmojis[newStatus] || "📋";
    const oldStatusLabel = oldStatus ? (statusLabels[oldStatus] || oldStatus) : null;

    let statusMessage = "";
    if (newStatus === "solved") {
      statusMessage = "Your support ticket has been marked as solved. If this resolves your issue, no further action is needed.";
    } else if (newStatus === "closed") {
      statusMessage = "Your support ticket has been closed. If you need further assistance, please open a new ticket.";
    } else if (newStatus === "processing") {
      statusMessage = "Our team is actively working on your ticket. We'll update you as soon as possible.";
    } else {
      statusMessage = "Your ticket status has been updated.";
    }

    const { error } = await resend.emails.send({
      from: "Yunchi Support <noreply@yunchicheck.com>",
      reply_to: "support@yunchicheck.com",
      to: [email],
      subject: `[${ticketId}] Ticket Status Updated: ${statusLabel}`,
      text: `Hello${username ? ` ${username}` : ''},

Your support ticket status has been updated.

Ticket: ${ticketId}
Subject: ${subject}
${oldStatusLabel ? `Previous Status: ${oldStatusLabel}` : ""}
New Status: ${statusLabel}

${statusMessage}

View your ticket: https://yunchicheck.com/dashboard/support

— Yunchi Support Team`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${statusEmoji} Ticket Status Updated</h1>
          </div>
          <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
            <p style="color: #e5e5e5; font-size: 16px; line-height: 1.6;">
              Hello${username ? ` <strong style="color: #ef4444;">${username}</strong>` : ''},
            </p>
            
            <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6;">
              Your support ticket status has been updated.
            </p>
            
            <div style="background: #1a0a0a; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #2a1a1a;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #a3a3a3; padding: 8px 0;">Ticket:</td>
                  <td style="color: #e5e5e5; padding: 8px 0; text-align: right; font-weight: 600;">${ticketId}</td>
                </tr>
                <tr>
                  <td style="color: #a3a3a3; padding: 8px 0; border-top: 1px solid #262626;">Subject:</td>
                  <td style="color: #e5e5e5; padding: 8px 0; text-align: right; border-top: 1px solid #262626;">${subject}</td>
                </tr>
                ${oldStatusLabel ? `
                <tr>
                  <td style="color: #a3a3a3; padding: 8px 0; border-top: 1px solid #262626;">Previous Status:</td>
                  <td style="color: #737373; padding: 8px 0; text-align: right; border-top: 1px solid #262626;">${oldStatusLabel}</td>
                </tr>
                ` : ""}
                <tr>
                  <td style="color: #a3a3a3; padding: 8px 0; border-top: 1px solid #262626;">New Status:</td>
                  <td style="color: #ef4444; padding: 8px 0; text-align: right; font-weight: 600; border-top: 1px solid #262626;">${statusEmoji} ${statusLabel}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #1a0a0a; border-left: 4px solid #dc2626; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="color: #a3a3a3; font-size: 14px; margin: 0; line-height: 1.6;">
                ${statusMessage}
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 25px;">
              <a href="https://yunchicheck.com/dashboard/support" style="display: inline-block; background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Ticket</a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #262626; margin: 30px 0;" />
            
            <p style="color: #525252; font-size: 12px; text-align: center;">
              — Yunchi Support Team
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
        { name: "type", value: "ticket_status" },
      ],
    });

    if (error) {
      console.error("Error sending ticket status email:", error);
      return false;
    }

    console.log(`Ticket status email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending ticket status email:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticket_uuid, new_status, old_status }: TicketStatusRequest = await req.json();

    console.log(`Processing ticket status notification: ${ticket_uuid} -> ${new_status}`);

    if (!ticket_uuid || !new_status) {
      return new Response(
        JSON.stringify({ error: "ticket_uuid and new_status are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("ticket_id, subject, user_id, user_email")
      .eq("id", ticket_uuid)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketError);
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, telegram_chat_id")
      .eq("user_id", ticket.user_id)
      .single();

    // Check email preferences
    const { data: emailPrefs } = await supabase
      .from("notification_preferences")
      .select("email_ticket_replies")
      .eq("user_id", ticket.user_id)
      .single();

    const emailOptedOut = emailPrefs?.email_ticket_replies === false;

    let emailSent = false;
    let emailSkipped = false;
    let telegramSent = false;

    // Send email notification (if not opted out)
    if (emailOptedOut) {
      console.log("Skipping email - user opted out");
      emailSkipped = true;
    } else if (ticket.user_email) {
      emailSent = await sendTicketStatusEmail(
        ticket.user_email,
        profile?.username || null,
        ticket.ticket_id,
        ticket.subject,
        new_status,
        old_status
      );
    }

    // Send Telegram notification
    if (profile?.telegram_chat_id) {
      const statusLabel = statusLabels[new_status] || new_status;
      const statusEmoji = statusEmojis[new_status] || "📋";

      const telegramMessage = `
${statusEmoji} <b>Ticket Status Updated</b>

<b>Ticket:</b> ${ticket.ticket_id}
<b>Subject:</b> ${ticket.subject}
<b>New Status:</b> ${statusLabel}

<i>View your ticket in the dashboard.</i>
`;
      telegramSent = await sendTelegramMessage(profile.telegram_chat_id, telegramMessage);
    }

    // Create in-app notification
    await supabase.from("notifications").insert({
      user_id: ticket.user_id,
      type: "ticket_status",
      title: "Ticket Status Updated",
      message: `Your ticket ${ticket.ticket_id} is now ${statusLabels[new_status] || new_status}`,
      metadata: { ticket_id: ticket_uuid, ticket_number: ticket.ticket_id, new_status, old_status }
    });

    console.log(`Notifications sent - Email: ${emailSent} (skipped: ${emailSkipped}), Telegram: ${telegramSent}`);

    return new Response(
      JSON.stringify({ success: true, emailSent, emailSkipped, telegramSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in notify-ticket-status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
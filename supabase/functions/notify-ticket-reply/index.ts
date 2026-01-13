import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
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

const handler = async (req: Request): Promise<Response> => {
  console.log("Received admin reply request");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, message, adminName }: AdminReplyRequest = await req.json();
    
    console.log(`Processing admin reply for ticket: ${ticketId}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("ticket_id, subject, user_email, user_id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketError);
      throw new Error("Ticket not found");
    }

    console.log(`Found ticket: ${ticket.ticket_id} for user: ${ticket.user_email}`);

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
      throw new Error("Failed to save admin message");
    }

    console.log("Admin message saved successfully");

    // Send email notification to user
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Support Team <onboarding@resend.dev>",
        to: [ticket.user_email],
        subject: `[${ticket.ticket_id}] New Reply to Your Support Ticket`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">New Reply to Your Ticket</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ticket:</strong> ${ticket.ticket_id}</p>
              <p><strong>Subject:</strong> ${ticket.subject}</p>
            </div>
            <div style="background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px;">
              <p style="color: #6c757d; margin-bottom: 10px;"><strong>${adminName || 'Support Team'}:</strong></p>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
              You can view the full conversation by logging into your account.
            </p>
            <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
              This is an automated notification from Yunchi Checker support.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error("Resend API error:", errorData);
      // Don't throw - message is saved, just email failed
      console.log("Email notification failed but message was saved");
    } else {
      console.log("Email notification sent successfully");
    }

    return new Response(JSON.stringify({ success: true }), {
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

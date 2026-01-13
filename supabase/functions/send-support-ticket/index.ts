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

interface SupportTicketRequest {
  subject: string;
  message: string;
  userEmail: string;
  userName: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received support ticket request");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, message, userEmail, userName, userId }: SupportTicketRequest = await req.json();
    
    console.log(`Processing ticket from ${userEmail}: ${subject}`);

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
        status: "open"
      });

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error("Failed to save ticket to database");
    }

    console.log("Ticket saved to database:", ticketId);

    // Send email notification
    const res = await fetch("https://api.resend.com/emails", {
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

    if (!res.ok) {
      const errorData = await res.json();
      console.error("Resend API error:", errorData);
      // Don't throw - ticket is saved, just email failed
      console.log("Email failed but ticket was saved");
    } else {
      console.log("Email sent successfully");
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

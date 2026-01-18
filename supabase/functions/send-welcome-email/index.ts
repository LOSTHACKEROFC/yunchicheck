import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailPayload {
  user_id: string;
  email: string;
  username?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: WelcomeEmailPayload = await req.json();
    const { user_id, email, username } = payload;

    console.log(`Sending welcome email to ${email} (user: ${user_id})`);

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email) {
      console.error("Email address is required");
      return new Response(
        JSON.stringify({ error: "Email address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const displayName = username || email.split("@")[0];

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 16px 16px 0 0; padding: 40px 30px; text-align: center;">
          <h1 style="color: #fff; margin: 0 0 10px 0; font-size: 28px;">🎉 Welcome to Yunchi!</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 16px;">Your account has been created successfully</p>
        </div>
        
        <div style="background: #0f0f0f; border-radius: 0 0 16px 16px; padding: 30px; border: 1px solid #1a1a1a; border-top: none;">
          <p style="color: #e5e5e5; font-size: 18px; margin: 0 0 20px 0;">
            Hello <strong style="color: #ef4444;">${displayName}</strong>! 👋
          </p>
          
          <p style="color: #a3a3a3; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
            Thank you for joining Yunchi Checker. We're excited to have you on board!
          </p>
          
          <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); border-radius: 12px; padding: 25px; margin: 25px 0;">
            <h2 style="color: #fff; margin: 0 0 15px 0; font-size: 18px;">📋 Your Account Details</h2>
            <table style="width: 100%; color: #fff;">
              <tr>
                <td style="padding: 8px 0; opacity: 0.8;">Username:</td>
                <td style="padding: 8px 0; font-weight: bold;">${username || "Not set"}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; opacity: 0.8;">Email:</td>
                <td style="padding: 8px 0; font-weight: bold;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; opacity: 0.8;">Starting Credits:</td>
                <td style="padding: 8px 0; font-weight: bold;">0 credits</td>
              </tr>
            </table>
          </div>
          
          <h2 style="color: #e5e5e5; font-size: 18px; margin: 30px 0 15px 0;">🚀 Getting Started</h2>
          
          <div style="background: #1a0a0a; border-radius: 10px; padding: 20px; margin-bottom: 15px; border: 1px solid #2a1a1a;">
            <h3 style="color: #ef4444; margin: 0 0 10px 0; font-size: 16px;">1. Top Up Your Balance</h3>
            <p style="color: #737373; margin: 0; font-size: 14px; line-height: 1.5;">
              Add credits to your account via crypto payment. Visit the Balance page to get started.
            </p>
          </div>
          
          <div style="background: #1a0a0a; border-radius: 10px; padding: 20px; margin-bottom: 15px; border: 1px solid #2a1a1a;">
            <h3 style="color: #ef4444; margin: 0 0 10px 0; font-size: 16px;">2. Explore Available Gateways</h3>
            <p style="color: #737373; margin: 0; font-size: 14px; line-height: 1.5;">
              Check out our gateways page to see all available checking options and their credit costs.
            </p>
          </div>
          
          <div style="background: #1a0a0a; border-radius: 10px; padding: 20px; margin-bottom: 15px; border: 1px solid #2a1a1a;">
            <h3 style="color: #ef4444; margin: 0 0 10px 0; font-size: 16px;">3. Connect Telegram Notifications</h3>
            <p style="color: #737373; margin: 0; font-size: 14px; line-height: 1.5;">
              Stay updated with real-time alerts via our Telegram bot @YunchiSupportbot.
            </p>
          </div>
          
          <div style="background: #1a0a0a; border-radius: 10px; padding: 20px; margin-bottom: 25px; border: 1px solid #2a1a1a;">
            <h3 style="color: #ef4444; margin: 0 0 10px 0; font-size: 16px;">4. Need Help?</h3>
            <p style="color: #737373; margin: 0; font-size: 14px; line-height: 1.5;">
              Visit our Support page to submit a ticket or reach out via Telegram for quick assistance.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://yunchicheck.com/dashboard" 
               style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: #fff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Go to Dashboard →
            </a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 25px; padding: 20px;">
          <p style="color: #525252; font-size: 12px; margin: 0 0 10px 0;">
            If you didn't create this account, please ignore this email.
          </p>
          <p style="color: #404040; font-size: 12px; margin: 0;">
            — Yunchi Team
          </p>
        </div>
      </body>
      </html>
    `;

    const emailText = `Hello ${displayName}!

Thank you for joining Yunchi Checker. We're excited to have you on board!

Your Account Details:
- Username: ${username || "Not set"}
- Email: ${email}
- Starting Credits: 0 credits

Getting Started:
1. Top Up Your Balance - Add credits via crypto payment
2. Explore Available Gateways - Check our gateways page
3. Connect Telegram - Get real-time alerts via @YunchiSupportbot
4. Need Help? - Visit our Support page

Go to your dashboard: https://yunchicheck.com/dashboard

If you didn't create this account, please ignore this email.

— Yunchi Team`;

    // Try primary domain first, fallback to resend.dev if domain not verified
    const senders = [
      "Yunchi <noreply@yunchicheck.com>",
      "Yunchi <onboarding@resend.dev>"
    ];

    let emailSent = false;
    let emailId: string | undefined;

    for (const sender of senders) {
      try {
        console.log(`Attempting to send welcome email from ${sender}`);
        const { data, error } = await resend.emails.send({
          from: sender,
          reply_to: "support@yunchicheck.com",
          to: [email],
          subject: "Welcome to Yunchi - Your Account is Ready",
          html: emailHtml,
          text: emailText,
          headers: {
            "X-Entity-Ref-ID": crypto.randomUUID(),
            "X-Priority": "1",
            "Importance": "high",
          },
          tags: [
            { name: "category", value: "transactional" },
            { name: "type", value: "welcome" },
          ],
        });

        if (error) {
          const errorMessage = (error as any)?.message || '';
          console.error(`Resend API error from ${sender}:`, error);
          
          // If domain not verified, try fallback
          if (errorMessage.includes('domain is not verified') || (error as any)?.statusCode === 403) {
            console.log("Domain not verified, trying fallback sender...");
            continue;
          }
          continue;
        }

        emailSent = true;
        emailId = data?.id;
        console.log(`Welcome email sent successfully via ${sender}:`, emailId);
        break;
      } catch (err) {
        console.error(`Error sending from ${sender}:`, err);
        continue;
      }
    }

    if (!emailSent) {
      console.error("All email senders failed");
      return new Response(
        JSON.stringify({ error: "Failed to send email with all providers" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent", id: emailId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

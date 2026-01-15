import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const displayName = username || email.split("@")[0];

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px 30px; text-align: center;">
          <h1 style="color: #fff; margin: 0 0 10px 0; font-size: 28px;">🎉 Welcome to Yunchi!</h1>
          <p style="color: #a0a0a0; margin: 0; font-size: 16px;">Your account has been created successfully</p>
        </div>
        
        <div style="background: #ffffff; border-radius: 16px; padding: 30px; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <p style="color: #333; font-size: 18px; margin: 0 0 20px 0;">
            Hello <strong>${displayName}</strong>! 👋
          </p>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
            Thank you for joining Yunchi Checker. We're excited to have you on board!
          </p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 25px; margin: 25px 0;">
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
          
          <h2 style="color: #333; font-size: 18px; margin: 30px 0 15px 0;">🚀 Getting Started</h2>
          
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px;">
            <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">1. Top Up Your Balance</h3>
            <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
              Add credits to your account via crypto payment. Visit the Balance page to get started.
            </p>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px;">
            <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">2. Explore Available Gateways</h3>
            <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
              Check out our gateways page to see all available checking options and their credit costs.
            </p>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 15px;">
            <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">3. Connect Telegram Notifications</h3>
            <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
              Stay updated with real-time alerts via our Telegram bot @YunchiSupportbot.
            </p>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
            <h3 style="color: #333; margin: 0 0 10px 0; font-size: 16px;">4. Need Help?</h3>
            <p style="color: #666; margin: 0; font-size: 14px; line-height: 1.5;">
              Visit our Support page to submit a ticket or reach out via Telegram for quick assistance.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://yunchicheck.lovable.app/dashboard" 
               style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #fff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Go to Dashboard →
            </a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 25px; padding: 20px;">
          <p style="color: #888; font-size: 12px; margin: 0 0 10px 0;">
            If you didn't create this account, please ignore this email.
          </p>
          <p style="color: #999; font-size: 12px; margin: 0;">
            — Yunchi Team
          </p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Yunchi <onboarding@resend.dev>",
        to: [email],
        subject: "🎉 Welcome to Yunchi - Your Account is Ready!",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await emailResponse.json();
    console.log(`Welcome email sent successfully to ${email}:`, result);

    return new Response(
      JSON.stringify({ success: true, message: "Welcome email sent" }),
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

import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

// Declare EdgeRuntime for Supabase edge functions
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
} | undefined;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TopupNotificationRequest {
  transaction_id: string;
  user_id: string;
  amount: number;
  status: string;
  payment_method: string;
  rejection_reason?: string;
}

interface ReceiptData {
  transactionId: string;
  username: string;
  email: string;
  credits: number;
  paymentMethod: string;
  currentBalance: number;
  date: Date;
}

async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const primaryColor = rgb(0.86, 0.15, 0.15); // #dc2626
  const darkGray = rgb(0.2, 0.2, 0.2);
  const lightGray = rgb(0.6, 0.6, 0.6);
  const black = rgb(0, 0, 0);
  
  // Header background
  page.drawRectangle({
    x: 0,
    y: height - 120,
    width: width,
    height: 120,
    color: primaryColor,
  });
  
  // Logo/Brand name
  page.drawText("YUNCHI", {
    x: 50,
    y: height - 60,
    size: 32,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  
  page.drawText("CHECKER", {
    x: 50,
    y: height - 90,
    size: 18,
    font: helvetica,
    color: rgb(1, 1, 1),
  });
  
  // Receipt title
  page.drawText("PURCHASE RECEIPT", {
    x: width - 200,
    y: height - 75,
    size: 16,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  
  // Receipt number and date
  const formattedDate = data.date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = data.date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  let yPosition = height - 160;
  
  // Receipt details header
  page.drawText("Receipt Details", {
    x: 50,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: darkGray,
  });
  
  yPosition -= 30;
  
  // Transaction ID
  page.drawText("Transaction ID:", {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: lightGray,
  });
  page.drawText(data.transactionId, {
    x: 180,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: black,
  });
  
  yPosition -= 25;
  
  // Date
  page.drawText("Date:", {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: lightGray,
  });
  page.drawText(`${formattedDate} at ${formattedTime}`, {
    x: 180,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black,
  });
  
  yPosition -= 40;
  
  // Customer details header
  page.drawText("Customer Information", {
    x: 50,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: darkGray,
  });
  
  yPosition -= 30;
  
  // Username
  page.drawText("Username:", {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: lightGray,
  });
  page.drawText(data.username, {
    x: 180,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black,
  });
  
  yPosition -= 25;
  
  // Email
  page.drawText("Email:", {
    x: 50,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: lightGray,
  });
  page.drawText(data.email, {
    x: 180,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black,
  });
  
  yPosition -= 50;
  
  // Purchase details box
  page.drawRectangle({
    x: 40,
    y: yPosition - 100,
    width: width - 80,
    height: 120,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  });
  
  yPosition -= 20;
  
  page.drawText("Purchase Summary", {
    x: 50,
    y: yPosition,
    size: 14,
    font: helveticaBold,
    color: darkGray,
  });
  
  yPosition -= 30;
  
  // Item line
  page.drawText("Credit Package", {
    x: 60,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black,
  });
  page.drawText(`${data.credits.toLocaleString()} Credits`, {
    x: width - 180,
    y: yPosition,
    size: 11,
    font: helveticaBold,
    color: black,
  });
  
  yPosition -= 25;
  
  // Payment method
  const paymentMethodLabels: Record<string, string> = {
    btc: "Bitcoin",
    eth: "Ethereum",
    ltc: "Litecoin",
    usdt: "USDT TRC20"
  };
  const methodLabel = paymentMethodLabels[data.paymentMethod] || data.paymentMethod;
  
  page.drawText("Payment Method", {
    x: 60,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black,
  });
  page.drawText(methodLabel, {
    x: width - 180,
    y: yPosition,
    size: 11,
    font: helvetica,
    color: black,
  });
  
  yPosition -= 60;
  
  // Balance after purchase
  page.drawRectangle({
    x: 40,
    y: yPosition - 50,
    width: width - 80,
    height: 60,
    color: primaryColor,
  });
  
  page.drawText("New Account Balance", {
    x: 60,
    y: yPosition - 20,
    size: 12,
    font: helvetica,
    color: rgb(1, 1, 1),
  });
  
  page.drawText(`${data.currentBalance.toLocaleString()} Credits`, {
    x: width - 200,
    y: yPosition - 20,
    size: 16,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });
  
  yPosition -= 100;
  
  // Footer
  page.drawText("Thank you for your purchase!", {
    x: 50,
    y: yPosition,
    size: 12,
    font: helveticaBold,
    color: darkGray,
  });
  
  yPosition -= 25;
  
  page.drawText("This is an official receipt from Yunchi Checker. If you have any questions,", {
    x: 50,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: lightGray,
  });
  
  yPosition -= 15;
  
  page.drawText("please contact our support team.", {
    x: 50,
    y: yPosition,
    size: 10,
    font: helvetica,
    color: lightGray,
  });
  
  // Bottom footer with website
  page.drawText("yunchicheck.lovable.app", {
    x: width / 2 - 60,
    y: 30,
    size: 10,
    font: helvetica,
    color: lightGray,
  });
  
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  try {
    console.log("Sending Telegram message to:", chatId);
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
    const result = await response.json();
    console.log("Telegram response:", result);
    return result.ok;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
}

async function sendEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  text: string,
  attachments?: EmailAttachment[],
  isTransactional: boolean = true
): Promise<boolean> {
  try {
    console.log("Sending email to:", to, "with", attachments?.length || 0, "attachments");
    const result = await resend.emails.send({
      from: "Yunchi <noreply@yunchicheck.com>",
      reply_to: "support@yunchicheck.lovable.app",
      to: [to],
      subject,
      html,
      text,
      attachments: attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
      })),
      headers: {
        "X-Entity-Ref-ID": crypto.randomUUID(),
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        "Importance": "high",
        "X-PM-Message-Stream": "outbound",
        "X-Auto-Response-Suppress": "OOF, AutoReply",
      },
      tags: isTransactional ? [
        { name: "category", value: "transactional" },
        { name: "type", value: "purchase" }
      ] : undefined,
    });
    console.log("Email result:", JSON.stringify(result));
    if (result.error) {
      console.error("Resend error:", result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  isTransactional: boolean = true
): Promise<boolean> {
  return sendEmailWithAttachment(to, subject, html, text, undefined, isTransactional);
}

async function processNotification(data: TopupNotificationRequest): Promise<{ telegramSent: boolean; emailSent: boolean; emailSkipped: boolean }> {
  const { transaction_id, user_id, amount, status, payment_method, rejection_reason } = data;

  console.log("Processing topup notification:", { transaction_id, user_id, amount, status, rejection_reason });

  // Create Supabase client with service role
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Get user profile and email
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("username, telegram_chat_id, credits")
    .eq("user_id", user_id)
    .single();

  if (profileError) {
    console.error("Error fetching profile:", profileError);
    throw new Error("Failed to fetch user profile");
  }

  // Get user email from auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(user_id);

  if (authError) {
    console.error("Error fetching auth user:", authError);
  }

  // Check email preferences
  const { data: emailPrefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("email_topup_status")
    .eq("user_id", user_id)
    .single();

  const emailOptedOut = emailPrefs?.email_topup_status === false;
  console.log("Email opt-out status:", emailOptedOut);

  const userEmail = authUser?.user?.email;
  const username = profile?.username || "User";
  const telegramChatId = profile?.telegram_chat_id;
  const currentCredits = profile?.credits || 0;

  console.log("User info:", { userEmail, username, telegramChatId, currentCredits, emailOptedOut });

  const paymentMethodLabels: Record<string, string> = {
    btc: "Bitcoin",
    eth: "Ethereum", 
    ltc: "Litecoin",
    usdt: "USDT TRC20"
  };

  const methodLabel = paymentMethodLabels[payment_method] || payment_method;
  const formattedCredits = `${Number(amount).toLocaleString()} credits`;
  const formattedCurrentCredits = `${Number(currentCredits).toLocaleString()} credits`;

  let telegramSent = false;
  let emailSent = false;
  let emailSkipped = false;

  if (status === "completed") {
    // APPROVED notification with new balance
    const telegramMessage = `
✅ <b>Credits Added!</b>

Hello <b>${username}</b>,

Your credit purchase has been approved and processed.

🪙 <b>Credits Added:</b> ${formattedCredits}
💳 <b>Method:</b> ${methodLabel}
📝 <b>Transaction ID:</b> <code>${transaction_id.slice(0, 8)}...</code>

💰 <b>New Balance:</b> ${formattedCurrentCredits}

Thank you for using Yunchi Checker!
    `.trim();

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
        <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">✅ Credits Added!</h1>
        </div>
        <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
          <p style="font-size: 16px;">Hello <strong style="color: #ef4444;">${username}</strong>,</p>
          <p style="color: #a3a3a3;">Your credit purchase has been approved and processed successfully.</p>
          
          <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2a1a1a;">
            <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Credits Added:</strong> ${formattedCredits}</p>
            <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Method:</strong> ${methodLabel}</p>
            <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Transaction ID:</strong> ${transaction_id.slice(0, 8)}...</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.8);">Your New Balance</p>
            <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; color: white;">${formattedCurrentCredits}</p>
          </div>
          
          <p style="color: #737373; font-size: 14px; text-align: center;">Thank you for using Yunchi Checker.</p>
        </div>
      </div>
    `;

    const emailText = `Hello ${username},

Your credit purchase has been approved and processed.

Credits Added: ${formattedCredits}
Method: ${methodLabel}
Transaction ID: ${transaction_id.slice(0, 8)}...

New Balance: ${formattedCurrentCredits}

Thank you for using Yunchi Checker.`;

    // Send notifications sequentially to ensure completion
    if (telegramChatId) {
      telegramSent = await sendTelegramMessage(telegramChatId, telegramMessage);
      console.log("Telegram sent for completed:", telegramSent);
    }

    if (userEmail) {
      if (emailOptedOut) {
        console.log("Skipping email - user opted out of topup status emails");
        emailSkipped = true;
      } else {
        // Generate PDF receipt
        try {
          console.log("Generating PDF receipt...");
          const receiptData: ReceiptData = {
            transactionId: transaction_id,
            username,
            email: userEmail,
            credits: amount,
            paymentMethod: payment_method,
            currentBalance: currentCredits,
            date: new Date(),
          };
          
          const pdfBytes = await generateReceiptPdf(receiptData);
          const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
          
          const attachments: EmailAttachment[] = [{
            filename: `yunchi-receipt-${transaction_id.slice(0, 8)}.pdf`,
            content: pdfBase64,
          }];
          
          console.log("PDF receipt generated, sending email with attachment...");
          emailSent = await sendEmailWithAttachment(
            userEmail, 
            `Purchase Confirmed: ${formattedCredits} Added - Yunchi`, 
            emailHtml, 
            emailText, 
            attachments,
            true
          );
        } catch (pdfError) {
          console.error("Error generating PDF, sending email without attachment:", pdfError);
          emailSent = await sendEmail(userEmail, `Purchase Confirmed: ${formattedCredits} Added - Yunchi`, emailHtml, emailText, true);
        }
        console.log("Email sent for completed:", emailSent);
      }
    }

    // Create notification in database
    const { error: notifError } = await supabaseAdmin.from("notifications").insert({
      user_id,
      type: "topup_approved",
      title: "Credits Added",
      message: `${formattedCredits} have been added via ${methodLabel}. New balance: ${formattedCurrentCredits}`,
      metadata: { transaction_id, amount, payment_method, new_credits: currentCredits }
    });

    if (notifError) {
      console.error("Error creating notification:", notifError);
    }

  } else if (status === "failed") {
    // REJECTED notification
    const reasonText = rejection_reason ? `\n\n📋 <b>Reason:</b> ${rejection_reason}` : "";
    const telegramMessage = `
❌ <b>Topup Rejected</b>

Hello <b>${username}</b>,

Unfortunately, your topup request has been rejected.

💰 <b>Credits:</b> ${formattedCredits}
💳 <b>Method:</b> ${methodLabel}
📝 <b>Transaction ID:</b> <code>${transaction_id.slice(0, 8)}...</code>${reasonText}

If you believe this was a mistake, please contact support with your transaction details.
    `.trim();

    const reasonHtml = rejection_reason 
      ? `<p style="margin: 10px 0; padding: 15px; background: #1a0a0a; border-left: 4px solid #ef4444; border-radius: 4px; color: #fca5a5;"><strong>Reason:</strong> ${rejection_reason}</p>` 
      : "";
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a;">
        <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">❌ Topup Rejected</h1>
        </div>
        <div style="background: #0f0f0f; padding: 30px; border-radius: 0 0 10px 10px; color: #e5e5e5; border: 1px solid #1a1a1a; border-top: none;">
          <p style="font-size: 16px;">Hello <strong style="color: #ef4444;">${username}</strong>,</p>
          <p style="color: #a3a3a3;">Unfortunately, your topup request has been rejected.</p>
          
          <div style="background: #1a0a0a; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #2a1a1a;">
            <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Credits:</strong> ${formattedCredits}</p>
            <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Method:</strong> ${methodLabel}</p>
            <p style="margin: 5px 0; color: #a3a3a3;"><strong style="color: #e5e5e5;">Transaction ID:</strong> ${transaction_id.slice(0, 8)}...</p>
          </div>
          
          ${reasonHtml}
          
          <p style="color: #737373; font-size: 14px;">If you believe this was a mistake, please contact support with your transaction details.</p>
        </div>
      </div>
    `;

    const emailText = `Hello ${username},

Unfortunately, your topup request has been rejected.

Credits: ${formattedCredits}
Method: ${methodLabel}
Transaction ID: ${transaction_id.slice(0, 8)}...
${rejection_reason ? `\nReason: ${rejection_reason}` : ""}

If you believe this was a mistake, please contact support with your transaction details.`;

    // Send notifications sequentially to ensure completion
    if (telegramChatId) {
      telegramSent = await sendTelegramMessage(telegramChatId, telegramMessage);
      console.log("Telegram sent for failed:", telegramSent);
    }

    if (userEmail) {
      if (emailOptedOut) {
        console.log("Skipping email - user opted out of topup status emails");
        emailSkipped = true;
      } else {
        emailSent = await sendEmail(userEmail, `Purchase Update: Request Not Approved - Yunchi`, emailHtml, emailText, true);
        console.log("Email sent for failed:", emailSent);
      }
    }

    // Create notification in database
    const notificationMessage = rejection_reason 
      ? `Your ${formattedCredits} topup via ${methodLabel} has been rejected. Reason: ${rejection_reason}`
      : `Your ${formattedCredits} topup via ${methodLabel} has been rejected. Please contact support if you need assistance.`;
    
    const { error: notifError } = await supabaseAdmin.from("notifications").insert({
      user_id,
      type: "topup_rejected",
      title: "Topup Rejected",
      message: notificationMessage,
      metadata: { transaction_id, amount, payment_method, rejection_reason }
    });

    if (notifError) {
      console.error("Error creating notification:", notifError);
    }
  }

  console.log("Notification processing complete:", { telegramSent, emailSent, emailSkipped });
  return { telegramSent, emailSent, emailSkipped };
}

// Use Deno.serve for better background task support
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: TopupNotificationRequest = await req.json();
    console.log("Received notification request:", data);

    // Process notification and wait for completion
    const notificationPromise = processNotification(data);
    
    // Use EdgeRuntime.waitUntil if available, otherwise await directly
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(notificationPromise);
      console.log("Background task scheduled");
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Notification processing started"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } else {
      // Fallback: await the promise directly
      const result = await notificationPromise;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          ...result
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  } catch (error: any) {
    console.error("Error in notify-topup-status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

// Handle shutdown gracefully
addEventListener('beforeunload', (ev: any) => {
  console.log('Function shutting down:', ev.detail?.reason);
});

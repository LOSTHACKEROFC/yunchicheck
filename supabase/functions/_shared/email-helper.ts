// Shared email helper with fallback mechanism for Resend
// This provides consistent email sending with domain verification fallback

import { Resend } from "https://esm.sh/resend@2.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  attachments?: { filename: string; content: string }[];
  highPriority?: boolean;
}

export interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send email with automatic fallback to resend.dev if custom domain is unverified
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email service not configured" };
  }

  const resend = new Resend(RESEND_API_KEY);
  
  // Primary domain first, then fallback
  const senders = [
    "Yunchi <noreply@yunchicheck.com>",
    "Yunchi <onboarding@resend.dev>"
  ];

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const supportEmail = "support@yunchicheck.com";

  for (const sender of senders) {
    try {
      console.log(`Sending email to ${recipients.join(", ")} from ${sender}`);
      
      const emailPayload: any = {
        from: sender,
        reply_to: options.replyTo || supportEmail,
        to: recipients,
        subject: options.subject,
        html: options.html,
      };

      if (options.text) {
        emailPayload.text = options.text;
      }

      if (options.attachments && options.attachments.length > 0) {
        emailPayload.attachments = options.attachments.map(att => ({
          filename: att.filename,
          content: att.content,
        }));
      }

      // Add headers for deliverability
      emailPayload.headers = {
        "X-Entity-Ref-ID": crypto.randomUUID(),
      };

      if (options.highPriority !== false) {
        emailPayload.headers["X-Priority"] = "1";
        emailPayload.headers["Importance"] = "high";
        emailPayload.headers["X-MSMail-Priority"] = "High";
      }

      if (options.tags && options.tags.length > 0) {
        emailPayload.tags = options.tags;
      }

      const result = await resend.emails.send(emailPayload);

      if (result.error) {
        const errorMessage = (result.error as any)?.message || "";
        console.error(`Resend error from ${sender}:`, result.error);
        
        // If domain not verified, try fallback
        if (
          errorMessage.includes("domain is not verified") ||
          (result.error as any)?.statusCode === 403
        ) {
          console.log("Domain not verified, trying fallback sender...");
          continue;
        }
        
        return { success: false, error: errorMessage };
      }

      console.log(`Email sent successfully from ${sender}:`, result.data?.id);
      return { success: true, messageId: result.data?.id };
    } catch (error) {
      console.error(`Error sending email from ${sender}:`, error);
      continue;
    }
  }

  console.error("All email senders failed");
  return { success: false, error: "All email delivery methods failed" };
}

/**
 * Send email with retry logic for transient failures
 */
export async function sendEmailWithRetry(
  options: EmailOptions,
  maxRetries: number = 2
): Promise<EmailResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendEmail(options);
    
    if (result.success) {
      return result;
    }

    // Don't retry on permanent errors
    if (result.error?.includes("not verified") || result.error?.includes("Invalid")) {
      return result;
    }

    if (attempt < maxRetries) {
      console.log(`Email attempt ${attempt} failed, retrying in ${attempt * 1000}ms...`);
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

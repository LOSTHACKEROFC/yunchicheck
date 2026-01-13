import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    reply_to_message?: {
      text?: string;
    };
  };
  callback_query?: {
    id: string;
    data: string;
    message?: {
      chat: { id: number };
      message_id: number;
    };
  };
}

async function sendTelegramMessage(
  chatId: string | number,
  message: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text,
          show_alert: true,
        }),
      }
    );
  } catch (error) {
    console.error("Error answering callback query:", error);
  }
}

async function editMessageReplyMarkup(
  chatId: number,
  messageId: number,
  ticketUuid: string,
  currentStatus: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;

  // Create keyboard with current status highlighted
  const statusButtons = [
    { text: currentStatus === "open" ? "✓ 🟡 Open" : "🟡 Open", callback_data: `open_${ticketUuid}` },
    { text: currentStatus === "processing" ? "✓ 🔵 Processing" : "🔵 Processing", callback_data: `processing_${ticketUuid}` },
  ];
  const statusButtons2 = [
    { text: currentStatus === "solved" ? "✓ 🟢 Solved" : "🟢 Solved", callback_data: `solved_${ticketUuid}` },
    { text: currentStatus === "closed" ? "✓ ⚫ Closed" : "⚫ Closed", callback_data: `closed_${ticketUuid}` },
  ];

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [statusButtons, statusButtons2],
          },
        }),
      }
    );
  } catch (error) {
    console.error("Error editing message reply markup:", error);
  }
}

async function sendEmailNotification(
  userEmail: string,
  ticketId: string,
  subject: string,
  message: string,
  adminName: string
): Promise<void> {
  if (!RESEND_API_KEY) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Support Team <onboarding@resend.dev>",
        to: [userEmail],
        subject: `[${ticketId}] New Reply to Your Support Ticket`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">New Reply to Your Ticket</h2>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Ticket:</strong> ${ticketId}</p>
              <p><strong>Subject:</strong> ${subject}</p>
            </div>
            <div style="background: #ffffff; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px;">
              <p style="color: #6c757d; margin-bottom: 10px;"><strong>${adminName}:</strong></p>
              <p style="white-space: pre-wrap;">${message}</p>
            </div>
            <p style="color: #6c757d; font-size: 14px; margin-top: 20px;">
              You can view the full conversation by logging into your account.
            </p>
          </div>
        `,
      }),
    });
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

async function sendUserTelegramNotification(
  chatId: string,
  ticketId: string,
  subject: string,
  message: string,
  adminName: string
): Promise<void> {
  const telegramMessage = `
<b>🎫 New Reply to Your Ticket</b>

<b>Ticket:</b> ${ticketId}
<b>Subject:</b> ${subject}

<b>${adminName}:</b>
${message}

<i>View the full conversation in your dashboard.</i>
`;
  await sendTelegramMessage(chatId, telegramMessage);
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received Telegram webhook");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const update: TelegramUpdate = await req.json();
    console.log("Telegram update:", JSON.stringify(update));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Handle callback query (button clicks)
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      console.log("Callback data:", callbackData);

      // Parse callback data: action_ticketUuid
      const [action, ticketUuid] = callbackData.split("_");

      if (!ticketUuid) {
        await answerCallbackQuery(update.callback_query.id, "❌ Invalid ticket data");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Map action to status
      const statusMap: Record<string, string> = {
        open: "open",
        processing: "processing",
        solved: "solved",
        closed: "closed",
      };

      const newStatus = statusMap[action];
      if (!newStatus) {
        await answerCallbackQuery(update.callback_query.id, "❌ Unknown action");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Update ticket status
      const { data: ticket, error: updateError } = await supabase
        .from("support_tickets")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", ticketUuid)
        .select("ticket_id, subject, user_id, user_email")
        .single();

      if (updateError) {
        console.error("Error updating ticket status:", updateError);
        await answerCallbackQuery(update.callback_query.id, "❌ Failed to update status");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      await answerCallbackQuery(
        update.callback_query.id,
        `✅ Ticket status updated to: ${newStatus.toUpperCase()}`
      );

      // Update the inline keyboard to show current status (keep buttons visible)
      if (update.callback_query.message) {
        await editMessageReplyMarkup(
          update.callback_query.message.chat.id,
          update.callback_query.message.message_id,
          ticketUuid,
          newStatus
        );
      }

      // Notify admin in chat
      await sendTelegramMessage(
        ADMIN_TELEGRAM_CHAT_ID!,
        `✅ <b>Status Updated</b>\n\nTicket: ${ticket.ticket_id}\nNew Status: <b>${newStatus.toUpperCase()}</b>`
      );

      // Notify user about status change
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("user_id", ticket.user_id)
        .maybeSingle();

      if (profile?.telegram_chat_id) {
        await sendTelegramMessage(
          profile.telegram_chat_id,
          `🎫 <b>Ticket Status Updated</b>\n\nTicket: ${ticket.ticket_id}\nSubject: ${ticket.subject}\nNew Status: <b>${newStatus.toUpperCase()}</b>`
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle text messages (replies)
    if (update.message?.text && update.message.reply_to_message) {
      const chatId = update.message.chat.id.toString();
      const replyText = update.message.text;
      const originalMessage = update.message.reply_to_message.text || "";

      // Check if this is from admin
      if (chatId !== ADMIN_TELEGRAM_CHAT_ID) {
        console.log("Message not from admin, ignoring");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Extract ticket UUID from the original message
      // Look for pattern: [uuid] in the message
      const uuidMatch = originalMessage.match(/\[([a-f0-9-]{36})\]/i);
      if (!uuidMatch) {
        await sendTelegramMessage(
          chatId,
          "❌ Could not find ticket ID. Please reply directly to a ticket notification message."
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const ticketUuid = uuidMatch[1];

      // Get ticket details
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, subject, user_id, user_email, status")
        .eq("id", ticketUuid)
        .single();

      if (ticketError || !ticket) {
        await sendTelegramMessage(chatId, "❌ Ticket not found.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (ticket.status === "closed") {
        await sendTelegramMessage(chatId, "❌ This ticket is closed and cannot receive replies.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Insert admin message
      const { error: messageError } = await supabase.from("ticket_messages").insert({
        ticket_id: ticket.id,
        user_id: ticket.user_id,
        message: replyText,
        is_admin: true,
      });

      if (messageError) {
        console.error("Failed to save message:", messageError);
        await sendTelegramMessage(chatId, "❌ Failed to save reply.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Update ticket status to processing if it's open
      if (ticket.status === "open") {
        await supabase
          .from("support_tickets")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", ticket.id);
      }

      // Notify user via email
      await sendEmailNotification(
        ticket.user_email,
        ticket.ticket_id,
        ticket.subject,
        replyText,
        "Support Team"
      );

      // Notify user via Telegram
      const { data: profile } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .eq("user_id", ticket.user_id)
        .maybeSingle();

      if (profile?.telegram_chat_id) {
        await sendUserTelegramNotification(
          profile.telegram_chat_id,
          ticket.ticket_id,
          ticket.subject,
          replyText,
          "Support Team"
        );
      }

      await sendTelegramMessage(chatId, `✅ Reply sent to ticket ${ticket.ticket_id}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /start command
    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id.toString();
      await sendTelegramMessage(
        chatId,
        `👋 <b>Welcome to Yunchi Support Bot</b>\n\nThis bot notifies you about new support tickets and allows you to:\n• Reply to tickets directly\n• Change ticket status\n\n<b>Commands:</b>\n/ticket [ticket_id] - View and manage a ticket\n/start - Show this message\n\nYour Chat ID: <code>${chatId}</code>\n\nReply to ticket notifications to respond to users.`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle /ticket command
    if (update.message?.text?.startsWith("/ticket")) {
      const chatId = update.message.chat.id.toString();
      const parts = update.message.text.split(" ");
      
      if (parts.length < 2) {
        await sendTelegramMessage(
          chatId,
          "❌ Please provide a ticket ID.\n\n<b>Usage:</b> /ticket TKT-XXXXXX\n<b>Example:</b> /ticket TKT-M1ABC2"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const inputTicketId = parts[1].trim().toUpperCase();
      
      // Fetch ticket by ticket_id
      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, subject, message, status, user_email, user_id, created_at")
        .eq("ticket_id", inputTicketId)
        .single();
      
      if (ticketError || !ticket) {
        await sendTelegramMessage(
          chatId,
          `❌ Ticket not found: <code>${inputTicketId}</code>\n\nMake sure you entered the correct ticket ID.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      // Fetch conversation messages
      const { data: messages } = await supabase
        .from("ticket_messages")
        .select("message, is_admin, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      
      // Build conversation text
      let conversationText = "";
      if (messages && messages.length > 0) {
        const recentMessages = messages.slice(-5); // Show last 5 messages
        conversationText = "\n\n<b>📝 Recent Messages:</b>\n" + recentMessages.map(m => 
          `${m.is_admin ? "👨‍💼 Admin" : "👤 User"}: ${m.message.substring(0, 100)}${m.message.length > 100 ? "..." : ""}`
        ).join("\n\n");
        
        if (messages.length > 5) {
          conversationText = `\n<i>(Showing last 5 of ${messages.length} messages)</i>` + conversationText;
        }
      }
      
      // Status emoji mapping
      const statusEmoji: Record<string, string> = {
        open: "🟡",
        processing: "🔵",
        solved: "🟢",
        closed: "⚫"
      };
      
      const emoji = statusEmoji[ticket.status] || "⚪";
      const createdDate = new Date(ticket.created_at).toLocaleString();
      
      const ticketDetails = `
🎫 <b>Ticket Details</b>

<b>ID:</b> ${ticket.ticket_id}
<b>Subject:</b> ${ticket.subject}
<b>Status:</b> ${emoji} ${ticket.status.toUpperCase()}
<b>Email:</b> ${ticket.user_email}
<b>Created:</b> ${createdDate}

<b>Original Message:</b>
${ticket.message.substring(0, 500)}${ticket.message.length > 500 ? "..." : ""}${conversationText}

[${ticket.id}]
<i>💡 Reply to this message to respond to the user.</i>
`;
      
      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "🟡 Open", callback_data: `open_${ticket.id}` },
            { text: "🔵 Processing", callback_data: `processing_${ticket.id}` },
          ],
          [
            { text: "🟢 Solved", callback_data: `solved_${ticket.id}` },
            { text: "⚫ Closed", callback_data: `closed_${ticket.id}` },
          ],
        ],
      };
      
      await sendTelegramMessage(chatId, ticketDetails, inlineKeyboard);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in telegram-webhook function:", error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);

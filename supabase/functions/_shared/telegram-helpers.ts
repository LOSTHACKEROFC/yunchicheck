// Shared Telegram helper functions

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

// Send Telegram message (text only)
export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
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

    console.log("Telegram notification sent successfully to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

// Send Telegram animation with caption
export async function sendTelegramAnimation(chatId: string, gifUrl: string, caption: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAnimation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          animation: gifUrl,
          caption: caption,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram API error:", errorData);
      // Fallback to text message if animation fails
      return await sendTelegramMessage(chatId, caption);
    }

    console.log("Telegram animation sent successfully to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram animation:", error);
    // Fallback to text message
    return await sendTelegramMessage(chatId, caption);
  }
}

// Send Telegram photo with caption
export async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram bot token not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: "HTML",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Telegram photo API error:", errorData);
      // Fallback to text message if photo fails
      return await sendTelegramMessage(chatId, caption);
    }

    console.log("Telegram photo sent successfully to:", chatId);
    return true;
  } catch (error) {
    console.error("Error sending Telegram photo:", error);
    // Fallback to text message
    return await sendTelegramMessage(chatId, caption);
  }
}

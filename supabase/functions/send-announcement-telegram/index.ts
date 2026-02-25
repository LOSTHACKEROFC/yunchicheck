const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnnouncementPayload {
  chat_ids: string[];
  title: string;
  message: string;
  announcement_type: string;
  link_url?: string | null;
  link_label?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: AnnouncementPayload = await req.json();
    const { chat_ids, title, message, announcement_type, link_url, link_label } = payload;

    const typeEmoji: Record<string, string> = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      urgent: "🚨",
    };

    const emoji = typeEmoji[announcement_type] || "📢";

    let text = `${emoji} <b>${title}</b>\n\n${message}`;
    if (link_url) {
      text += `\n\n🔗 <a href="${link_url}">${link_label || "Open Link"}</a>`;
    }

    const replyMarkup = link_url
      ? { inline_keyboard: [[{ text: `🔗 ${link_label || "Open Link"}`, url: link_url }]] }
      : undefined;

    let sent = 0;
    for (const chatId of chat_ids) {
      try {
        const body: Record<string, unknown> = {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        };
        if (replyMarkup) body.reply_markup = replyMarkup;

        const res = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (res.ok) sent++;
        else console.error(`Failed to send to ${chatId}:`, await res.text());
      } catch (e) {
        console.error(`Error sending to ${chatId}:`, e);
      }
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 50));
    }

    return new Response(
      JSON.stringify({ success: true, sent, total: chat_ids.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

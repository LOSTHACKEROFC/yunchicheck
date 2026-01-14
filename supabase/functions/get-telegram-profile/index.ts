import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramUserProfilePhotos {
  total_count: number;
  photos: Array<Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
  }>>;
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }

    const { chat_id } = await req.json();

    if (!chat_id) {
      return new Response(
        JSON.stringify({ error: "chat_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's chat/profile info
    const chatResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${chat_id}`
    );
    const chatData = await chatResponse.json();

    if (!chatData.ok) {
      console.error("Failed to get chat info:", chatData);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Telegram profile", details: chatData.description }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chat = chatData.result;
    
    // Build response with user info
    const result: {
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    } = {
      first_name: chat.first_name,
      last_name: chat.last_name,
      username: chat.username,
    };

    // Get user profile photos
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUserProfilePhotos?user_id=${chat_id}&limit=1`
    );
    const photosData = await photosResponse.json();

    if (photosData.ok && photosData.result.total_count > 0) {
      // Get the largest photo (last in the array)
      const photos = photosData.result.photos[0];
      const largestPhoto = photos[photos.length - 1];
      
      // Get file path
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${largestPhoto.file_id}`
      );
      const fileData = await fileResponse.json();

      if (fileData.ok && fileData.result.file_path) {
        result.photo_url = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-telegram-profile:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

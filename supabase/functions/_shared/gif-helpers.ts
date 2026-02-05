// Shared GIF helper functions

const TENOR_API_KEY = Deno.env.get("TENOR_API_KEY");

// Fallback anime GIFs in case Tenor API fails
const FALLBACK_GIFS = [
  "https://media.giphy.com/media/Ju8RiMNjR7TJS/giphy.gif",
  "https://media.giphy.com/media/vxvNnSOyPIbKM/giphy.gif",
  "https://media.giphy.com/media/dxld1UBIiGuoh31Fus/giphy.gif",
  "https://media.giphy.com/media/ohT1vVoz1lWXEMoGzM/giphy.gif",
];

// Fetch random anime GIF from Tenor API
export async function getRandomAnimeGif(): Promise<string> {
  if (!TENOR_API_KEY) {
    console.log("Tenor API key not configured, using fallback GIF");
    return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
  }

  try {
    const searchTerms = ["anime celebration", "anime victory", "anime happy", "anime excited", "anime power up"];
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(randomTerm)}&key=${TENOR_API_KEY}&limit=50&media_filter=gif`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("Tenor API error:", response.status);
      return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const randomIndex = Math.floor(Math.random() * data.results.length);
      const gif = data.results[randomIndex];
      
      const gifUrl = gif.media_formats?.gif?.url || 
                     gif.media_formats?.tinygif?.url ||
                     gif.media_formats?.nanogif?.url;
      
      if (gifUrl) {
        console.log("Fetched random anime GIF from Tenor:", gifUrl);
        return gifUrl;
      }
    }

    console.log("No GIFs found from Tenor, using fallback");
    return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
  } catch (error) {
    console.error("Error fetching from Tenor API:", error);
    return FALLBACK_GIFS[Math.floor(Math.random() * FALLBACK_GIFS.length)];
  }
}

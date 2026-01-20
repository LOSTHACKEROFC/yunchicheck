import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create service role client for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // SECURITY: Require admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log("[IMPORT-URLS] No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Validate user token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.log("[IMPORT-URLS] Invalid token:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is an admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.log("[IMPORT-URLS] User is not admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[IMPORT-URLS] Admin ${user.id} importing URLs`);

    // Parse the request body - expects array of URLs
    const { urls } = await req.json();

    if (!urls || !Array.isArray(urls)) {
      return new Response(
        JSON.stringify({ error: "urls must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: max 5000 URLs per request
    if (urls.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Maximum 5000 URLs per request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${urls.length} URLs for import...`);

    // Clean and normalize URLs with validation
    const cleanedUrls = urls
      .map((url: string) => {
        if (typeof url !== 'string') return '';
        return url.trim();
      })
      .filter((url: string) => url.length > 0 && url.length < 2048) // URL length limit
      .filter((url: string) => url.startsWith("http://") || url.startsWith("https://"));

    // Remove duplicates
    const uniqueUrls = [...new Set(cleanedUrls)];
    console.log(`Found ${uniqueUrls.length} unique valid URLs`);

    // Process in batches to avoid timeout
    const batchSize = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const batch = uniqueUrls.slice(i, i + batchSize);
      const urlObjects = batch.map((url: string) => ({ url }));

      const { data, error } = await supabaseAdmin
        .from("gateway_urls")
        .upsert(urlObjects, { onConflict: "url", ignoreDuplicates: true })
        .select();

      if (error) {
        console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error);
        // Continue with other batches even if one fails
      } else {
        inserted += data?.length || 0;
        console.log(`Batch ${Math.floor(i / batchSize) + 1}: Inserted ${data?.length || 0} URLs`);
      }
    }

    // Get total count in database
    const { count } = await supabaseAdmin
      .from("gateway_urls")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Imported ${inserted} URLs (${skipped} duplicates skipped)`,
        total_in_database: count,
        processed: uniqueUrls.length,
        imported_by: user.id
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Import error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

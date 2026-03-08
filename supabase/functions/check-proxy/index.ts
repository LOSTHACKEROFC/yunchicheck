import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proxies } = await req.json();
    
    if (!proxies || !Array.isArray(proxies) || proxies.length === 0) {
      return new Response(JSON.stringify({ error: 'No proxies provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check each proxy concurrently
    const results = await Promise.all(
      proxies.map(async (proxy: { ip: string; port: string; username?: string; password?: string; id?: string }) => {
        const proxyStr = proxy.username && proxy.password
          ? `${proxy.ip}:${proxy.port}:${proxy.username}:${proxy.password}`
          : `${proxy.ip}:${proxy.port}`;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);

          // Method 1: ProxyScrape API
          const response = await fetch(
            `https://api.proxyscrape.com/v4/accounts/freebies/ipport/check?proxy=${encodeURIComponent(proxyStr)}`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);

          if (response.ok) {
            const data = await response.json();
            const alive = data?.alive === true || data?.status === "alive";
            return {
              id: proxy.id || null,
              ip: proxy.ip,
              port: proxy.port,
              status: alive ? "live" : "dead",
              response_time: data?.time_elapsed || null,
              country: data?.country || null,
            };
          }

          // Method 2: Fallback - try direct TCP-like test via fetch
          try {
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), 8000);
            
            const testResp = await fetch(`http://${proxy.ip}:${proxy.port}`, {
              signal: controller2.signal,
              method: 'HEAD',
            });
            clearTimeout(timeout2);
            
            return {
              id: proxy.id || null,
              ip: proxy.ip,
              port: proxy.port,
              status: testResp.status ? "live" : "dead",
            };
          } catch {
            return {
              id: proxy.id || null,
              ip: proxy.ip,
              port: proxy.port,
              status: "dead",
            };
          }
        } catch (err) {
          return {
            id: proxy.id || null,
            ip: proxy.ip,
            port: proxy.port,
            status: "dead",
            error: err.message,
          };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

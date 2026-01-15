import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BinResponse {
  brand: string;
  type: string;
  level: string;
  bank: string;
  country: string;
  countryCode: string;
  brandColor: string;
  isRealData: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bin } = await req.json();
    
    if (!bin || bin.length < 6) {
      return new Response(
        JSON.stringify({ error: 'BIN must be at least 6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const binDigits = bin.replace(/\D/g, '').slice(0, 8);
    console.log(`Looking up BIN: ${binDigits}`);

    // Try binlist.net API (free, no API key needed)
    try {
      const response = await fetch(`https://lookup.binlist.net/${binDigits}`, {
        headers: {
          'Accept-Version': '3',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('BIN API response:', JSON.stringify(data));

        // Determine brand color based on scheme
        const getBrandColor = (scheme: string): string => {
          const schemeColors: Record<string, string> = {
            'visa': 'bg-blue-600',
            'mastercard': 'bg-orange-600',
            'amex': 'bg-green-600',
            'american express': 'bg-green-600',
            'discover': 'bg-orange-500',
            'jcb': 'bg-red-600',
            'unionpay': 'bg-red-700',
            'diners club': 'bg-gray-700',
            'maestro': 'bg-blue-700',
          };
          return schemeColors[scheme?.toLowerCase()] || 'bg-gray-500';
        };

        const result: BinResponse = {
          brand: data.scheme?.toUpperCase() || 'Unknown',
          type: data.type?.charAt(0).toUpperCase() + data.type?.slice(1) || 'Unknown',
          level: data.brand || 'Standard',
          bank: data.bank?.name || 'Unknown Bank',
          country: data.country?.name || 'Unknown',
          countryCode: data.country?.alpha2 || 'XX',
          brandColor: getBrandColor(data.scheme),
          isRealData: true,
        };

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (apiError) {
      console.error('BIN API error:', apiError);
      // Fall through to fallback
    }

    // Fallback: local detection
    console.log('Using fallback detection');
    const fallbackResult = detectCardBrandFallback(binDigits);
    
    return new Response(
      JSON.stringify(fallbackResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('BIN lookup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to lookup BIN', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function detectCardBrandFallback(digits: string): BinResponse {
  let result: BinResponse = {
    brand: "Unknown",
    type: "Unknown",
    level: "Standard",
    bank: "Unknown Bank",
    country: "Unknown",
    countryCode: "XX",
    brandColor: "bg-gray-500",
    isRealData: false,
  };

  // Visa patterns
  if (/^4/.test(digits)) {
    result.brand = "VISA";
    result.brandColor = "bg-blue-600";
    result.type = "Credit/Debit";
    if (/^4(17500|22100|84410|85600)/.test(digits)) {
      result.level = "Signature";
    } else if (/^4(00000|11111|22222)/.test(digits)) {
      result.level = "Infinite";
    }
  }
  // Mastercard patterns
  else if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) {
    result.brand = "MASTERCARD";
    result.brandColor = "bg-orange-600";
    result.type = "Credit/Debit";
    if (/^5[1-5](5|4|3)/.test(digits)) {
      result.level = "World";
    } else if (/^5[1-5](6|7|8|9)/.test(digits)) {
      result.level = "World Elite";
    }
  }
  // American Express patterns
  else if (/^3[47]/.test(digits)) {
    result.brand = "AMEX";
    result.brandColor = "bg-green-600";
    result.type = "Credit";
    result.level = /^37/.test(digits) ? "Gold/Platinum" : "Green";
  }
  // Discover patterns
  else if (/^6(?:011|5|4[4-9]|22)/.test(digits)) {
    result.brand = "DISCOVER";
    result.brandColor = "bg-orange-500";
    result.type = "Credit";
  }
  // Diners Club
  else if (/^3(?:0[0-5]|[68])/.test(digits)) {
    result.brand = "DINERS CLUB";
    result.brandColor = "bg-gray-700";
    result.type = "Credit";
  }
  // JCB
  else if (/^35(?:2[89]|[3-8])/.test(digits)) {
    result.brand = "JCB";
    result.brandColor = "bg-red-600";
    result.type = "Credit";
  }
  // UnionPay
  else if (/^62/.test(digits)) {
    result.brand = "UNIONPAY";
    result.brandColor = "bg-red-700";
    result.type = "Credit/Debit";
  }
  // Maestro
  else if (/^(?:5[06-9]|6)/.test(digits)) {
    result.brand = "MAESTRO";
    result.brandColor = "bg-blue-700";
    result.type = "Debit";
  }

  return result;
}

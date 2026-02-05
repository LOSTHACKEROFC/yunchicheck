// Shared BIN lookup and card helper functions

export interface BinInfo {
  brand: string;
  type: string;
  level: string;
  bank: string;
  country: string;
  countryCode: string;
}

// Get country flag emoji from country code
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) {
    return '🌍';
  }
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Get card brand emoji
export function getBrandEmoji(brand: string): string {
  const brandEmojis: Record<string, string> = {
    'VISA': '💳',
    'MASTERCARD': '💳',
    'AMEX': '💎',
    'AMERICAN EXPRESS': '💎',
    'DISCOVER': '🔍',
    'JCB': '🎌',
    'UNIONPAY': '🇨🇳',
    'DINERS CLUB': '🍽️',
    'MAESTRO': '🎵',
  };
  return brandEmojis[brand?.toUpperCase()] || '💳';
}

// Lookup BIN information
export async function lookupBin(bin: string): Promise<BinInfo> {
  const defaultInfo: BinInfo = {
    brand: "Unknown",
    type: "Unknown",
    level: "Standard",
    bank: "Unknown Bank",
    country: "Unknown",
    countryCode: "XX",
  };

  try {
    const response = await fetch(`https://lookup.binlist.net/${bin.slice(0, 8)}`, {
      headers: { 'Accept-Version': '3' },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        brand: data.scheme?.toUpperCase() || "Unknown",
        type: data.type?.charAt(0).toUpperCase() + data.type?.slice(1) || "Unknown",
        level: data.brand || "Standard",
        bank: data.bank?.name || "Unknown Bank",
        country: data.country?.name || "Unknown",
        countryCode: data.country?.alpha2 || "XX",
      };
    }
  } catch (error) {
    console.error("BIN lookup error:", error);
  }

  // Fallback detection
  if (/^4/.test(bin)) {
    defaultInfo.brand = "VISA";
  } else if (/^5[1-5]/.test(bin) || /^2[2-7]/.test(bin)) {
    defaultInfo.brand = "MASTERCARD";
  } else if (/^3[47]/.test(bin)) {
    defaultInfo.brand = "AMEX";
  } else if (/^6(?:011|5|4[4-9]|22)/.test(bin)) {
    defaultInfo.brand = "DISCOVER";
  }

  return defaultInfo;
}

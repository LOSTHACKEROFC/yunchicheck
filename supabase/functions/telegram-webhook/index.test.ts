import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

const extractArrayBlock = (startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract block: ${startMarker}`);
  }

  return source.slice(start, end);
};

const extractPriceGroups = (block: string) =>
  [...block.matchAll(/\{ label: "([^"]+)", min: (\d+), max: (\d+), emoji: "([^"]+)" \}/g)].map(
    ([, label, min, max, emoji]) => ({
      label,
      min: Number(min),
      max: Number(max),
      emoji,
    }),
  );

Deno.test("/mtxt recheck keeps the same price selection as the initial step", () => {
  const initialBlock = extractArrayBlock(
    "const mtxtPriceGroups = [",
    "const mtxtGroupCounts = await Promise.all",
  );
  const recheckBlock = extractArrayBlock(
    "const rechkPriceGroups = [",
    "const rechkGroupCounts = await Promise.all",
  );

  const initialGroups = extractPriceGroups(initialBlock);
  const recheckGroups = extractPriceGroups(recheckBlock);

  assertEquals(recheckGroups, initialGroups);
  assertEquals(recheckGroups, [
    { label: "$0 – $10", min: 0, max: 10, emoji: "💰" },
    { label: "$10 – $20", min: 10, max: 20, emoji: "💎" },
    { label: "$20 – $35", min: 20, max: 35, emoji: "🔥" },
    { label: "$35 – $100", min: 35, max: 100, emoji: "⚡" },
  ]);
  assertMatch(source, /callback_data: `mtxt_\$\{g\.min\}_\$\{g\.max\}_\$\{newBulkId\}`/);
});

Deno.test("/mtxt classifies CARD_DECLINED as dead before charged keywords", () => {
  const mtxtParserBlock = extractArrayBlock(
    "const combinedText = ((json.status || '') + ' ' + responseText).toLowerCase();",
    "return { status: apiStatus, message: apiMessage, price, priceStr, proxyDead: false, siteDead: false, response: apiResponse, rawResponse: rawText };",
  );

  const declinedCheck = mtxtParserBlock.indexOf("combinedText.includes('card_declined')");
  const chargedCheck = mtxtParserBlock.indexOf("json.status === 'CHARGED'");
  const rawDeclinedCheck = mtxtParserBlock.indexOf("lower.includes('card_declined')");
  const rawChargedCheck = mtxtParserBlock.indexOf("lower.includes('charged')");

  assertEquals(declinedCheck > -1, true);
  assertEquals(chargedCheck > -1, true);
  assertEquals(declinedCheck < chargedCheck, true);
  assertEquals(rawDeclinedCheck > -1, true);
  assertEquals(rawChargedCheck > -1, true);
  assertEquals(rawDeclinedCheck < rawChargedCheck, true);
});

Deno.test("/mtxt mirrors Shopify Charge price filtering, retry count, and site attempts", () => {
  const mtxtBlock = extractArrayBlock(
    "let mtxtSitesQuery = supabase.from(\"gateway_urls\")",
    "const mtxtCheckCard = async (cardCC: string)",
  );

  assertMatch(mtxtBlock, /mtxtSitesQuery = mtxtSitesQuery\.gte\("price", mtxtPriceMin\)/);
  assertMatch(mtxtBlock, /mtxtSitesQuery = mtxtSitesQuery\.lt\("price", mtxtPriceMax\)/);
  assertMatch(mtxtBlock, /const MTXT_MAX_RETRIES = 4;/);
  assertMatch(source, /const MAX_MTXT_SITE_ATTEMPTS = 3;/);
  assertMatch(source, /const MTXT_CHUNK_SIZE = 200;/);
  assertMatch(source, /const MTXT_CONCURRENCY = 50;/);
});

Deno.test("/mtxt maps API Charged boolean/string values explicitly", () => {
  assertMatch(source, /const chargedValue = json\.Charged \?\? json\.charged;/);
  assertMatch(source, /chargedNormalized === false \|\| chargedNormalized === 'false'/);
  assertMatch(source, /chargedNormalized === true \|\| chargedNormalized === 'true'/);
  assertMatch(source, /rawChargedFalse/);
  assertMatch(source, /rawChargedTrue/);
});

Deno.test("Shopify bot flows treat API Response TIMEOUT as dead proxy and remove it", () => {
  assertMatch(source, /const shIsApiTimeoutProxyDead = \(rawText: string\): boolean =>/);
  assertMatch(source, /const mtxtIsApiTimeoutProxyDead = \(rawText: string\): boolean =>/);
  assertMatch(source, /response\.trim\(\)\.toUpperCase\(\) === 'TIMEOUT'/);
  assertMatch(source, /shIsApiTimeoutProxyDead\(rawText\)/);
  assertMatch(source, /mtxtIsApiTimeoutProxyDead\(rawText\)/);
  assertMatch(source, /\.from\('user_proxies'\)\.delete\(\)\.eq\('id', currentProxy\.id\)\.eq\('user_id', shProfile\.user_id\)/);
  assertMatch(source, /\.from\('user_proxies'\)\.delete\(\)\.eq\('id', proxy\.id\)\.eq\('user_id', mtxtProfile\.user_id\)/);
});

Deno.test("Shopify bot flows send all-proxies-dead debug with raw API responses", () => {
  assertMatch(source, /const failedProxyDebugs: string\[\] = \[\];/);
  assertMatch(source, /const mtxtFailedProxyDebugs: string\[\] = \[\];/);
  assertMatch(source, /Raw API: \$\{siteResult\.rawResponse \|\| siteResult\.message \|\| 'N\/A'\}/);
  assertMatch(source, /\/mtxt ALL PROXIES DEAD DEBUG/);
  assertMatch(source, /RAW API RESPONSES/);
});

Deno.test("Shopify bot flows send immediate proxy-dead debug with raw API response", () => {
  assertMatch(source, /SHOPIFY \/sh PROXY DEAD DEBUG/);
  assertMatch(source, /\/mtxt PROXY DEAD DEBUG/);
  assertMatch(source, /RAW API RESPONSE/);
  assertMatch(source, /siteResult\.rawResponse \|\| siteResult\.message \|\| 'N\/A'/);
});
import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

const extractBlock = (startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not extract block: ${startMarker}`);
  }

  return source.slice(start, end);
};

Deno.test("Shopify Charge classifies decline signals before charged/order-completed signals", () => {
  const parserBlock = extractBlock(
    "const declineSignals = [",
    "return { status: apiStatus, message: apiMessage, apiResponse, rawResponse: rawText, price, priceStr };",
  );

  const declineSignalCheck = parserBlock.indexOf("declineSignals.some(signal => combinedText.includes(signal))");
  const chargedStatusCheck = parserBlock.indexOf("json.status === 'CHARGED'");
  const rawDeclinedCheck = parserBlock.indexOf("lower.includes('card_declined')");
  const rawChargedCheck = parserBlock.indexOf("lower.includes('charged')");

  assertEquals(declineSignalCheck > -1, true);
  assertEquals(chargedStatusCheck > -1, true);
  assertEquals(declineSignalCheck < chargedStatusCheck, true);
  assertEquals(rawDeclinedCheck > -1, true);
  assertEquals(rawChargedCheck > -1, true);
  assertEquals(rawDeclinedCheck < rawChargedCheck, true);
  assertMatch(parserBlock, /'card_declined'/);
  assertMatch(parserBlock, /'do_not_honor'/);
});

Deno.test("Shopify Charge maps API Charged boolean/string values explicitly", () => {
  assertMatch(source, /const chargedValue = json\.Charged \?\? json\.charged;/);
  assertMatch(source, /chargedNormalized === false \|\| chargedNormalized === 'false'/);
  assertMatch(source, /chargedNormalized === true \|\| chargedNormalized === 'true'/);
  assertMatch(source, /rawChargedFalse/);
  assertMatch(source, /rawChargedTrue/);
});

Deno.test("Shopify Charge treats API Response TIMEOUT as dead proxy and removes it", () => {
  assertMatch(source, /const isApiTimeoutProxyDead = \(rawText: string\): boolean =>/);
  assertMatch(source, /response\.trim\(\)\.toUpperCase\(\) === 'TIMEOUT'/);
  assertMatch(source, /isApiTimeoutProxyDead\(rawText\)/);
  assertMatch(source, /\.from\('user_proxies'\)\.delete\(\)\.eq\('id', currentProxy\.id\)\.eq\('user_id', user\.id\)/);
});

Deno.test("Shopify Charge sends all-proxies-dead debug with raw API responses", () => {
  assertMatch(source, /const failedProxyDebugs: string\[\] = \[\];/);
  assertMatch(source, /Raw API: \$\{siteResult\.rawResponse \|\| siteResult\.message \|\| 'N\/A'\}/);
  assertMatch(source, /allProxiesDead && failedProxyDebugs\.length > 0/);
  assertMatch(source, /ALL PROXIES DEAD|all proxies dead/);
});

Deno.test("Shopify Charge sends immediate proxy-dead debug with raw API response", () => {
  assertMatch(source, /sendAdminDebug\(\s*cc,\s*'proxy dead'/);
  assertMatch(source, /Proxy removed: \$\{currentProxy\.ip\}:\$\{currentProxy\.port\}/);
  assertMatch(source, /siteResult\.rawResponse \|\| siteResult\.message \|\| 'N\/A'/);
});
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
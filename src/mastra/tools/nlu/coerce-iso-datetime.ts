import { z } from "zod";

/**
 * Normalizes LLM-produced "almost ISO" strings into RFC3339 UTC for Zod/Date.
 * Handles: missing Z, missing seconds, single-digit seconds fragment (e.g. T15:00:0Z), space vs T.
 */
export function coerceToIsoString(raw: string): string {
  let s = raw.trim();
  if (!s) {
    throw new Error("empty datetime string");
  }

  s = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(?::\d{2})?)/, "$1T$2");

  // T15:00:0 or T15:00:0Z → pad seconds to two digits
  s = s.replace(
    /T(\d{2}):(\d{2}):(\d)(?!\d)(?=[Z+-]|\.|$)/g,
    "T$1:$2:0$3",
  );

  // T15:00Z without seconds
  if (/T\d{2}:\d{2}(Z|[+-]\d{2}:?\d{2})$/.test(s) && !/T\d{2}:\d{2}:\d{2}/.test(s)) {
    s = s.replace(/T(\d{2}:\d{2})(?=Z|[+-])/, "T$1:00");
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    s += "Z";
  }

  const ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    throw new Error(`Unparsable datetime: ${JSON.stringify(raw)}`);
  }
  return new Date(ms).toISOString();
}

/** Zod field for tool args: coerce messy LLM datetimes, then enforce ISO-8601. */
export const isoDateTimeFromLlm = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  return coerceToIsoString(val);
}, z.string().datetime());

import { z } from "zod";

const sharePayloadV1Schema = z.object({
  v: z.literal(1),
  recipient_label: z.string().min(1).max(64),
  audience: z.enum(["family", "friends", "other"]),
  headline: z.string().min(1).max(120),
  bullets: z.array(z.string().min(1).max(220)).min(1).max(12),
  created_at: z.string().min(1),
});

export type SharePayloadV1 = z.infer<typeof sharePayloadV1Schema>;

export function encodeSharePayload(payload: SharePayloadV1): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeShareToken(token: string): SharePayloadV1 | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(raw);
    const r = sharePayloadV1Schema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

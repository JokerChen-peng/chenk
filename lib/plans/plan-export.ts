import type { SavedOutingPlan, SavedOutingPlanSegment } from "@/lib/plans/plan-file-store";

function formatRangeZh(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const tf = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "short",
      timeStyle: "short",
    });
    return `${tf.format(s)} – ${tf.format(e)}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

function segmentLine(seg: SavedOutingPlanSegment, index: number): string {
  const bits = [
    `${index + 1}. [${seg.kind}] ${seg.label}`,
    `   时间：${formatRangeZh(seg.start_time_iso, seg.end_time_iso)}`,
  ];
  if (seg.poi_id) bits.push(`   POI：${seg.poi_id}`);
  if (typeof seg.estimated_cost_cny === "number")
    bits.push(`   预估：¥${seg.estimated_cost_cny}`);
  if (seg.notes) bits.push(`   备注：${seg.notes}`);
  return bits.join("\n");
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace(/[-:]/g, "").slice(0, 15) + "Z";
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function savedPlanToIcs(plan: SavedOutingPlan): string {
  const stamp = toIcsDate(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meituan Outing Demo//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const seg of plan.segments) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${seg.segment_id}@meituan-demo.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDate(seg.start_time_iso)}`,
      `DTEND:${toIcsDate(seg.end_time_iso)}`,
      `SUMMARY:${escapeIcs(`[${seg.kind}] ${seg.label}`)}`,
      seg.poi_id ? `LOCATION:${escapeIcs(seg.poi_id)}` : "",
      seg.notes
        ? `DESCRIPTION:${escapeIcs(seg.notes)}`
        : `DESCRIPTION:${escapeIcs(plan.title)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n") + "\r\n";
}

export function savedPlanToMarkdown(plan: SavedOutingPlan): string {
  const header = [
    `# ${plan.title}`,
    ``,
    `- 方案 ID：\`${plan.id}\``,
    `- 保存时间：${plan.savedAt}`,
    ``,
    `## 时段`,
    ``,
  ];
  const body = plan.segments.map((s, i) => segmentLine(s, i)).join("\n\n");
  return `${header.join("\n")}${body}\n`;
}

export function savedPlanToJsonString(plan: SavedOutingPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

/** Safe ASCII-ish filename fragment from title. */
export function planExportBasename(plan: SavedOutingPlan): string {
  const base = plan.title
    .replace(/[/\\?%*:|"<>.\s]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60)
    .replace(/^_|_$/g, "");
  return base || plan.id.slice(0, 8);
}

import { z } from "zod";

export const timeSemanticsSchema = z.object({
  timezone: z.literal("Asia/Shanghai"),
  anchor_iso: z.string(),
  outing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  window_label: z.enum([
    "morning",
    "afternoon",
    "evening",
    "midday",
    "full_day",
    "unspecified",
  ]),
  window_clock_start: z.string().regex(/^\d{2}:\d{2}$/),
  window_clock_end: z.string().regex(/^\d{2}:\d{2}$/),
  window_start_iso: z.string(),
  window_end_iso: z.string(),
  human_readable: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  is_weekend: z.boolean(),
  holiday_name: z.string().optional(),
  /** 是否为「热门时段」（周末或假日的 11:00–14:00 / 17:00–20:00），用于排队预测加成 */
  is_peak_window: z.boolean(),
});

export type TimeSemantics = z.infer<typeof timeSemanticsSchema>;

const CN_WEEK_TO_JS: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

/** 中文数字解析（最多支持到「九十九」），返回 null 表示无法识别. */
const CN_NUM_CHAR: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

export function cnNumeralToInt(s: string): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);
  if (s.length === 1) return CN_NUM_CHAR[s] ?? null;
  if (s.length === 2) {
    if (s[0] === "十") return 10 + (CN_NUM_CHAR[s[1]!] ?? 0);
    if (s[1] === "十") return (CN_NUM_CHAR[s[0]!] ?? 0) * 10;
  }
  if (s.length === 3 && s[1] === "十") {
    const tens = CN_NUM_CHAR[s[0]!] ?? 0;
    const ones = CN_NUM_CHAR[s[2]!] ?? 0;
    return tens * 10 + ones;
  }
  return null;
}

/** 用来匹配「3 / 三 / 十二」等 1–3 个字符的数量 token. */
const NUM_TOKEN_SOURCE = "(\\d+|[零一二两三四五六七八九十]{1,3})";

/**
 * 在自然语言里抽出「数字 + 后缀」结构。返回数字（整数）或 null。
 * 例：extractCount("三个人", "(?:个\\s*)?(?:人|位)") -> 3
 *     extractCount("四个小时", "(?:个\\s*)?小时")    -> 4
 */
export function extractCount(msg: string, suffixSource: string): number | null {
  const re = new RegExp(`${NUM_TOKEN_SOURCE}\\s*${suffixSource}`);
  const m = msg.match(re);
  if (!m?.[1]) return null;
  return cnNumeralToInt(m[1]);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function shanghaiYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function ymdToUtcMsAtShanghaiNoon(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 4, 0, 0);
}

const SHORT_WD: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function shanghaiWeekday(ymd: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(ymdToUtcMsAtShanghaiNoon(ymd)));
  return SHORT_WD[w] ?? 0;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const u = Date.UTC(y, m - 1, d + days, 4, 0, 0);
  return shanghaiYmd(new Date(u));
}

function wallToIso(ymd: string, hhmm: string): string {
  const [h, min] = hhmm.split(":").map(Number);
  return `${ymd}T${pad2(h)}:${pad2(min)}:00+08:00`;
}

/** Smallest ymd in [fromYmd, fromYmd+13d] whose Shanghai weekday equals targetJs. */
function nextOrSameWeekdayYmd(
  fromYmd: string,
  targetJs: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): string {
  for (let i = 0; i < 14; i++) {
    const ymd = addDaysYmd(fromYmd, i);
    if (shanghaiWeekday(ymd) === targetJs) return ymd;
  }
  return fromYmd;
}

/** 简易中国法定节假日表（演示用，按 MM-DD 匹配；不处理调休）. */
const CN_HOLIDAYS: Record<string, string> = {
  "01-01": "元旦",
  "05-01": "劳动节",
  "05-02": "劳动节",
  "05-03": "劳动节",
  "06-01": "儿童节",
  "10-01": "国庆节",
  "10-02": "国庆节",
  "10-03": "国庆节",
  "10-04": "国庆节",
  "10-05": "国庆节",
  "10-06": "国庆节",
  "10-07": "国庆节",
};

function lookupHoliday(ymd: string): string | undefined {
  const md = ymd.slice(5);
  return CN_HOLIDAYS[md];
}

function isPeakWindow(start: string, end: string, peak: boolean): boolean {
  if (!peak) return false;
  const s = Number.parseInt(start.split(":")[0]!, 10);
  const e = Number.parseInt(end.split(":")[0]!, 10);
  const overlap = (a: number, b: number, x: number, y: number) =>
    Math.max(a, x) < Math.min(b, y);
  return overlap(s, e, 11, 14) || overlap(s, e, 17, 20);
}

function clockAddMinutes(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let t = h * 60 + m + deltaMin;
  if (t < 0) t = 0;
  if (t >= 24 * 60) t = 24 * 60 - 1;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

function windowLabelFromText(
  text: string,
): TimeSemantics["window_label"] | null {
  if (/(上午|早上|清晨)/.test(text)) return "morning";
  if (/(下午|午后)/.test(text)) return "afternoon";
  if (/(晚上|夜间|夜里|今晚|傍晚|入夜)/.test(text)) return "evening";
  if (/(中午|午间)/.test(text)) return "midday";
  return null;
}

function normalizeClockHour(
  hour: number,
  windowLabel: TimeSemantics["window_label"],
): number {
  if (hour >= 24) return hour % 24;
  if (windowLabel === "afternoon" || windowLabel === "evening") {
    if (hour < 12) return hour + 12;
  }
  if (windowLabel === "midday" && hour < 12) {
    return hour + 12;
  }
  return hour;
}

function parseExplicitClockRange(
  msg: string,
): { window_label: TimeSemantics["window_label"]; start: string; end: string } | null {
  const rangeMatch = msg.match(
    /(?:(上午|早上|清晨|下午|午后|晚上|夜间|夜里|今晚|傍晚|入夜|中午|午间)\s*)?(\d{1,2})(?:[:：](\d{1,2}))?\s*(?:点|时)?\s*(?:到|至|[-~—－])\s*(?:(上午|早上|清晨|下午|午后|晚上|夜间|夜里|今晚|傍晚|入夜|中午|午间)\s*)?(\d{1,2})(?:[:：](\d{1,2}))?\s*(?:点|时)?/,
  );
  if (!rangeMatch) return null;

  const startMeridiem = rangeMatch[1] ?? rangeMatch[4] ?? "";
  const endMeridiem = rangeMatch[4] ?? rangeMatch[1] ?? "";
  const label =
    windowLabelFromText(startMeridiem) ?? windowLabelFromText(endMeridiem);

  const startHourRaw = Number.parseInt(rangeMatch[2]!, 10);
  const startMinute = Number.parseInt(rangeMatch[3] ?? "0", 10);
  const endHourRaw = Number.parseInt(rangeMatch[5]!, 10);
  const endMinute = Number.parseInt(rangeMatch[6] ?? "0", 10);

  const inferredLabel: TimeSemantics["window_label"] =
    label ??
    (startHourRaw >= 18 || endHourRaw >= 18
      ? "evening"
      : startHourRaw >= 11 && endHourRaw <= 14
        ? "midday"
        : startHourRaw <= 6 && endHourRaw <= 12
          ? "afternoon"
          : startHourRaw < 12 && endHourRaw <= 12
            ? "morning"
            : "afternoon");

  const startHour = normalizeClockHour(startHourRaw, inferredLabel);
  const endHour = normalizeClockHour(endHourRaw, inferredLabel);

  return {
    window_label: inferredLabel,
    start: `${pad2(startHour)}:${pad2(startMinute)}`,
    end: `${pad2(endHour)}:${pad2(endMinute)}`,
  };
}

export function inferTimeSemantics(
  userMessage: string,
  anchor: Date,
): TimeSemantics {
  const msg = userMessage.trim();
  const anchorYmd = shanghaiYmd(anchor);
  const anchorIso = anchor.toISOString();

  let outingDate = anchorYmd;
  let confidence: TimeSemantics["confidence"] = "medium";

  if (/明[天后]|次日/.test(msg)) {
    outingDate = addDaysYmd(anchorYmd, 1);
    confidence = "high";
  } else if (/后天/.test(msg)) {
    outingDate = addDaysYmd(anchorYmd, 2);
    confidence = "high";
  } else if (/今天|今日|这天/.test(msg)) {
    outingDate = anchorYmd;
    confidence = "high";
  } else {
    const wm = msg.match(/(下周|本周|这周)([一二三四五六日天])/);
    if (wm?.[2] && CN_WEEK_TO_JS[wm[2]] !== undefined) {
      const target = CN_WEEK_TO_JS[wm[2]]!;
      if (wm[1] === "下周") {
        outingDate = nextOrSameWeekdayYmd(addDaysYmd(anchorYmd, 7), target);
        confidence = "high";
      } else {
        outingDate = nextOrSameWeekdayYmd(anchorYmd, target);
        confidence = wm[1] === "这周" ? "high" : "medium";
      }
    } else {
      const m2 = msg.match(/周([一二三四五六日天])/);
      if (m2?.[1] && CN_WEEK_TO_JS[m2[1]] !== undefined) {
        outingDate = nextOrSameWeekdayYmd(anchorYmd, CN_WEEK_TO_JS[m2[1]]!);
        confidence = "medium";
      }
    }
  }

  let window_label: TimeSemantics["window_label"] = "unspecified";
  if (/下午|午后/.test(msg)) window_label = "afternoon";
  else if (/上午|早上|清晨/.test(msg)) window_label = "morning";
  else if (/晚上|夜间|夜里|今晚|傍晚|入夜/.test(msg)) window_label = "evening";
  else if (/中午|午间/.test(msg)) window_label = "midday";
  else if (/全天|一整天|整天/.test(msg)) window_label = "full_day";
  // 「想喝点酒」「小酌」「酒吧」等强烈暗示晚间窗口；
  // 「喝.{0,3}酒」覆盖「喝酒/喝点酒/喝杯酒」等口语化说法
  else if (
    /喝.{0,3}酒|小酌|酒(?:吧|馆)|啤酒|红酒|白酒|清酒|鸡尾酒|威士忌|烈酒/.test(
      msg,
    )
  ) {
    window_label = "evening";
  }

  let start = "10:00";
  let end = "20:00";

  const explicitRange = parseExplicitClockRange(msg);
  if (explicitRange) {
    window_label = explicitRange.window_label;
    start = explicitRange.start;
    end = explicitRange.end;
    confidence = "high";
  } else {
    switch (window_label) {
      case "morning":
        start = "09:30";
        end = "12:00";
        break;
      case "afternoon":
        start = "13:00";
        end = "18:00";
        break;
      case "evening":
        start = "18:00";
        end = "22:00";
        break;
      case "midday":
        start = "11:30";
        end = "14:00";
        break;
      case "full_day":
        start = "09:00";
        end = "21:00";
        break;
      default:
        if (/下午是空的|下午空|空档/.test(msg)) {
          window_label = "afternoon";
          start = "13:00";
          end = "18:00";
          confidence = confidence === "medium" ? "high" : confidence;
        } else {
          start = "10:00";
          end = "20:00";
          confidence = "low";
        }
    }
  }

  // 时长：兼容 "4 小时 / 4个小时 / 四小时 / 四个小时 / 十二小时"
  const parsedHours = extractCount(msg, "(?:个\\s*)?(?:半\\s*)?小时");
  let spanHours: number | null = null;
  if (parsedHours !== null) {
    spanHours = Math.min(12, Math.max(1, parsedHours));
  } else if (/几个\s*小时|几小时|玩几个小时|几个小时/.test(msg)) {
    spanHours = 5;
    confidence = confidence === "low" ? "medium" : confidence;
  }

  if (spanHours != null && !explicitRange) {
    if (window_label === "unspecified") {
      window_label = "afternoon";
      start = "14:00";
    }
    end = clockAddMinutes(start, spanHours * 60);
    if (window_label === "afternoon" && spanHours >= 4) {
      confidence = "high";
    }
  }

  const window_start_iso = wallToIso(outingDate, start);
  const window_end_iso = wallToIso(outingDate, end);

  const wdZh = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "long",
  }).format(new Date(ymdToUtcMsAtShanghaiNoon(outingDate)));

  const wd = shanghaiWeekday(outingDate);
  const is_weekend = wd === 0 || wd === 6;
  const holiday_name = lookupHoliday(outingDate);
  const is_peak_window = isPeakWindow(start, end, is_weekend || !!holiday_name);

  const peakNote = is_peak_window
    ? "（热门时段，排队/打车可能加价）"
    : holiday_name
      ? `（${holiday_name}假日）`
      : is_weekend
        ? "（周末）"
        : "";

  const human_readable = `外出日 ${outingDate}（${wdZh}${holiday_name ? ` · ${holiday_name}` : ""}），时段「${window_label}」约 ${start}–${end}（上海时间，规则解析；置信度 ${confidence}）${peakNote}。`;

  return {
    timezone: "Asia/Shanghai",
    anchor_iso: anchorIso,
    outing_date: outingDate,
    window_label,
    window_clock_start: start,
    window_clock_end: end,
    window_start_iso,
    window_end_iso,
    human_readable,
    confidence,
    is_weekend,
    holiday_name,
    is_peak_window,
  };
}

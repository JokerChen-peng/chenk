import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  extractCount,
  inferTimeSemantics,
  timeSemanticsSchema,
} from "@/src/mastra/tools/nlu/parse-outing-time-semantics";
import { dietaryFilterSchema } from "@/src/domain/taxonomy";

const sceneSchema = z.enum(["family", "friends", "solo", "unknown"]);
const windowLabelSchema = z.enum([
  "morning",
  "afternoon",
  "evening",
  "midday",
  "full_day",
  "unspecified",
]);

const participantSchema = z.object({
  role: z.enum([
    "self",
    "spouse",
    "child",
    "parent",
    "friend",
    "colleague",
    "other",
  ]),
  gender: z.enum(["male", "female", "unspecified"]).default("unspecified"),
  age: z.number().int().min(0).max(120).optional(),
  preferences: z
    .array(
      z.enum([
        "kid_friendly",
        "low_cal",
        "vegetarian_options",
        "wheelchair_accessible",
        "spicy_friendly",
        "quiet",
        "outdoor_seat",
        "couple_friendly",
        "group_friendly",
        "photogenic",
      ]),
    )
    .default([]),
});

const categoryEnum = z.enum([
  "餐饮",
  "展览",
  "咖啡",
  "亲子",
  "夜生活",
  "户外",
]);
type Category = z.infer<typeof categoryEnum>;

/**
 * LLM 直接传结构化字段；regex baseline 仅用于 fallback。
 * 任意字段都是 optional —— 没填的字段由 baseline 兜底。
 */
const parsedOverridesSchema = z
  .object({
    scene: sceneSchema.optional(),
    party_size: z.number().int().min(1).max(20).optional(),
    participants: z.array(participantSchema).optional(),
    duration_hours_target: z.number().min(1).max(12).optional(),
    outing_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Asia/Shanghai 当地日期，YYYY-MM-DD"),
    window_label: windowLabelSchema.optional(),
    window_clock_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    window_clock_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    budget_hint_cny: z.number().nonnegative().optional(),
    max_travel_km_from_home: z.number().positive().optional(),
    dietary_filters: z.array(dietaryFilterSchema).optional(),
    dietary_notes: z.array(z.string()).optional(),
    activity_hints: z.array(z.string()).optional(),
    suggested_category_matrix: z.array(categoryEnum).optional(),
  })
  .strict()
  .describe(
    "LLM 抽取后的结构化字段；只填你能从用户消息中确认的字段，其余留空由 regex baseline 兜底。",
  );

const parseOutingConstraintsInputSchema = z.object({
  user_message: z.string().min(1),
  home_adcode: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
    .describe("6-digit adcode for home base; omit if unknown"),
  anchor_iso_datetime: z
    .string()
    .optional()
    .describe(
      "Optional ISO-8601 instant for 「今天下午」等锚点；不传则用服务端当前时间（Demo）",
    ),
  parsed_overrides: parsedOverridesSchema.optional(),
});

const parseOutingConstraintsOutputSchema = z.object({
  scene: sceneSchema,
  duration_hours_target: z.number().min(1).max(12),
  party_size: z.number().int().min(1).max(20),
  participants: z.array(participantSchema),
  inferred_home_adcode: z.string().regex(/^\d{6}$/),
  max_travel_km_from_home: z.number().positive(),
  budget_hint_cny: z.number().nonnegative(),
  dietary_filters: z.array(dietaryFilterSchema),
  dietary_notes: z.array(z.string()),
  activity_hints: z.array(z.string()),
  suggested_category_matrix: z.array(categoryEnum),
  time_semantics: timeSemanticsSchema,
  raw_summary: z.string(),
  /** 哪些字段被 LLM 覆盖了 baseline，方便 UI 标注 */
  overridden_fields: z.array(z.string()),
});

type ParseOutingConstraintsOutput = z.infer<
  typeof parseOutingConstraintsOutputSchema
>;
type Participant = z.infer<typeof participantSchema>;
/** 用 input 类型：gender / preferences 在 schema 上有 .default()，
 *  Mastra createTool 的 execute 收到的是 pre-default 形态（optional）。 */
type ParsedOverrides = z.input<typeof parsedOverridesSchema>;

function durationHoursFromClocks(start: string, end: string): number {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  const a = h1 * 60 + m1;
  const b = h2 * 60 + m2;
  const d = Math.max(0, b - a);
  return Math.max(1, Math.round(d / 60));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function clockAddMinutes(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let t = h * 60 + m + deltaMin;
  if (t < 0) t = 0;
  if (t >= 24 * 60) t = 24 * 60 - 1;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

function inferParticipants(
  msg: string,
  scene: z.infer<typeof sceneSchema>,
): Participant[] {
  const ps: Participant[] = [];

  if (scene === "family") {
    ps.push({
      role: "self",
      gender: "unspecified",
      preferences: [],
    });
    if (/老婆|妻子|爱人/.test(msg)) {
      ps.push({
        role: "spouse",
        gender: "female",
        preferences: /减肥|低脂|清淡|少油/.test(msg) ? ["low_cal"] : [],
      });
    } else if (/老公|丈夫/.test(msg)) {
      ps.push({
        role: "spouse",
        gender: "male",
        preferences: /减肥|低脂|清淡|少油/.test(msg) ? ["low_cal"] : [],
      });
    }
    const ageMatch = msg.match(/(\d+)\s*岁/);
    if (ageMatch?.[1] || /孩子|娃|儿子|女儿/.test(msg)) {
      ps.push({
        role: "child",
        gender: "unspecified",
        age: ageMatch?.[1]
          ? Math.min(18, Number.parseInt(ageMatch[1]!, 10))
          : undefined,
        preferences: ["kid_friendly"],
      });
    }
    return ps;
  }

  if (scene === "friends") {
    const explicit =
      extractCount(msg, "(?:个\\s*)?(?:人|位)") ??
      extractCount(msg, "(?:个|位)");
    const total = explicit ? Math.min(12, Math.max(2, explicit)) : 4;
    const malesParsed = extractCount(msg, "(?:个\\s*)?男(?:生|的|士)?");
    const femalesParsed = extractCount(msg, "(?:个\\s*)?女(?:生|的|士)?");
    const gendersExplicit =
      malesParsed !== null || femalesParsed !== null;
    if (gendersExplicit) {
      const males =
        malesParsed ?? Math.max(0, total - (femalesParsed ?? 0));
      const females = femalesParsed ?? Math.max(0, total - males);
      for (let i = 0; i < males; i++) {
        ps.push({
          role: i === 0 ? "self" : "friend",
          gender: "male",
          preferences: ["group_friendly"],
        });
      }
      for (let i = 0; i < females; i++) {
        ps.push({
          role: "friend",
          gender: "female",
          preferences: ["group_friendly", "photogenic"],
        });
      }
    } else {
      for (let i = 0; i < total; i++) {
        ps.push({
          role: i === 0 ? "self" : "friend",
          gender: "unspecified",
          preferences: ["group_friendly"],
        });
      }
    }
    return ps;
  }

  if (scene === "solo") {
    return [{ role: "self", gender: "unspecified", preferences: ["quiet"] }];
  }

  return [{ role: "self", gender: "unspecified", preferences: [] }];
}

/** 把人数 N 拉成长度为 N 的 participants（保留原顺序，截断或补 self/friend） */
function fitParticipantsToCount(
  participants: Participant[],
  party_size: number,
): Participant[] {
  if (participants.length === party_size) return participants;
  if (participants.length > party_size) {
    return participants.slice(0, party_size);
  }
  const out = [...participants];
  while (out.length < party_size) {
    out.push({
      role: out.length === 0 ? "self" : "friend",
      gender: "unspecified",
      preferences: [],
    });
  }
  return out;
}

type RegexBaseline = Omit<
  ParseOutingConstraintsOutput,
  "raw_summary" | "overridden_fields"
>;

function runRegexBaseline(args: {
  user_message: string;
  anchor: Date;
  home_adcode?: string;
}): RegexBaseline {
  const { user_message, anchor, home_adcode } = args;
  const h = hash(user_message.toLowerCase());

  const time_semantics = inferTimeSemantics(user_message, anchor);

  const family =
    /孩子|老婆|老公|妻子|爱人|丈夫|亲子|家庭|娃|儿子|女儿|岁/.test(user_message);
  const partyCount =
    extractCount(user_message, "(?:个\\s*)?(?:人|位)") ?? null;
  const hasMultiplePeople = partyCount !== null && partyCount >= 2;
  const friends =
    !family &&
    (/朋友|同事|同学|男生|女生|哥们|姐妹|聚会|聚一聚|聚一下|喝.{0,3}酒|小酌|酒(?:吧|馆)|啤酒|清酒|鸡尾酒/.test(
      user_message,
    ) ||
      hasMultiplePeople);

  const scene: z.infer<typeof sceneSchema> = family
    ? "family"
    : friends
      ? "friends"
      : /一个人|独自|自己/.test(user_message)
        ? "solo"
        : "unknown";

  const participants = inferParticipants(user_message, scene);
  const party_size = participants.length;

  const windowSpan = durationHoursFromClocks(
    time_semantics.window_clock_start,
    time_semantics.window_clock_end,
  );
  const duration_hours_target = Math.min(
    12,
    Math.max(1, windowSpan > 0 ? windowSpan : 4 + (h % 3)),
  );
  const inferred_home_adcode = home_adcode ?? "310106";

  const max_travel_km_from_home = /不远|附近|周边|别离家太远/.test(
    user_message,
  )
    ? 6 + (h % 4)
    : 12 + (h % 8);

  const budget_hint_cny =
    Number.parseInt(user_message.match(/预算\s*(\d+)/)?.[1] ?? "0", 10) ||
    200 + (h % 400);

  const dietary_filters: z.infer<typeof dietaryFilterSchema>[] = [];
  if (/减肥|低脂|清淡|少油|沙拉/.test(user_message))
    dietary_filters.push("low_cal");
  if (
    family ||
    /孩子|岁|亲子|娃|儿|女/.test(user_message) ||
    participants.some((p) => p.role === "child")
  )
    dietary_filters.push("kid_friendly");
  if (/素食|吃素|vegan|vegetarian/i.test(user_message))
    dietary_filters.push("vegetarian_options");
  if (/无障碍|轮椅/.test(user_message))
    dietary_filters.push("wheelchair_accessible");

  const dietary_notes = dietary_filters.map((f) =>
    f === "low_cal"
      ? "low_calorie_preferred"
      : f === "kid_friendly"
        ? "kid_friendly"
        : f === "vegetarian_options"
          ? "vegetarian_options"
          : "wheelchair_accessible",
  );

  const activity_hints: string[] = [];
  if (/展览|博物馆|美术馆/.test(user_message)) activity_hints.push("展览");
  if (/乐园|亲子|游乐/.test(user_message)) activity_hints.push("亲子");
  if (/咖啡|下午茶/.test(user_message)) activity_hints.push("咖啡");
  if (/户外|公园|徒步|滨江|骑行/.test(user_message))
    activity_hints.push("户外");
  if (
    /夜市|小吃|citywalk|喝.{0,3}酒|小酌|酒(?:吧|馆)|啤酒|红酒|白酒|清酒|鸡尾酒|威士忌|烈酒|live\s*house/i.test(
      user_message,
    )
  )
    activity_hints.push("夜生活");

  const explicit_category_matrix = Array.from(
    new Set([
      ...(activity_hints.includes("展览") ? (["展览"] as const) : []),
      ...(activity_hints.includes("亲子") ? (["亲子"] as const) : []),
      ...(activity_hints.includes("户外") ? (["户外"] as const) : []),
      "餐饮",
      ...(activity_hints.includes("咖啡") ? (["咖啡"] as const) : []),
      ...(activity_hints.includes("夜生活") ? (["夜生活"] as const) : []),
    ]),
  ) as Category[];

  const sceneDefaultCategories: Category[] =
    scene === "family"
      ? (["亲子", "展览", "户外", "餐饮"] as const).slice() as Category[]
      : scene === "friends"
        ? (["展览", "咖啡", "户外", "餐饮"] as const).slice() as Category[]
        : scene === "solo"
          ? (["咖啡", "户外", "餐饮"] as const).slice() as Category[]
          : (["户外", "餐饮"] as const).slice() as Category[];

  const cats = Array.from(
    new Set([...explicit_category_matrix, ...sceneDefaultCategories]),
  ) as Category[];

  return {
    scene,
    duration_hours_target,
    party_size,
    participants,
    inferred_home_adcode,
    max_travel_km_from_home,
    budget_hint_cny,
    dietary_filters,
    dietary_notes,
    activity_hints,
    suggested_category_matrix: cats,
    time_semantics,
  };
}

/** Return ISO-8601 string for a wall-clock HH:mm on the given Asia/Shanghai date. */
function wallToIso(ymd: string, hhmm: string): string {
  const [h, min] = hhmm.split(":").map(Number);
  return `${ymd}T${pad2(h)}:${pad2(min)}:00+08:00`;
}

/**
 * 把 baseline 和 LLM overrides 合并出最终 output，并补齐衍生字段。
 * 关键合并规则：
 *   1. duration_hours_target / window_clock_end 互锁：
 *      - 只给 duration → end = start + duration
 *      - 只给 end → duration = end - start
 *      - 都给 → 信任两个，但 end 优先（按 end 算 duration）
 *   2. participants vs party_size：
 *      - 只给 participants → party_size = participants.length
 *      - 只给 party_size → 用 baseline 的 participants 拉伸/截断
 *      - 都给 → 信任 participants，用其 .length 覆盖 party_size
 *   3. window_label / clock_start / clock_end / outing_date 任一变化都要重算 ISO + is_peak_window
 */
function mergeOverridesIntoBaseline(
  baseline: RegexBaseline,
  overrides: ParsedOverrides | undefined,
): { merged: RegexBaseline; overridden: string[] } {
  if (!overrides || Object.keys(overrides).length === 0) {
    return { merged: baseline, overridden: [] };
  }
  const merged: RegexBaseline = JSON.parse(JSON.stringify(baseline));
  const overridden: string[] = [];

  const setIf = <K extends keyof RegexBaseline>(
    key: K,
    value: RegexBaseline[K] | undefined,
  ) => {
    if (value !== undefined) {
      merged[key] = value;
      overridden.push(key);
    }
  };

  setIf("scene", overrides.scene);
  setIf("budget_hint_cny", overrides.budget_hint_cny);
  setIf("max_travel_km_from_home", overrides.max_travel_km_from_home);
  setIf("dietary_filters", overrides.dietary_filters);
  setIf("dietary_notes", overrides.dietary_notes);
  setIf("activity_hints", overrides.activity_hints);
  setIf("suggested_category_matrix", overrides.suggested_category_matrix);

  // participants ↔ party_size 互锁
  if (overrides.participants && overrides.participants.length > 0) {
    // 给 participants 默认补全 gender/preferences，方便 UI
    const normalizedPs: Participant[] = overrides.participants.map((p) => ({
      ...p,
      gender: p.gender ?? "unspecified",
      preferences: p.preferences ?? [],
    }));
    merged.participants = normalizedPs;
    merged.party_size = normalizedPs.length;
    overridden.push("participants", "party_size");
  } else if (typeof overrides.party_size === "number") {
    merged.party_size = overrides.party_size;
    merged.participants = fitParticipantsToCount(
      merged.participants,
      overrides.party_size,
    );
    overridden.push("party_size");
  }

  // 时间窗口：任一变化都重算 ISO + is_peak_window
  const ts = merged.time_semantics;
  let outing_date = overrides.outing_date ?? ts.outing_date;
  let window_label = overrides.window_label ?? ts.window_label;
  let window_clock_start =
    overrides.window_clock_start ?? ts.window_clock_start;
  let window_clock_end = overrides.window_clock_end ?? ts.window_clock_end;
  let duration_hours_target = baseline.duration_hours_target;

  if (
    typeof overrides.duration_hours_target === "number" &&
    overrides.window_clock_end === undefined
  ) {
    // 用户只改了时长 → 按 start + duration 算 end
    window_clock_end = clockAddMinutes(
      window_clock_start,
      overrides.duration_hours_target * 60,
    );
    duration_hours_target = overrides.duration_hours_target;
    overridden.push("duration_hours_target", "window_clock_end");
  } else if (overrides.window_clock_end !== undefined) {
    // 用户给了 end → 按 start/end 算 duration
    duration_hours_target = durationHoursFromClocks(
      window_clock_start,
      window_clock_end,
    );
    if (overrides.duration_hours_target !== undefined) {
      // 二者都给：以 end 算出来的 duration 为准（避免内部矛盾）
      overridden.push("window_clock_end", "duration_hours_target");
    } else {
      overridden.push("window_clock_end");
    }
  } else if (typeof overrides.duration_hours_target === "number") {
    duration_hours_target = overrides.duration_hours_target;
    overridden.push("duration_hours_target");
  } else {
    duration_hours_target = baseline.duration_hours_target;
  }

  const timeChanged =
    overrides.outing_date !== undefined ||
    overrides.window_label !== undefined ||
    overrides.window_clock_start !== undefined ||
    overrides.window_clock_end !== undefined;

  if (timeChanged) {
    if (overrides.outing_date) overridden.push("outing_date");
    if (overrides.window_label) overridden.push("window_label");
    if (overrides.window_clock_start) overridden.push("window_clock_start");

    merged.time_semantics = {
      ...ts,
      outing_date,
      window_label,
      window_clock_start,
      window_clock_end,
      window_start_iso: wallToIso(outing_date, window_clock_start),
      window_end_iso: wallToIso(outing_date, window_clock_end),
      // confidence/holiday/peak/weekend 我们不在这里重算（保留 baseline 的判断或简化）
    };
  } else if (window_clock_end !== ts.window_clock_end) {
    // 只是 duration 变化导致 end 被重算
    merged.time_semantics = {
      ...ts,
      window_clock_end,
      window_end_iso: wallToIso(outing_date, window_clock_end),
    };
  }

  merged.duration_hours_target = duration_hours_target;

  // 去重 overridden
  const uniqueOverridden = Array.from(new Set(overridden));
  return { merged, overridden: uniqueOverridden };
}

function buildRawSummary(
  merged: RegexBaseline,
  overriddenCount: number,
): string {
  const llmTag = overriddenCount > 0 ? `（LLM 抽取覆盖 ${overriddenCount} 项）` : "";
  if (merged.scene === "family") {
    return `家庭短途 · ${merged.party_size} 人${
      merged.participants.find((p) => p.role === "child") ? "（含孩子）" : ""
    }${
      merged.dietary_filters.includes("low_cal") ? " · 低卡偏好" : ""
    }${llmTag}。${merged.time_semantics.human_readable}`;
  }
  if (merged.scene === "friends") {
    return `朋友聚 · ${merged.party_size} 人${llmTag}。${merged.time_semantics.human_readable}`;
  }
  if (merged.scene === "solo") {
    return `独自外出 · 1 人${llmTag}。${merged.time_semantics.human_readable}`;
  }
  return `通用短时外出规划${llmTag}。${merged.time_semantics.human_readable}`;
}

export const parseOutingConstraintsTool = createTool({
  id: "parse_outing_constraints",
  description:
    "把自然语言 outing 需求归一成结构化约束 + Asia/Shanghai 时间语义。LLM 应优先自己理解 user_message，把抽到的字段（scene/party_size/participants/duration/window/category/budget/dietary）传进 parsed_overrides；工具会以 overrides 为准、用 regex baseline 兜底未填字段。多轮对话中用户改变任何约束时必须重新调用本工具。",
  inputSchema: parseOutingConstraintsInputSchema,
  outputSchema: parseOutingConstraintsOutputSchema,
  execute: async ({
    user_message,
    home_adcode,
    anchor_iso_datetime,
    parsed_overrides,
  }) => {
    let anchor = new Date();
    if (anchor_iso_datetime) {
      const t = Date.parse(anchor_iso_datetime);
      if (!Number.isNaN(t)) anchor = new Date(t);
    }
    const baseline = runRegexBaseline({ user_message, anchor, home_adcode });
    const { merged, overridden } = mergeOverridesIntoBaseline(
      baseline,
      parsed_overrides,
    );

    return {
      ...merged,
      raw_summary: buildRawSummary(merged, overridden.length),
      overridden_fields: overridden,
    };
  },
});

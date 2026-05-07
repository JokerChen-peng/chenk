import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { amapWeather, isAmapEnabled } from "@/lib/geo/amap-client";

const inputSchema = z.object({
  adcode: z.string().regex(/^\d{6}$/),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Asia/Shanghai 当地日期"),
});

const conditionSchema = z.enum([
  "sunny",
  "cloudy",
  "light_rain",
  "heavy_rain",
  "thunderstorm",
  "snow",
  "haze",
]);

const outputSchema = z.object({
  adcode: z.string(),
  date: z.string(),
  hourly: z.array(
    z.object({
      hour: z.number().int().min(0).max(23),
      condition: conditionSchema,
      temperature_c: z.number(),
      precipitation_probability: z.number().min(0).max(100),
    }),
  ),
  summary: z.string(),
  prefer_indoor: z
    .boolean()
    .describe("综合 hourly 数据：午后是否建议 prefer_indoor 规划（>40% 降水概率即 true）"),
  high_temp_c: z.number(),
  low_temp_c: z.number(),
});

function hashSeed(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const CONDITIONS: z.infer<typeof conditionSchema>[] = [
  "sunny",
  "cloudy",
  "light_rain",
  "heavy_rain",
  "thunderstorm",
  "haze",
];

export const getLocalWeatherTool = createTool({
  id: "get_local_weather",
  description:
    "Mock 当地逐小时天气：基于 adcode+date 稳定生成 0–23 点的天气与降水概率，并给出 prefer_indoor 建议。规划侧雨天可把 prefer_indoor=true 传给 search_enhanced_poi。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    if (isAmapEnabled()) {
      const real = await amapWeather({
        adcode: input.adcode,
        date: input.date,
      });
      if (real && real.hourly) {
        const afternoon = real.hourly.filter(
          (h) => h.hour >= 13 && h.hour <= 19,
        );
        const avgPrecip =
          afternoon.reduce((a, b) => a + b.precipitation_probability, 0) /
          Math.max(1, afternoon.length);
        const prefer_indoor = avgPrecip > 40;
        const summary = `（高德）${real.raw_summary}。下午平均降水概率 ${Math.round(avgPrecip)}%，${
          prefer_indoor ? "建议 indoor 优先" : "可户外活动"
        }。`;
        return {
          adcode: real.adcode,
          date: real.date,
          hourly: real.hourly,
          summary,
          prefer_indoor,
          high_temp_c: real.high_temp_c,
          low_temp_c: real.low_temp_c,
        };
      }
    }
    const seed = hashSeed(`${input.adcode}-${input.date}`);
    const baseHigh = 10 + (seed % 25);
    const baseLow = baseHigh - 5 - ((seed >> 4) % 6);
    const baseCondIdx = seed % CONDITIONS.length;

    const hourly = Array.from({ length: 24 }, (_, h) => {
      const drift = ((seed >> (h % 8)) + h * 7) % 7;
      const condIdx = (baseCondIdx + (drift % 3)) % CONDITIONS.length;
      const condition = CONDITIONS[condIdx]!;
      const wave = Math.sin((h / 24) * Math.PI * 2);
      const temperature_c = Number(
        (baseLow + (baseHigh - baseLow) * (wave * 0.5 + 0.5)).toFixed(1),
      );
      const precipitation_probability =
        condition === "heavy_rain" || condition === "thunderstorm"
          ? 70 + (drift % 25)
          : condition === "light_rain"
            ? 40 + (drift % 25)
            : condition === "snow"
              ? 50 + (drift % 25)
              : condition === "haze"
                ? 5 + (drift % 10)
                : drift % 15;
      return { hour: h, condition, temperature_c, precipitation_probability };
    });

    const afternoon = hourly.filter((h) => h.hour >= 13 && h.hour <= 19);
    const avgPrecip =
      afternoon.reduce((a, b) => a + b.precipitation_probability, 0) /
      Math.max(1, afternoon.length);
    const prefer_indoor = avgPrecip > 40;

    const summary = prefer_indoor
      ? `下午平均降水概率 ${Math.round(avgPrecip)}%，建议 indoor 优先安排。`
      : `下午平均降水概率 ${Math.round(avgPrecip)}%，可户外活动。`;

    return {
      adcode: input.adcode,
      date: input.date,
      hourly,
      summary,
      prefer_indoor,
      high_temp_c: Number(baseHigh.toFixed(1)),
      low_temp_c: Number(baseLow.toFixed(1)),
    };
  },
});

import { createTool } from "@mastra/core/tools";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const FRAGMENT_IDS = [
  "domain",
  "examples",
  "forbidden",
  "tool_routing",
  "execution_boundaries",
] as const;

type FragmentId = (typeof FRAGMENT_IDS)[number];

const FRAGMENT_FILES: Record<FragmentId, string> = {
  domain: "domain.md",
  examples: "examples.md",
  forbidden: "forbidden.md",
  tool_routing: "tool-routing.md",
  execution_boundaries: "execution-boundaries.md",
};

const MAX_FRAGMENTS = 4;
const MAX_CHARS_PER_FRAGMENT = 24_000;

const loadOutingSkillInputSchema = z.object({
  fragments: z
    .array(z.enum(FRAGMENT_IDS))
    .min(1)
    .max(MAX_FRAGMENTS)
    .describe(
      "按需加载的领域片段：domain=产品边界；examples=示例话术；forbidden=禁止项；tool_routing=工具顺序；execution_boundaries=仅执行侧边界",
    ),
});

const loadOutingSkillOutputSchema = z.object({
  loaded_fragment_ids: z.array(z.string()),
  markdown: z.string(),
});

function fragmentsDir(): string {
  return path.join(process.cwd(), "skills", "outing", "fragments");
}

export const loadOutingSkillTool = createTool({
  id: "load_outing_skill",
  description:
    "按需加载 outing 领域说明（Markdown 片段），注入到当前轮次上下文。复杂或首轮规划前可加载 domain + tool_routing；需要话术范例用 examples；合规与禁止项用 forbidden。执行 Agent 在边界不清时可加载 forbidden + execution_boundaries。不要把长文档整段默写进回复，优先用本工具取原文。",
  inputSchema: loadOutingSkillInputSchema,
  outputSchema: loadOutingSkillOutputSchema,
  execute: async ({ fragments }) => {
    const dir = fragmentsDir();
    const unique = [...new Set(fragments)] as FragmentId[];
    const parts: string[] = [];

    for (const id of unique) {
      const fileName = FRAGMENT_FILES[id];
      const abs = path.join(dir, fileName);
      const normalized = path.normalize(abs);
      if (!normalized.startsWith(path.normalize(dir + path.sep))) {
        throw new Error("Invalid fragment path");
      }
      let body = await readFile(normalized, "utf8");
      if (body.length > MAX_CHARS_PER_FRAGMENT) {
        body =
          body.slice(0, MAX_CHARS_PER_FRAGMENT) +
          "\n\n…(truncated for context size)";
      }
      parts.push(`## fragment: ${id}\n\n${body.trim()}\n`);
    }

    return {
      loaded_fragment_ids: unique,
      markdown: parts.join("\n---\n\n"),
    };
  },
});

import { afterEach, describe, expect, it } from "vitest";
import {
  buildProviderCacheOptions,
  estimatePromptTokens,
  inferProviderFamily,
  pickCacheStrategy,
  __resetPromptCacheLogForTests,
} from "@/lib/llm/prompt-cache";

afterEach(() => {
  __resetPromptCacheLogForTests();
});

describe("inferProviderFamily", () => {
  it("identifies google by prefix or gemini name", () => {
    expect(inferProviderFamily("google/gemini-3.1-flash-lite-preview")).toBe(
      "google",
    );
    expect(inferProviderFamily("gemini-2.0-flash-lite")).toBe("google");
  });
  it("identifies anthropic", () => {
    expect(inferProviderFamily("anthropic/claude-3-5-sonnet")).toBe("anthropic");
    expect(inferProviderFamily("claude-3-haiku")).toBe("anthropic");
  });
  it("identifies openai", () => {
    expect(inferProviderFamily("openai/gpt-5")).toBe("openai");
    expect(inferProviderFamily("gpt-4o-mini")).toBe("openai");
    expect(inferProviderFamily("o1-mini")).toBe("openai");
  });
  it("treats deepseek ids as OpenAI-compatible family", () => {
    expect(inferProviderFamily("deepseek/deepseek-chat")).toBe("openai");
  });
  it("treats glm ids as OpenAI-compatible family", () => {
    expect(inferProviderFamily("glm-4.5-air")).toBe("openai");
    expect(inferProviderFamily("glm/glm-4.5-air")).toBe("openai");
  });
  it("falls back to other", () => {
    expect(inferProviderFamily("custom/whatever-7b")).toBe("other");
  });
});

describe("pickCacheStrategy", () => {
  it("returns gemini-implicit for small Gemini prompts", () => {
    const s = pickCacheStrategy({
      modelId: "google/gemini-3.1-flash-lite-preview",
      promptTokens: 1500,
    });
    expect(s.kind).toBe("gemini-implicit");
  });
  it("upgrades to gemini-explicit-stub once prompt exceeds 32K tokens", () => {
    const s = pickCacheStrategy({
      modelId: "gemini-2.0-pro",
      promptTokens: 40_000,
    });
    expect(s.kind).toBe("gemini-explicit-stub");
  });
  it("uses anthropic-cache-control for claude", () => {
    const s = pickCacheStrategy({
      modelId: "anthropic/claude-3-5-sonnet",
      promptTokens: 800,
    });
    expect(s.kind).toBe("anthropic-cache-control");
  });
  it("returns none for unknown providers", () => {
    const s = pickCacheStrategy({ modelId: "custom/x", promptTokens: 5_000 });
    expect(s.kind).toBe("none");
  });
});

describe("buildProviderCacheOptions", () => {
  it("emits anthropic.cacheControl for anthropic strategy", () => {
    const out = buildProviderCacheOptions({ kind: "anthropic-cache-control" });
    expect(out).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });
  it("returns undefined for gemini-implicit (cache is automatic, no provider option needed)", () => {
    expect(
      buildProviderCacheOptions({
        kind: "gemini-implicit",
        thresholdTokens: 1024,
      }),
    ).toBeUndefined();
  });
  it("returns undefined for none / openai-implicit / gemini-explicit-stub (no SDK toggle yet)", () => {
    expect(buildProviderCacheOptions({ kind: "none" })).toBeUndefined();
    expect(
      buildProviderCacheOptions({ kind: "openai-implicit" }),
    ).toBeUndefined();
    expect(
      buildProviderCacheOptions({
        kind: "gemini-explicit-stub",
        minTokens: 32_768,
      }),
    ).toBeUndefined();
  });
});

describe("estimatePromptTokens", () => {
  it("monotonically grows with text length", () => {
    const a = estimatePromptTokens("hi");
    const b = estimatePromptTokens("hi there friend");
    const c = estimatePromptTokens("hi there friend ".repeat(100));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeGreaterThan(100);
  });
});

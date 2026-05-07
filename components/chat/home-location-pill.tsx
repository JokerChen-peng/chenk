"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin } from "lucide-react";

const STORAGE_KEY = "outing.home_adcode_hint";

/** 与 src/mastra/tools/poi-seed.ts 的 ADCODE_CENTROIDS 保持一致；只取了几个上海主城区，仅供手动选择。 */
const KNOWN_CENTROIDS: { adcode: string; name: string }[] = [
  { adcode: "310106", name: "静安区" },
  { adcode: "310101", name: "黄浦区" },
  { adcode: "310104", name: "徐汇区" },
  { adcode: "310105", name: "长宁区" },
  { adcode: "310109", name: "虹口区" },
  { adcode: "310115", name: "浦东新区" },
];

type HomeHint = {
  adcode: string;
  district: string;
  source: "geolocation" | "manual";
  saved_at: string;
};

function readHint(): HomeHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeHint;
    if (!parsed?.adcode) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeHint(hint: HomeHint | null) {
  if (typeof window === "undefined") return;
  if (hint) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hint));
  else window.localStorage.removeItem(STORAGE_KEY);
}

export function HomeLocationPill() {
  const [hint, setHint] = useState<HomeHint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setHint(readHint());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const detect = useCallback(() => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("浏览器不支持定位，请手动选择");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          const res = await fetch("/api/geo/reverse", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(here),
          });
          if (!res.ok) {
            setError("定位反查失败，请手动选择");
            setBusy(false);
            return;
          }
          const data = (await res.json()) as {
            adcode?: string | null;
            district?: string | null;
            source?: string;
            message?: string;
          };
          if (data.source === "out_of_coverage" || !data.adcode) {
            setError(
              data.message ??
                "你当前位置不在 Demo 覆盖范围（仅支持上海），请手动选择",
            );
            setBusy(false);
            return;
          }
          if (!/^\d{6}$/.test(data.adcode)) {
            setError("反查结果异常，请手动选择");
            setBusy(false);
            return;
          }
          const next: HomeHint = {
            adcode: data.adcode,
            district: data.district ?? "",
            source: "geolocation",
            saved_at: new Date().toISOString(),
          };
          writeHint(next);
          setHint(next);
        } catch {
          setError("网络异常，定位失败，请手动选择");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setError(`定位失败：${err.message}`);
        setBusy(false);
      },
      { timeout: 6000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }, []);

  const setManually = useCallback((adcode: string, district: string) => {
    const next: HomeHint = {
      adcode,
      district,
      source: "manual",
      saved_at: new Date().toISOString(),
    };
    writeHint(next);
    setHint(next);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    writeHint(null);
    setHint(null);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={detect}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium hover:border-primary/40 disabled:opacity-50"
      >
        <MapPin className="h-3 w-3" aria-hidden />
        {busy ? "定位中…" : "📍 用浏览器定位识别家附近"}
      </button>
      {hint ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
          家：{hint.district}（{hint.adcode}）
          <button
            type="button"
            onClick={clear}
            className="ml-1 text-[10px] text-muted-foreground hover:underline"
            aria-label="清除"
          >
            ✕
          </button>
        </span>
      ) : (
        <select
          className="rounded-full border border-border/60 bg-background px-2 py-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            const c = KNOWN_CENTROIDS.find((x) => x.adcode === v);
            if (c) setManually(c.adcode, c.name);
          }}
          aria-label="手动选择"
        >
          <option value="" disabled>
            或手动选择…
          </option>
          {KNOWN_CENTROIDS.map((c) => (
            <option key={c.adcode} value={c.adcode}>
              {c.name}（{c.adcode}）
            </option>
          ))}
        </select>
      )}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  );
}

export function readHomeAdcodeHint(): string | null {
  const h = readHint();
  return h?.adcode ?? null;
}

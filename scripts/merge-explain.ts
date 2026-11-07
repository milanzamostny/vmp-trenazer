/**
 * Spojí otázky data/{m,s,c}.json s vysvětleními data/explain/<kat>-*.json.
 * Používá ho Vite plugin (dev server i build) – vysvětlení se tedy upravují
 * jen v data/explain/*.json a aplikace si je načte sama.
 * `npm run check-data` jen zkontroluje pokrytí a vypíše souhrn.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Question } from "./parse-sps.ts";

export interface Explanation {
  explain: string;
  mnemo?: string;
  ref?: string;
  confidence: "high" | "check";
}
export type FullQuestion = Question & Partial<Explanation>;

export const CATEGORY_INFO = {
  m: { title: "M / M20 – motorová malá plavidla", exam: { count: 35, minutes: 30, pass: 30 } },
  s: { title: "S / S20 – plachetnice", exam: { count: 14, minutes: 10, pass: 11 } },
  c: { title: "C – moře", exam: { count: 28, minutes: 25, pass: 24 } },
} as const;
export type Cat = keyof typeof CATEGORY_INFO;

export function loadExplanations(dir: string, prefix: string): Record<string, Explanation> {
  const out: Record<string, Explanation> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.startsWith(prefix + "-") && f.endsWith(".json")).sort()) {
    let j: Record<string, Explanation>;
    try {
      j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Neplatný JSON v data/explain/${f}: ${(e as Error).message}`);
    }
    for (const [id, e] of Object.entries(j)) {
      if (out[id]) throw new Error(`Duplicitní vysvětlení ${id} (${f})`);
      out[id] = e;
    }
  }
  return out;
}

export function merge(qs: Question[], ex: Record<string, Explanation>) {
  const ids = new Set(qs.map((q) => q.id));
  const missing = qs.filter((q) => !ex[q.id]?.explain?.trim()).map((q) => q.id);
  const orphan = Object.keys(ex).filter((id) => !ids.has(id));
  const bad = Object.entries(ex)
    .filter(([, e]) => e.confidence !== "high" && e.confidence !== "check")
    .map(([id]) => id);
  const full: FullQuestion[] = qs.map((q) => ({ ...q, ...ex[q.id] }));
  return { full, missing, orphan, bad };
}

export interface BuildResult {
  files: Record<string, string>; // "data/m.json" -> obsah
  warnings: string[];
  summary: string[];
}

/** Sestaví data pro aplikaci z kořene projektu. */
export function buildData(root = process.cwd()): BuildResult {
  const files: Record<string, string> = {};
  const warnings: string[] = [];
  const summary: string[] = [];
  const index: { cat: Cat; title: string; count: number; exam: (typeof CATEGORY_INFO)[Cat]["exam"] }[] = [];
  for (const cat of Object.keys(CATEGORY_INFO) as Cat[]) {
    const p = join(root, "data", `${cat}.json`);
    if (!existsSync(p)) continue;
    const qs = JSON.parse(readFileSync(p, "utf8")) as Question[];
    const { full, missing, orphan, bad } = merge(qs, loadExplanations(join(root, "data", "explain"), cat));
    const checks = full.filter((q) => q.confidence === "check").length;
    summary.push(`${cat.toUpperCase()}: ${qs.length} otázek, vysvětlení ${qs.length - missing.length}, k ověření ${checks}`);
    if (missing.length) warnings.push(`${cat.toUpperCase()} bez vysvětlení: ${missing.join(", ")}`);
    if (orphan.length) warnings.push(`${cat.toUpperCase()} vysvětlení bez otázky: ${orphan.join(", ")}`);
    if (bad.length) warnings.push(`${cat.toUpperCase()} neplatné confidence: ${bad.join(", ")}`);
    files[`data/${cat}.json`] = JSON.stringify(full);
    index.push({ cat, title: CATEGORY_INFO[cat].title, count: full.length, exam: CATEGORY_INFO[cat].exam });
  }
  files["data/index.json"] = JSON.stringify(index);
  return { files, warnings, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildData();
  r.summary.forEach((s) => console.log(s));
  r.warnings.forEach((w) => console.warn("⚠ " + w));
  if (r.warnings.length) process.exit(1);
}

/**
 * Parser oficiálních souborů otázek SPS (uložené HTML stránky otazky.asp).
 * Použití: npm run parse [-- --zdroj ./zdroj]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export type Category = "M" | "S" | "C";

export interface Question {
  id: string;
  set: string; // zkratka souboru otázek, např. "PP1 2015"
  num: number; // číslo otázky na stránce SPS
  topic: string;
  q: string;
  correct: string;
  wrong: [string, string];
  img: string | null;
}

export interface ParseResult {
  file: string;
  category: Category;
  title: string;
  questions: Question[];
  imageRefs: { num: number; src: string }[];
}

export const TOPICS: Record<string, string> = {
  PP1: "Pojmy a obecná ustanovení",
  PP2: "Pravidla plavebního provozu",
  PP3: "Označení plavidel (obrázky)",
  PP4: "Zvukové signály a signální znaky",
  TZ: "Technika plavidla",
  ZP: "Zdravověda – první pomoc",
};

export const EXPECTED: Record<Category, number> = { M: 411, S: 170, C: 215 };

export class WrongFileError extends Error {}

/** Dekóduje bajty podle <meta charset>, výchozí windows-1250. */
export function decodeHtml(buf: Buffer): string {
  const head = buf.subarray(0, 4096).toString("latin1");
  const m = head.match(/charset\s*=\s*["']?([\w-]+)/i);
  const charset = (m?.[1] ?? "windows-1250").toLowerCase();
  return new TextDecoder(charset === "cp1250" ? "windows-1250" : charset).decode(buf);
}

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();

export function detectCategory(title: string, setCodes: string[]): Category {
  const all = (title + " " + setCodes.join(" ")).toUpperCase();
  if (/\b[A-Z]\d?EU\b/.test(all) || /PLAVIDLA EU/.test(all)) {
    throw new WrongFileError(
      `Soubor vypadá jako sada "Vůdce plavidla EU" (${title}). To je jiná zkouška – stáhni prosím znovu sadu M/S/C.`,
    );
  }
  const t = title.toUpperCase();
  const m = t.match(/'\s*([MSC])\s*(?:20)?\s*\d{0,4}\s*'/) ?? t.match(/\b([MSC])\s*(?:20|2015)\b/);
  if (m) return m[1] as Category;
  throw new Error(`Nepodařilo se určit kategorii z nadpisu: ${title}`);
}

export function parseHtml(html: string, file = "?"): ParseResult {
  const $ = cheerio.load(html);
  const title = clean($("h1").first().text());
  const rows = $("tr").toArray();
  type Raw = { num: number; set: string; q?: string; img?: string; answers: { correct: boolean; text: string }[] };
  const raws: Raw[] = [];
  let cur: Raw | null = null;

  for (const tr of rows) {
    const $tr = $(tr);
    if ($tr.hasClass("bg")) {
      const num = Number(clean($tr.find("td").first().find("span").text()));
      const setTxt = clean($tr.find("td").last().text()).replace(/^Zkratka souboru otázek:\s*/i, "");
      cur = { num, set: setTxt, answers: [] };
      raws.push(cur);
      continue;
    }
    if (!cur) continue;
    const th = clean($tr.children("th").first().text());
    if (!th) continue;
    const tds = $tr.children("td");
    if (/^Otázka/i.test(th)) {
      cur.q = clean(tds.first().text());
      const src = $tr.find("img").attr("src");
      if (src) cur.img = src;
    } else if (/Odpověď/i.test(th)) {
      cur.answers.push({ correct: /Správná/i.test(th), text: clean(tds.first().text()) });
      const src = $tr.find("img").attr("src");
      if (src) throw new Error(`Otázka ${cur.num}: obrázek v odpovědi není podporován (${src})`);
    }
  }

  const category = detectCategory(title, raws.map((r) => r.set));
  const imageRefs: ParseResult["imageRefs"] = [];
  const questions: Question[] = raws.map((r) => {
    const correct = r.answers.filter((a) => a.correct);
    const wrong = r.answers.filter((a) => !a.correct);
    if (!r.q) throw new Error(`Otázka ${r.num}: chybí text`);
    if (r.answers.length !== 3 || correct.length !== 1 || wrong.length !== 2)
      throw new Error(`Otázka ${r.num}: čekám 3 odpovědi (1 správná), nalezeno ${r.answers.length}/${correct.length}`);
    if (!r.answers[0].correct) throw new Error(`Otázka ${r.num}: správná odpověď není a)`);
    for (const a of r.answers) if (!a.text) throw new Error(`Otázka ${r.num}: prázdná odpověď`);
    let img: string | null = null;
    if (r.img) {
      const name = decodeURIComponent(r.img.split(/[\\/]/).pop()!);
      imageRefs.push({ num: r.num, src: r.img });
      img = `img/${name}`;
    }
    const code = r.set.split(/\s+/)[0];
    return {
      id: `${category}-${String(r.num).padStart(3, "0")}`,
      set: r.set,
      num: r.num,
      topic: TOPICS[code] ?? code,
      q: r.q,
      correct: correct[0].text,
      wrong: [wrong[0].text, wrong[1].text],
      img,
    };
  });
  return { file, category, title, questions, imageRefs };
}

export function checkCompleteness(r: ParseResult) {
  const nums = r.questions.map((q) => q.num);
  const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
  const missing: number[] = [];
  const max = Math.max(...nums);
  const set = new Set(nums);
  for (let i = 1; i <= max; i++) if (!set.has(i)) missing.push(i);
  return { count: nums.length, max, missing, duplicates: dup, expected: EXPECTED[r.category] };
}

async function main() {
  const argIdx = process.argv.indexOf("--zdroj");
  const root = resolve(argIdx > 0 ? process.argv[argIdx + 1] : "./zdroj");
  const files = readdirSync(root).filter((f) => /\.html?$/i.test(f) && statSync(join(root, f)).isFile());
  if (!files.length) throw new Error(`Ve složce ${root} není žádný .html/.htm soubor`);
  mkdirSync("data", { recursive: true });
  mkdirSync("public/img", { recursive: true });

  for (const f of files) {
    const full = join(root, f);
    const res = parseHtml(decodeHtml(readFileSync(full)), f);
    const chk = checkCompleteness(res);
    console.log(`\n=== ${f}\n    nadpis: ${res.title} → kategorie ${res.category}`);
    console.log(`    otázek: ${chk.count} (čekáno ${chk.expected}), čísla 1–${chk.max}`);
    if (chk.missing.length) console.warn(`    ⚠ chybějící čísla: ${chk.missing.join(", ")}`);
    if (chk.duplicates.length) throw new Error(`Duplicitní čísla: ${chk.duplicates.join(", ")}`);

    const bySet = new Map<string, number>();
    for (const q of res.questions) bySet.set(q.set, (bySet.get(q.set) ?? 0) + 1);
    for (const [s, n] of bySet) console.log(`      ${s.padEnd(10)} ${String(n).padStart(4)}  ${res.questions.find((q) => q.set === s)!.topic}`);

    // obrázky
    const filesDir = join(root, basename(f, extname(f)) + "_files");
    const missingImg: string[] = [];
    let copied = 0, downloaded = 0;
    for (const { num, src } of res.imageRefs) {
      const name = decodeURIComponent(src.split(/[\\/]/).pop()!);
      const dest = join("public/img", name);
      const local = join(filesDir, name);
      if (existsSync(local)) { copyFileSync(local, dest); copied++; continue; }
      if (existsSync(dest)) continue;
      try {
        const resp = await fetch(`http://www.spspraha.cz/zkousky/images/${encodeURIComponent(name)}`);
        if (!resp.ok) throw new Error(String(resp.status));
        writeFileSync(dest, Buffer.from(await resp.arrayBuffer()));
        downloaded++;
      } catch (e) {
        missingImg.push(`č. ${num}: ${name} (${(e as Error).message})`);
      }
    }
    console.log(`    obrázky: ${res.imageRefs.length} odkazů, zkopírováno ${copied}, staženo ${downloaded}, chybí ${missingImg.length}`);
    for (const m of missingImg) console.warn(`      ⚠ ${m}`);

    const out = join("data", `${res.category.toLowerCase()}.json`);
    writeFileSync(out, JSON.stringify(res.questions, null, 2) + "\n", "utf8");
    console.log(`    → ${out}`);
  }
}

const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(`\n✖ ${e.message}`); process.exit(1); });

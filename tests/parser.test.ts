import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeHtml, parseHtml, checkCompleteness, detectCategory, WrongFileError, type Question } from "../scripts/parse-sps";
import { buildData } from "../scripts/merge-explain";

const row = (num: number, set: string, q: string, a: string, b: string, c: string, img = "") => `
  <tr class="bg"><td align="left">č. <span style="font-size: 1.5em;">${num}</span></td>
  <td align="right" colspan="5"><span><i>Zkratka souboru otázek:</i></span> ${set}</td></tr>
  <tr><th>Otázka</th><td colspan="3">${q}</td>${img ? `<td><img src="./x_files/${img}"></td>` : ""}</tr>
  <tr><th>Správná odpověď&nbsp;a)</th><td colspan="5">${a}</td></tr>
  <tr><th>Odpověď&nbsp;b)</th><td colspan="5">${b}</td></tr>
  <tr><th>Odpověď&nbsp;c)</th><td colspan="5">${c}</td></tr>`;

const page = (title: string, rows: string, charset = "UTF-8") =>
  `<html><head><meta http-equiv="Content-Type" content="text/html; charset=${charset}"></head><body>
   <h1>Soubory otázek pro způsobilost<br>${title}</h1><table>${rows}</table></body></html>`;

describe("parser SPS – syntetická stránka", () => {
  it("vytáhne otázku, správnou odpověď, 2 špatné a obrázek", () => {
    const r = parseHtml(page("'M 2015'", row(1, "PP1 2015", "Otázka?", "správně", "špatně 1", "špatně 2", "211.jpg")));
    expect(r.category).toBe("M");
    expect(r.questions).toEqual<Question[]>([
      { id: "M-001", set: "PP1 2015", num: 1, topic: "Pojmy a obecná ustanovení", q: "Otázka?", correct: "správně", wrong: ["špatně 1", "špatně 2"], img: "img/211.jpg" },
    ]);
  });

  it("dekóduje windows-1250", () => {
    const html = page("'M 2015'", row(1, "PP1 2015", "Příďové světlo žluté", "ů", "ě", "š"), "windows-1250");
    // zakódujeme ručně: znaky mimo ASCII ve windows-1250
    const map: Record<string, number> = { "ř": 0xf8, "í": 0xed, "ď": 0xef, "é": 0xe9, "ě": 0xec, "ž": 0x9e, "ů": 0xf9, "š": 0x9a, "č": 0xe8, "Č": 0xc8, "ó": 0xf3, "á": 0xe1, "Ř": 0xd8, "ý": 0xfd, "ú": 0xfa, "Š": 0x8a, "Ž": 0x8e, "ň": 0xf2, "ť": 0x9d, "Ú": 0xda };
    const bytes = Buffer.from([...html].map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : map[ch] ?? 0x3f)));
    const r = parseHtml(decodeHtml(bytes));
    expect(r.questions[0].q).toBe("Příďové světlo žluté");
    expect(r.questions[0].correct).toBe("ů");
  });

  it("zastaví se u sady Vůdce plavidla EU", () => {
    expect(() => detectCategory("Soubory otázek 'A1EU'", ["A1EU 2015"])).toThrow(WrongFileError);
    expect(() => parseHtml(page("'A1EU'", row(1, "A1EU", "Hamburg?", "a", "b", "c")))).toThrow(WrongFileError);
  });

  it("odmítne otázku s chybějící odpovědí", () => {
    const bad = row(1, "PP1 2015", "Q", "a", "b", "c").replace(/<tr><th>Odpověď&nbsp;c\)<\/th>.*<\/tr>/, "");
    expect(() => parseHtml(page("'M 2015'", bad))).toThrow(/3 odpovědi/);
  });

  it("hlásí díry v číslování", () => {
    const r = parseHtml(page("'M 2015'", row(1, "ZP 2015", "Q1", "a", "b", "c") + row(3, "ZP 2015", "Q3", "a", "b", "c")));
    expect(checkCompleteness(r).missing).toEqual([2]);
  });
});

const zdrojFiles = existsSync("zdroj") ? readdirSync("zdroj").filter((f) => /\.html?$/i.test(f)) : [];

describe.skipIf(!zdrojFiles.length)("parser SPS – uložená stránka v zdroj/", () => {
  const r = parseHtml(decodeHtml(readFileSync(join("zdroj", zdrojFiles[0]))));
  it("je to sada M s 407 otázkami a známými dírami", () => {
    expect(r.category).toBe("M");
    const chk = checkCompleteness(r);
    expect(chk.count).toBe(407);
    expect(chk.missing).toEqual([33, 34, 44, 83]);
    expect(chk.duplicates).toEqual([]);
  });
  it("odpovídá uloženému data/m.json", () => {
    expect(JSON.parse(readFileSync("data/m.json", "utf8"))).toEqual(r.questions);
  });
});

describe("data/m.json + vysvětlení", () => {
  const qs = JSON.parse(readFileSync("data/m.json", "utf8")) as Question[];
  it("každá otázka má text, 1 správnou a 2 různé špatné odpovědi", () => {
    expect(qs).toHaveLength(407);
    for (const q of qs) {
      expect(q.q.trim(), q.id).not.toBe("");
      expect(q.correct.trim(), q.id).not.toBe("");
      expect(q.wrong, q.id).toHaveLength(2);
      expect(new Set([q.correct, ...q.wrong]).size, q.id).toBe(3);
    }
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });
  it("všechny obrázky existují v public/", () => {
    const withImg = qs.filter((q) => q.img);
    expect(withImg).toHaveLength(162);
    for (const q of withImg) expect(existsSync(join("public", q.img!)), q.img!).toBe(true);
  });
  it("každá otázka má vysvětlení a žádné nepatří k neexistující otázce", () => {
    const r = buildData();
    expect(r.warnings).toEqual([]);
    const full = JSON.parse(r.files["data/m.json"]) as (Question & { explain?: string; confidence?: string })[];
    for (const q of full) {
      expect(q.explain?.length ?? 0, q.id).toBeGreaterThan(20);
      expect(["high", "check"]).toContain(q.confidence);
    }
  });
});

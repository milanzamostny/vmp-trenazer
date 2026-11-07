import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  answerCard,
  composeExam,
  dueCards,
  evaluateExam,
  inMistakeDeck,
  isLearned,
  mergeProgress,
  emptyProgress,
  parseProgress,
  search,
  seededRng,
  shuffle,
  shuffledOptions,
  topicStats,
  BOX_INTERVAL_DAYS,
  type CardState,
  type Question,
} from "../src/logic";
import { CATEGORY_INFO } from "../scripts/merge-explain";

const qs = JSON.parse(readFileSync("data/m.json", "utf8")) as Question[];
const DAY = 86_400_000;

describe("míchání", () => {
  it("shuffle zachová prvky a nemění vstup", () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = shuffle(a, seededRng(1));
    expect([...b].sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("správná odpověď není pořád na stejném místě", () => {
    const rng = seededRng(42);
    const positions = new Set(Array.from({ length: 60 }, () => shuffledOptions(qs[0], rng).findIndex((o) => o.correct)));
    expect(positions).toEqual(new Set([0, 1, 2]));
    const opts = shuffledOptions(qs[0], rng);
    expect(opts.filter((o) => o.correct)).toHaveLength(1);
    expect(opts.map((o) => o.text).sort()).toEqual([qs[0].correct, ...qs[0].wrong].sort());
  });
});

describe("skládání testu", () => {
  const { count } = CATEGORY_INFO.m.exam;
  it("má přesně 35 otázek bez duplicit", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ex = composeExam(qs, count, seededRng(seed));
      expect(ex).toHaveLength(count);
      expect(new Set(ex.map((q) => q.id)).size).toBe(count);
    }
  });
  it("bere z okruhů úměrně jejich velikosti", () => {
    const ex = composeExam(qs, count, seededRng(7));
    const sizes = new Map<string, number>();
    qs.forEach((q) => sizes.set(q.set, (sizes.get(q.set) ?? 0) + 1));
    for (const [set, n] of sizes) {
      const exact = (n / qs.length) * count;
      const got = ex.filter((q) => q.set === set).length;
      expect(got, set).toBeGreaterThanOrEqual(Math.floor(exact));
      expect(got, set).toBeLessThanOrEqual(Math.ceil(exact));
    }
  });
  it("různé testy se liší", () => {
    const a = composeExam(qs, count, seededRng(1)).map((q) => q.id).join();
    const b = composeExam(qs, count, seededRng(2)).map((q) => q.id).join();
    expect(a).not.toBe(b);
  });
  it("při malé sadě vrátí všechny otázky", () => {
    expect(composeExam(qs.slice(0, 5), 35)).toHaveLength(5);
  });
});

describe("vyhodnocení testu", () => {
  const mk = (n: number) => qs.slice(0, n);
  const answers = (ex: Question[], right: number, unanswered = 0) =>
    Object.fromEntries(ex.map((q, i) => [q.id, i < right ? true : i < ex.length - unanswered ? false : undefined]));

  it.each([
    ["m", 35, 30],
    ["s", 14, 11],
    ["c", 28, 24],
  ] as const)("kategorie %s: %i otázek, hranice %i", (cat, count, pass) => {
    expect(CATEGORY_INFO[cat].exam).toMatchObject({ count, pass });
    const ex = mk(count);
    expect(evaluateExam(ex, answers(ex, pass), pass).passed).toBe(true);
    expect(evaluateExam(ex, answers(ex, pass - 1), pass).passed).toBe(false);
    expect(evaluateExam(ex, answers(ex, count), pass).correct).toBe(count);
  });
  it("nezodpovězená otázka se počítá jako chyba", () => {
    const ex = mk(35);
    const r = evaluateExam(ex, answers(ex, 30, 5), 30);
    expect(r).toMatchObject({ correct: 30, passed: true, unanswered: 5 });
    expect(r.wrongIds).toHaveLength(5);
    expect(evaluateExam(ex, {}, 30)).toMatchObject({ correct: 0, passed: false, unanswered: 35 });
  });
  it("časové limity odpovídají SPS", () => {
    expect([CATEGORY_INFO.m.exam.minutes, CATEGORY_INFO.s.exam.minutes, CATEGORY_INFO.c.exam.minutes]).toEqual([30, 10, 25]);
  });
});

describe("Leitner", () => {
  const t0 = 1_700_000_000_000;
  it("špatně → přihrádka 1, správně → o jednu výš, nová správně → 2", () => {
    let c = answerCard(undefined, true, t0);
    expect(c.box).toBe(2);
    c = answerCard(c, false, t0);
    expect(c).toMatchObject({ box: 1, right: 1, wrong: 1 });
    for (const box of [2, 3, 4, 5]) {
      c = answerCard(c, true, t0);
      expect(c.box).toBe(box);
    }
    expect(isLearned(c)).toBe(true);
    c = answerCard(c, true, t0);
    expect(c.box).toBe(5); // nepřeteče
    c = answerCard(c, false, t0);
    expect(c.box).toBe(1); // i naučená spadne zpět
  });
  it("balíček chyb obsahuje jen kdysi chybné a nenaučené", () => {
    expect(inMistakeDeck(answerCard(undefined, true, t0))).toBe(false);
    expect(inMistakeDeck(answerCard(undefined, false, t0))).toBe(true);
    const learned: CardState = { box: 5, right: 5, wrong: 1, last: t0 };
    expect(inMistakeDeck(learned)).toBe(false);
  });
  it("opakuje podle intervalů přihrádek, nižší přihrádky dřív", () => {
    expect(BOX_INTERVAL_DAYS.slice(1, 5)).toEqual([0, 1, 3, 7]);
    const cards: Record<string, CardState> = {
      a: { box: 1, right: 0, wrong: 1, last: t0 },
      b: { box: 2, right: 1, wrong: 1, last: t0 },
      c: { box: 3, right: 2, wrong: 1, last: t0 },
      d: { box: 4, right: 3, wrong: 1, last: t0 },
      e: { box: 2, right: 0, wrong: 0, last: t0 }, // nikdy chybná → není v balíčku
    };
    expect(dueCards(cards, t0)).toEqual(["a"]);
    expect(dueCards(cards, t0 + 1 * DAY)).toEqual(["a", "b"]);
    expect(dueCards(cards, t0 + 3 * DAY)).toEqual(["a", "b", "c"]);
    expect(dueCards(cards, t0 + 7 * DAY)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("postup: statistika, export/import", () => {
  it("statistika po okruzích sečte otázky", () => {
    const st = topicStats(qs, { "M-001": { box: 1, right: 2, wrong: 3, last: 1 } });
    expect(st.reduce((s, t) => s + t.total, 0)).toBe(407);
    expect(st.find((t) => t.set === "PP1 2015")).toMatchObject({ seen: 1, right: 2, wrong: 3 });
  });
  it("sloučení vezme u kartičky novější odpověď a sjednotí testy", () => {
    const a = { ...emptyProgress(), cards: { x: { box: 1, right: 0, wrong: 1, last: 10 } }, exams: [{ cat: "m", date: 1, correct: 30, total: 35, passed: true, seconds: 100, wrongIds: [] }] };
    const b = { ...emptyProgress(), cards: { x: { box: 3, right: 2, wrong: 1, last: 20 }, y: { box: 2, right: 1, wrong: 0, last: 5 } }, exams: [a.exams[0], { ...a.exams[0], date: 2 }] };
    const m = mergeProgress(a, b);
    expect(m.cards.x.box).toBe(3);
    expect(Object.keys(m.cards)).toEqual(["x", "y"]);
    expect(m.exams).toHaveLength(2);
  });
  it("import odmítne cizí soubor", () => {
    expect(() => parseProgress('{"foo":1}')).toThrow();
    expect(parseProgress(JSON.stringify(emptyProgress())).version).toBe(1);
  });
});

describe("hledání", () => {
  it("ignoruje diakritiku a velikost písmen", () => {
    expect(search(qs, "PLACHETNICE").length).toBe(search(qs, "plachetnice").length);
    expect(search(qs, "tisnove cislo").map((q) => q.num)).toContain(411);
  });
  it("číslo hledá číslo otázky", () => {
    expect(search(qs, "112").map((q) => q.num)).toEqual([112]);
  });
  it("hledá nejdřív celou frázi", () => {
    const r = search(qs, "vlajka a");
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(10);
  });
});

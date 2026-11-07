// Čistá logika bez DOM – testuje se ve Vitestu.

export interface Question {
  id: string;
  set: string;
  num: number;
  topic: string;
  q: string;
  correct: string;
  wrong: [string, string];
  img: string | null;
  explain?: string;
  mnemo?: string;
  ref?: string;
  confidence?: "high" | "check";
}

export interface ExamFormat {
  count: number;
  minutes: number;
  pass: number;
}

export interface CategoryIndex {
  cat: string;
  title: string;
  count: number;
  exam: ExamFormat;
}

/* ---------- náhoda ---------- */

export type Rng = () => number;

/** Deterministický generátor (mulberry32) – pro testy. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Option {
  text: string;
  correct: boolean;
}

/** Zamíchané možnosti odpovědi (na stránce SPS je správná vždy a). */
export function shuffledOptions(q: Question, rng: Rng = Math.random): Option[] {
  return shuffle(
    [
      { text: q.correct, correct: true },
      { text: q.wrong[0], correct: false },
      { text: q.wrong[1], correct: false },
    ],
    rng,
  );
}

/* ---------- Leitner ---------- */

export const BOXES = 5;
/** Kolik dní musí uplynout, než je kartička v dané přihrádce znovu na řadě. */
export const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, Infinity];
const DAY = 86_400_000;

export interface CardState {
  box: number; // 0 = nová, 1–5 Leitner, 5 = naučená
  right: number;
  wrong: number;
  last: number; // timestamp poslední odpovědi
}

export const newCard = (): CardState => ({ box: 0, right: 0, wrong: 0, last: 0 });

/** Zaznamená odpověď: špatně → přihrádka 1, správně → o přihrádku výš (nová správně → 2). */
export function answerCard(c: CardState | undefined, correct: boolean, now = Date.now()): CardState {
  const s = c ?? newCard();
  if (!correct) return { box: 1, right: s.right, wrong: s.wrong + 1, last: now };
  const box = s.box === 0 ? 2 : Math.min(BOXES, s.box + 1);
  return { box, right: s.right + 1, wrong: s.wrong, last: now };
}

export const isLearned = (c?: CardState) => !!c && c.box >= BOXES;
/** Kartička patří do balíčku chyb, pokud byla aspoň jednou zodpovězena špatně a ještě není naučená. */
export const inMistakeDeck = (c?: CardState) => !!c && c.wrong > 0 && c.box < BOXES;
export const isDue = (c: CardState, now = Date.now()) => now - c.last >= BOX_INTERVAL_DAYS[c.box] * DAY;

/** Kartičky k opakování: nejdřív nižší přihrádky, v rámci přihrádky nejstarší. */
export function dueCards(cards: Record<string, CardState>, now = Date.now()): string[] {
  return Object.entries(cards)
    .filter(([, c]) => inMistakeDeck(c) && isDue(c, now))
    .sort(([, a], [, b]) => a.box - b.box || a.last - b.last)
    .map(([id]) => id);
}

export function boxCounts(ids: string[], cards: Record<string, CardState>): number[] {
  const counts = new Array(BOXES + 1).fill(0);
  for (const id of ids) counts[cards[id]?.box ?? 0]++;
  return counts;
}

/* ---------- test nanečisto ---------- */

/**
 * Složí test: počet otázek z každého okruhu (set) úměrně jeho velikosti
 * (metoda největších zbytků), bez duplicit, v náhodném pořadí.
 */
export function composeExam(qs: Question[], count: number, rng: Rng = Math.random): Question[] {
  if (count >= qs.length) return shuffle(qs, rng);
  const groups = new Map<string, Question[]>();
  for (const q of qs) groups.set(q.set, [...(groups.get(q.set) ?? []), q]);
  const quotas = [...groups.entries()].map(([set, g]) => {
    const exact = (g.length / qs.length) * count;
    return { set, g, n: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = count - quotas.reduce((s, x) => s + x.n, 0);
  for (const x of [...quotas].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    x.n++;
    left--;
  }
  const picked = quotas.flatMap((x) => shuffle(x.g, rng).slice(0, x.n));
  return shuffle(picked, rng);
}

export interface ExamResult {
  total: number;
  correct: number;
  passed: boolean;
  wrongIds: string[];
  unanswered: number;
}

/** answers[id] = true/false (správně/špatně), chybějící = nezodpovězeno (počítá se jako chyba). */
export function evaluateExam(qs: Question[], answers: Record<string, boolean | undefined>, pass: number): ExamResult {
  const correct = qs.filter((q) => answers[q.id] === true).length;
  return {
    total: qs.length,
    correct,
    passed: correct >= pass,
    wrongIds: qs.filter((q) => answers[q.id] !== true).map((q) => q.id),
    unanswered: qs.filter((q) => answers[q.id] === undefined).length,
  };
}

/* ---------- statistika a hledání ---------- */

export interface TopicStat {
  topic: string;
  set: string;
  total: number;
  seen: number;
  learned: number;
  right: number;
  wrong: number;
}

export function topicStats(qs: Question[], cards: Record<string, CardState>): TopicStat[] {
  const map = new Map<string, TopicStat>();
  for (const q of qs) {
    const s = map.get(q.set) ?? { topic: q.topic, set: q.set, total: 0, seen: 0, learned: 0, right: 0, wrong: 0 };
    const c = cards[q.id];
    s.total++;
    if (c && c.right + c.wrong > 0) s.seen++;
    if (isLearned(c)) s.learned++;
    s.right += c?.right ?? 0;
    s.wrong += c?.wrong ?? 0;
    map.set(q.set, s);
  }
  return [...map.values()];
}

/** Normalizace pro hledání bez ohledu na diakritiku a velikost písmen. */
export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Fulltext bez diakritiky. Samotné číslo hledá číslo otázky. Nejdřív se zkusí celá fráze
 * („vlajka a“), když nic nenajde, hledají se všechna slova kdekoli (jednopísmenná se ignorují).
 */
export function search(qs: Question[], query: string): Question[] {
  const phrase = norm(query).trim().replace(/\s+/g, " ");
  if (!phrase) return qs;
  if (/^\d+$/.test(phrase)) return qs.filter((q) => String(q.num) === phrase);
  const hay = (q: Question) => norm([q.q, q.correct, q.wrong.join(" "), q.explain ?? "", q.mnemo ?? ""].join(" ")).replace(/\s+/g, " ");
  const byPhrase = qs.filter((q) => hay(q).includes(phrase));
  if (byPhrase.length || !phrase.includes(" ")) return byPhrase;
  const terms = phrase.split(" ").filter((t) => t.length > 1);
  return qs.filter((q) => terms.every((t) => hay(q).includes(t)));
}

/* ---------- uložený postup ---------- */

export interface ExamRecord {
  cat: string;
  date: number;
  correct: number;
  total: number;
  passed: boolean;
  seconds: number;
  wrongIds: string[];
}

export interface Progress {
  version: 1;
  cards: Record<string, CardState>;
  exams: ExamRecord[];
  walk: Record<string, number>; // kategorie -> index v režimu „projeď všechno“
  updated: number;
}

export const emptyProgress = (): Progress => ({ version: 1, cards: {}, exams: [], walk: {}, updated: 0 });

/** Sloučí importovaný postup: u každé kartičky vyhrává novější odpověď. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const cards = { ...a.cards };
  for (const [id, c] of Object.entries(b.cards)) if (!cards[id] || c.last > cards[id].last) cards[id] = c;
  const key = (e: ExamRecord) => `${e.cat}|${e.date}`;
  const exams = [...new Map([...a.exams, ...b.exams].map((e) => [key(e), e])).values()].sort((x, y) => x.date - y.date);
  const walk = { ...a.walk };
  for (const [k, v] of Object.entries(b.walk)) walk[k] = Math.max(walk[k] ?? 0, v);
  return { version: 1, cards, exams, walk, updated: Math.max(a.updated, b.updated) };
}

export function parseProgress(json: string): Progress {
  const p = JSON.parse(json);
  if (!p || p.version !== 1 || typeof p.cards !== "object") throw new Error("Soubor neobsahuje postup VMP trenažéru.");
  return { ...emptyProgress(), ...p };
}

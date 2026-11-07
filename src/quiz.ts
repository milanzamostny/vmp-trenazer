import { h, clear } from "./dom";
import { shuffledOptions, type Option, type Question } from "./logic";
import { recordAnswer } from "./store";

const LETTERS = ["A", "B", "C"];

export function explanationBox(q: Question, open = true) {
  if (!q.explain) return null;
  return h(
    "div",
    { class: "explain" + (open ? "" : " collapsed") },
    h("h3", null, "Vysvětlení", q.confidence === "check" ? h("span", { class: "badge warn", title: "Vysvětlení čeká na ruční ověření" }, "k ověření") : null),
    h("p", null, q.explain),
    q.mnemo ? h("p", { class: "mnemo" }, h("strong", null, "Pomůcka: "), q.mnemo) : null,
    q.ref ? h("p", { class: "ref" }, "Předpis: ", q.ref) : null,
  );
}

export function questionHead(q: Question) {
  return h(
    "div",
    { class: "q-head" },
    h("span", { class: "q-num" }, `č. ${q.num}`),
    h("span", { class: "q-topic" }, q.topic),
  );
}

export function questionBody(q: Question) {
  return [
    h("p", { class: "q-text" }, q.q),
    q.img ? h("img", { class: "q-img", src: q.img, alt: "Obrázek k otázce " + q.num, loading: "lazy" }) : null,
  ];
}

export interface CardHandle {
  el: HTMLElement;
  choose(i: number): void;
  answered(): boolean;
}

/**
 * Karta otázky.
 * - practice: po výběru okamžitě ukáže správně/špatně + vysvětlení a zapíše do Leitneru,
 * - exam: jen označí výběr (lze změnit), nic neprozradí,
 * - review: ukáže zvolenou a správnou odpověď (rozbor testu, návrat zpět).
 */
export function questionCard(
  q: Question,
  mode: "practice" | "exam" | "review",
  opts: { options?: Option[]; chosen?: number; onChoose?: (i: number, correct: boolean) => void } = {},
): CardHandle & { options: Option[] } {
  const options = opts.options ?? shuffledOptions(q);
  let chosen = opts.chosen ?? -1;
  const side = h("div", { class: "q-side" });
  const list = h("div", { class: "options", role: "group", "aria-label": "Možnosti odpovědi" });
  const el = h("article", { class: "qa" }, h("div", { class: "q-main" }, questionHead(q), questionBody(q), list), side);

  const reveal = mode === "review" || (mode === "practice" && chosen >= 0);

  function render() {
    clear(list);
    const showResult = mode === "review" || (mode === "practice" && chosen >= 0);
    options.forEach((o, i) => {
      let cls = "opt";
      if (mode === "exam" && i === chosen) cls += " selected";
      if (showResult && o.correct) cls += " correct";
      if (showResult && i === chosen && !o.correct) cls += " wrong";
      list.appendChild(
        h(
          "button",
          {
            class: cls,
            type: "button",
            disabled: showResult,
            "aria-pressed": i === chosen ? "true" : "false",
            onclick: () => choose(i),
          },
          h("span", { class: "letter" }, LETTERS[i]),
          h("span", { class: "opt-text" }, o.text),
        ),
      );
    });
    clear(side);
    if (showResult) {
      const ok = chosen >= 0 && options[chosen].correct;
      if (chosen >= 0) side.appendChild(h("div", { class: "verdict " + (ok ? "ok" : "bad") }, ok ? "✔ Správně" : "✘ Špatně"));
      else side.appendChild(h("div", { class: "verdict bad" }, "Nezodpovězeno"));
      const box = explanationBox(q);
      if (box) side.appendChild(box);
      el.classList.add("revealed");
    }
  }

  function choose(i: number) {
    if (i < 0 || i >= options.length) return;
    if (mode === "review") return;
    if (mode === "practice" && chosen >= 0) return;
    chosen = i;
    if (mode === "practice") recordAnswer(q.id, options[i].correct);
    opts.onChoose?.(i, options[i].correct);
    render();
  }

  render();
  if (reveal) el.classList.add("revealed");
  return { el, options, choose, answered: () => chosen >= 0 };
}

/* ---------- procvičovací relace (procvičování, chyby, projeď všechno) ---------- */

export interface SessionOpts {
  title: string;
  ids: string[];
  byId: Map<string, Question>;
  startAt?: number;
  onPosition?: (i: number) => void;
  onFinish?: (stats: { right: number; wrong: number }) => void;
  emptyText?: string;
}

export interface Session {
  el: HTMLElement;
  key(e: KeyboardEvent): void;
}

export function practiceSession(o: SessionOpts): Session {
  const el = h("section", { class: "session" });
  const history: { options: Option[]; chosen: number }[] = [];
  let i = Math.min(o.startAt ?? 0, Math.max(0, o.ids.length - 1));
  let right = 0;
  let wrong = 0;
  let card: CardHandle | null = null;

  if (!o.ids.length) {
    el.appendChild(h("div", { class: "empty" }, o.emptyText ?? "Žádné otázky."));
    return { el, key() {} };
  }

  function show() {
    clear(el);
    const q = o.byId.get(o.ids[i])!;
    const past = history[i];
    const c = questionCard(q, past ? "review" : "practice", {
      options: past?.options,
      chosen: past?.chosen,
      onChoose: (ci, ok) => {
        history[i] = { options: c.options, chosen: ci };
        ok ? right++ : wrong++;
        nav.querySelector<HTMLButtonElement>(".next")!.disabled = false;
        nav.querySelector<HTMLButtonElement>(".next")!.focus({ preventScroll: true });
        score.textContent = `✔ ${right}  ✘ ${wrong}`;
      },
    });
    card = c;
    const total = o.ids.length;
    const bar = h("div", { class: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": i + 1 }, h("span", { style: `width:${((i + 1) / total) * 100}%` }));
    const score = h("span", { class: "score" }, `✔ ${right}  ✘ ${wrong}`);
    const nav = h(
      "div",
      { class: "nav" },
      h("button", { class: "btn ghost prev", type: "button", disabled: i === 0, onclick: prev }, "← Zpět"),
      h("button", { class: "btn primary next", type: "button", disabled: !c.answered(), onclick: next }, i + 1 >= total ? "Dokončit" : "Další →"),
    );
    el.append(
      h("div", { class: "session-head" }, h("h2", null, o.title), h("span", { class: "counter" }, `${i + 1} / ${total}`), score),
      bar,
      c.el,
      nav,
      h("p", { class: "hint kbd-hint" }, "Klávesy: A/B/C nebo 1/2/3 = odpověď, Enter nebo → = další, ← = zpět"),
    );
    o.onPosition?.(i);
  }

  function next() {
    if (!card?.answered()) return;
    if (i + 1 >= o.ids.length) return finish();
    i++;
    show();
    window.scrollTo({ top: 0 });
  }
  function prev() {
    if (i === 0) return;
    i--;
    show();
  }
  function finish() {
    o.onPosition?.(o.ids.length);
    o.onFinish?.({ right, wrong });
    clear(el);
    el.append(
      h("div", { class: "done card" }, h("h2", null, "Hotovo"), h("p", null, `Správně ${right}, špatně ${wrong}.`), h("a", { class: "btn primary", href: "#/" }, "Na přehled")),
    );
  }

  show();
  return {
    el,
    key(e) {
      const k = e.key.toLowerCase();
      const idx = { a: 0, b: 1, c: 2, "1": 0, "2": 1, "3": 2 }[k];
      if (idx !== undefined) {
        card?.choose(idx);
        e.preventDefault();
      } else if (k === "enter" || k === "arrowright") {
        if (card?.answered()) {
          next();
          e.preventDefault();
        }
      } else if (k === "arrowleft") {
        prev();
        e.preventDefault();
      }
    },
  };
}

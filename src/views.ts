import { h, clear, download, fmtTime, plural } from "./dom";
import {
  boxCounts,
  composeExam,
  dueCards,
  evaluateExam,
  inMistakeDeck,
  isLearned,
  search,
  shuffle,
  shuffledOptions,
  topicStats,
  answerCard,
  type CategoryIndex,
  type Option,
  type Question,
} from "./logic";
import { questionCard, practiceSession, explanationBox, questionHead, questionBody, type Session } from "./quiz";
import { progress, saveProgress, exportProgress, importProgress, resetProgress, settings, saveSettings } from "./store";

export interface Ctx {
  cat: CategoryIndex;
  qs: Question[];
  byId: Map<string, Question>;
  /** Nastaví obsluhu kláves pro aktuální obrazovku. */
  setKeys(fn: ((e: KeyboardEvent) => void) | null): void;
  /** Úklid při odchodu z obrazovky (časovač testu apod.). */
  onLeave(fn: () => void): void;
  rerender(): void;
}

const topics = (qs: Question[]) => [...new Map(qs.map((q) => [q.set, q.topic])).entries()];

function topicSelect(qs: Question[], value: string, onChange: (v: string) => void) {
  return h(
    "select",
    { class: "input", onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value), "aria-label": "Okruh" },
    h("option", { value: "", selected: value === "" }, "Všechny okruhy"),
    topics(qs).map(([set, topic]) => h("option", { value: set, selected: value === set }, `${topic} (${set})`)),
  );
}

/* ================= Přehled ================= */

export function overview(root: HTMLElement, ctx: Ctx) {
  const { cat, qs } = ctx;
  const stats = topicStats(qs, progress.cards);
  const seen = stats.reduce((s, t) => s + t.seen, 0);
  const learned = stats.reduce((s, t) => s + t.learned, 0);
  const due = dueCards(progress.cards).filter((id) => ctx.byId.has(id)).length;
  const exams = progress.exams.filter((e) => e.cat === cat.cat).slice(-5).reverse();

  root.append(
    h(
      "section",
      { class: "grid-2" },
      h(
        "div",
        { class: "card" },
        h("h2", null, "Zkouška ", cat.cat.toUpperCase()),
        h(
          "ul",
          { class: "facts" },
          h("li", null, h("b", null, cat.exam.count), " otázek"),
          h("li", null, h("b", null, cat.exam.minutes), " minut"),
          h("li", null, "k úspěchu ", h("b", null, `≥ ${cat.exam.pass}`), " správně"),
        ),
        h("p", { class: "muted" }, "Formáty ostatních kategorií: M 35/30 min/≥30 · S 14/10 min/≥11 · C 28/25 min/≥24."),
        h("a", { class: "btn primary", href: "#/test" }, "Spustit test nanečisto"),
      ),
      h(
        "div",
        { class: "card" },
        h("h2", null, "Tvůj postup"),
        h(
          "div",
          { class: "kpis" },
          kpi(`${seen}/${qs.length}`, "viděno"),
          kpi(`${learned}`, "naučeno (přihr. 5)"),
          kpi(`${due}`, "k opakování"),
        ),
        h("div", { class: "row" }, h("a", { class: "btn", href: "#/procvicovani" }, "Procvičovat"), h("a", { class: "btn", href: "#/chyby" }, "Opakovat chyby"), h("a", { class: "btn", href: "#/vse" }, "Projeď všechno")),
      ),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", null, "Statistika podle okruhů"),
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "stats" },
          h("thead", null, h("tr", null, h("th", null, "Okruh"), h("th", null, "Viděno"), h("th", null, "Úspěšnost"), h("th", null, "Chyb"), h("th", null, "Naučeno"))),
          h(
            "tbody",
            null,
            [...stats]
              .sort((a, b) => b.wrong - a.wrong)
              .map((t) => {
                const n = t.right + t.wrong;
                const pct = n ? Math.round((t.right / n) * 100) : null;
                return h(
                  "tr",
                  null,
                  h("td", null, h("a", { href: `#/procvicovani?set=${encodeURIComponent(t.set)}` }, t.topic), h("small", { class: "muted" }, " ", t.set)),
                  h("td", null, `${t.seen}/${t.total}`),
                  h("td", null, pct === null ? "–" : h("span", { class: "pct " + (pct >= 86 ? "ok" : pct >= 70 ? "mid" : "bad") }, `${pct} %`)),
                  h("td", null, t.wrong),
                  h("td", null, h("div", { class: "mini-bar" }, h("span", { style: `width:${(t.learned / t.total) * 100}%` })), `${t.learned}`),
                );
              }),
          ),
        ),
      ),
    ),
    exams.length
      ? h(
          "section",
          { class: "card" },
          h("h2", null, "Poslední testy"),
          h(
            "ul",
            { class: "exam-list" },
            exams.map((e) =>
              h(
                "li",
                null,
                h("span", { class: "badge " + (e.passed ? "ok" : "bad") }, e.passed ? "prospěl(a)" : "neprospěl(a)"),
                ` ${e.correct}/${e.total} · ${fmtTime(e.seconds)} · ${new Date(e.date).toLocaleString("cs-CZ")}`,
              ),
            ),
          ),
        )
      : document.createComment(""),
    cheatSheet(),
    settingsCard(ctx),
  );
}

const kpi = (v: string, l: string) => h("div", { class: "kpi" }, h("b", null, v), h("span", null, l));

function cheatSheet() {
  const rows: [string, string][] = [
    ["Délka zvuků", "velmi krátký ¼ s · krátký 1 s · dlouhý 4 s · řada úderů na zvon 4 s"],
    ["Krátké zvuky", "1 = doprava · 2 = doleva · 3 = zpětný chod · 4 = nemohu manévrovat · 5 = předjíždění nelze"],
    ["Ostatní zvuky", "1 dlouhý = pozor · řada velmi krátkých = nebezpečí kolize · řada dlouhých / údery na zvon = nouze"],
    ["Obrat / přístav", "dlouhý + 1 krátký = obrat doprava, + 2 krátké = doleva · 3 dlouhé = přeplutí · 3 dlouhé + 1/2 krátké = vplutí/vyplutí doprava/doleva"],
    ["Snížená viditelnost", "plující: 1 dlouhý (samotné) / 2 dlouhé (sestava) ≤ 1 min · stojící zvon: 1 řada vlevo, 2 vpravo, 3 neurčitá poloha"],
    ["Světla", "vrcholové 225° · boční 112,5° · záďové 135° · ze všech stran 360° · blikavé 40–60/min, rychle blikavé 100–120/min"],
    ["Malé plavidlo", "≤ 20 m, ≤ 12 cestujících · zjednodušené osvětlení do 7 m · evidence: > 4 kW, > 1000 kg, > 12 m² plachet · označení ≥ 10 cm"],
    ["Vzdálenosti", "plavec: motor 10 m, bez motoru 3 m · vlajka A 50 m · bóje potápěčů 25 m · modré kužele při stání 10 / 50 / 100 m"],
    ["Další vzdálenosti", "2 a více modrých za plavby > 50 m · tři zelená světla 1000 m · balón–kužel–balón 50 m · koupání do 100 m od mostu zakázáno"],
    ["Signální znaky", "červený rám + přeškrtnutí = zákaz · červený rám = příkaz · modrá = informace/povolení · žlutá = doporučení"],
    ["Plavební dráha", "po proudu: vpravo červená (válec, čtverec), vlevo zelená (kužel, kosočtverec)"],
    ["První pomoc", "155 záchranka · 112 EU · 150 hasiči · 158 policie · 30:2 · 100–120 stlačení/min · hloubka 5–6 cm"],
  ];
  return h(
    "section",
    { class: "card" },
    h("details", null, h("summary", null, h("h2", { class: "inline" }, "Tahák s čísly")), h("dl", { class: "cheat" }, rows.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]))),
  );
}

function settingsCard(ctx: Ctx) {
  const file = h("input", {
    type: "file",
    accept: "application/json,.json",
    class: "visually-hidden",
    onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        const merge = confirm("Sloučit s postupem na tomto zařízení?\nOK = sloučit (doporučeno), Zrušit = nahradit.");
        importProgress(await f.text(), merge ? "merge" : "replace");
        alert("Postup byl načten.");
        ctx.rerender();
      } catch (err) {
        alert("Import se nepovedl: " + (err as Error).message);
      }
    },
  }) as HTMLInputElement;
  return h(
    "section",
    { class: "card" },
    h("h2", null, "Nastavení a přenos postupu"),
    h(
      "div",
      { class: "row" },
      h("label", { class: "field" }, "Vzhled ", h(
        "select",
        { class: "input", onchange: (e: Event) => { saveSettings({ theme: (e.target as HTMLSelectElement).value as "auto" }); applyTheme(); } },
        (["auto", "light", "dark"] as const).map((t) => h("option", { value: t, selected: settings.theme === t }, { auto: "podle systému", light: "světlý", dark: "tmavý" }[t])),
      )),
    ),
    h("p", { class: "muted" }, "Postup se ukládá jen v tomto prohlížeči. Pro přenos mezi PC, iPadem a mobilem ho exportuj do souboru a na druhém zařízení importuj."),
    h(
      "div",
      { class: "row" },
      h("button", { class: "btn", type: "button", onclick: () => download(exportProgress(), `vmp-postup-${new Date().toISOString().slice(0, 10)}.json`) }, "Exportovat postup"),
      h("button", { class: "btn", type: "button", onclick: () => file.click() }, "Importovat postup"),
      file,
      h("button", { class: "btn danger", type: "button", onclick: () => { if (confirm("Opravdu smazat celý postup na tomto zařízení?")) { resetProgress(); ctx.rerender(); } } }, "Smazat postup"),
    ),
  );
}

export function applyTheme() {
  const t = settings.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

/* ================= Procvičování ================= */

export function practice(root: HTMLElement, ctx: Ctx, params: URLSearchParams) {
  const set = params.get("set") ?? "";
  const order = params.get("order") ?? "weak";
  if (!params.get("start")) {
    let chosenSet = set;
    let chosenOrder = order;
    const go = () => (location.hash = `#/procvicovani?set=${encodeURIComponent(chosenSet)}&order=${chosenOrder}&start=1`);
    root.append(
      h(
        "section",
        { class: "card narrow" },
        h("h2", null, "Procvičování"),
        h("p", { class: "muted" }, "Po každé odpovědi hned uvidíš, jestli je správně, a vysvětlení. Odpovědi se počítají do kartiček (Leitner)."),
        h("label", { class: "field" }, "Okruh", topicSelect(ctx.qs, set, (v) => (chosenSet = v))),
        h(
          "fieldset",
          { class: "field" },
          h("legend", null, "Pořadí"),
          [
            ["weak", "Nejdřív nové a slabé otázky"],
            ["random", "Náhodně"],
            ["seq", "Popořadě podle čísla"],
          ].map(([v, l]) =>
            h("label", { class: "radio" }, h("input", { type: "radio", name: "order", value: v, checked: v === order, onchange: () => (chosenOrder = v) }), " ", l),
          ),
        ),
        h("button", { class: "btn primary big", type: "button", onclick: go }, "Začít"),
      ),
    );
    return;
  }
  let pool = ctx.qs.filter((q) => !set || q.set === set);
  if (order === "random") pool = shuffle(pool);
  else if (order === "weak") {
    const score = (q: Question) => {
      const c = progress.cards[q.id];
      if (!c || c.right + c.wrong === 0) return 0; // nové
      return c.box * 10 - c.wrong + Math.random();
    };
    pool = shuffle(pool).sort((a, b) => score(a) - score(b));
  }
  const title = set ? pool[0]?.topic ?? "Procvičování" : "Procvičování – všechny okruhy";
  const s = practiceSession({ title, ids: pool.map((q) => q.id), byId: ctx.byId });
  root.append(s.el);
  ctx.setKeys(s.key);
}

/* ================= Chyby (Leitner) ================= */

export function mistakes(root: HTMLElement, ctx: Ctx, params: URLSearchParams) {
  const ids = ctx.qs.map((q) => q.id);
  const deck = ids.filter((id) => inMistakeDeck(progress.cards[id]));
  const due = dueCards(progress.cards).filter((id) => ctx.byId.has(id));
  if (params.get("start")) {
    const list = params.get("start") === "all" ? shuffle(deck) : due;
    const s = practiceSession({ title: "Opakování chyb", ids: list, byId: ctx.byId, emptyText: "Teď není nic k opakování. 🎉" });
    root.append(s.el);
    ctx.setKeys(s.key);
    return;
  }
  const counts = boxCounts(ids, progress.cards);
  const learnedFromMistakes = ids.filter((id) => (progress.cards[id]?.wrong ?? 0) > 0 && isLearned(progress.cards[id])).length;
  root.append(
    h(
      "section",
      { class: "card narrow" },
      h("h2", null, "Chyby – kartičky"),
      h("p", { class: "muted" }, "Leitnerův systém: špatná odpověď vrací otázku do přihrádky 1, každá správná ji posune o přihrádku výš. V přihrádce 5 je otázka naučená. Přihrádka 2 se opakuje po 1 dni, 3 po 3 dnech, 4 po 7 dnech."),
      h(
        "div",
        { class: "boxes" },
        [1, 2, 3, 4, 5].map((b) => h("div", { class: `box b${b}` }, h("b", null, counts[b]), h("span", null, b === 5 ? "naučeno" : `přihrádka ${b}`))),
      ),
      h("p", null, `V balíčku chyb: ${plural(deck.length, "otázka", "otázky", "otázek")}, z toho k opakování teď ${due.length}. Naučeno z chyb: ${learnedFromMistakes}.`),
      h(
        "div",
        { class: "row" },
        h("a", { class: "btn primary big", href: "#/chyby?start=due", "aria-disabled": due.length ? null : "true" }, `Opakovat (${due.length})`),
        h("a", { class: "btn", href: "#/chyby?start=all" }, `Projít celý balíček (${deck.length})`),
      ),
    ),
  );
}

/* ================= Projeď všechno ================= */

export function walkAll(root: HTMLElement, ctx: Ctx, params: URLSearchParams) {
  const ids = [...ctx.qs].sort((a, b) => a.num - b.num).map((q) => q.id);
  const pos = progress.walk[ctx.cat.cat] ?? 0;
  const unseen = ids.filter((id) => !progress.cards[id] || progress.cards[id].right + progress.cards[id].wrong === 0).length;
  if (!params.get("start")) {
    root.append(
      h(
        "section",
        { class: "card narrow" },
        h("h2", null, "Projeď všechno"),
        h("p", { class: "muted" }, `Systematicky projdeš všech ${ids.length} otázek popořadě, aby tě u zkoušky nepřekvapila žádná, kterou jsi neviděl(a). Pozice se ukládá.`),
        h("div", { class: "progress big" }, h("span", { style: `width:${(Math.min(pos, ids.length) / ids.length) * 100}%` })),
        h("p", null, `Hotovo ${Math.min(pos, ids.length)} z ${ids.length}. Nikdy neviděných otázek: ${unseen}.`),
        h(
          "div",
          { class: "row" },
          pos < ids.length ? h("a", { class: "btn primary big", href: "#/vse?start=1" }, pos ? `Pokračovat od č. ${ctx.byId.get(ids[pos])!.num}` : "Začít") : h("p", null, "Máš projeto všechno. 🎉"),
          pos ? h("button", { class: "btn ghost", type: "button", onclick: () => { progress.walk[ctx.cat.cat] = 0; saveProgress(); ctx.rerender(); } }, "Začít znovu od 1") : null,
        ),
      ),
    );
    return;
  }
  const s = practiceSession({
    title: "Projeď všechno",
    ids,
    byId: ctx.byId,
    startAt: Math.min(pos, ids.length - 1),
    onPosition: (i) => {
      progress.walk[ctx.cat.cat] = Math.max(progress.walk[ctx.cat.cat] ?? 0, i);
      saveProgress();
    },
  });
  root.append(s.el);
  ctx.setKeys(s.key);
}

/* ================= Test nanečisto ================= */

export function exam(root: HTMLElement, ctx: Ctx, params: URLSearchParams) {
  const fmt = ctx.cat.exam;
  if (!params.get("start")) {
    root.append(
      h(
        "section",
        { class: "card narrow" },
        h("h2", null, "Test nanečisto"),
        h("ul", { class: "facts" }, h("li", null, h("b", null, fmt.count), " otázek"), h("li", null, h("b", null, fmt.minutes), " minut"), h("li", null, "k úspěchu ", h("b", null, `≥ ${fmt.pass}`), " správně")),
        h("p", { class: "muted" }, "Stejný formát jako u SPS. Otázky jsou vybrané ze všech okruhů v poměru jejich velikosti. Během testu neuvidíš, co je správně. Odpověď můžeš změnit, mezi otázkami se přepínáš čísly. Rozbor chyb bude na konci."),
        h("a", { class: "btn primary big", href: "#/test?start=1" }, "Začít test"),
      ),
    );
    return;
  }

  const qs = composeExam(ctx.qs, fmt.count);
  const opts: Option[][] = qs.map((q) => shuffledOptions(q));
  const chosen: number[] = qs.map(() => -1);
  let i = 0;
  const started = Date.now();
  let finished = false;

  const timer = h("span", { class: "timer", "aria-live": "off" });
  const dots = h("div", { class: "dots" });
  const body = h("div", { class: "exam-body" });
  const wrap = h("section", { class: "session exam" });
  root.append(wrap);

  const tick = () => {
    const left = fmt.minutes * 60 - Math.floor((Date.now() - started) / 1000);
    timer.textContent = "⏱ " + fmtTime(left);
    timer.classList.toggle("low", left <= 120);
    if (left <= 0) finish(true);
  };
  const iv = setInterval(tick, 1000);
  ctx.onLeave(() => clearInterval(iv));
  const beforeUnload = (e: BeforeUnloadEvent) => { if (!finished) e.preventDefault(); };
  addEventListener("beforeunload", beforeUnload);
  ctx.onLeave(() => removeEventListener("beforeunload", beforeUnload));

  let card: ReturnType<typeof questionCard>;
  function show() {
    clear(body);
    card = questionCard(qs[i], "exam", { options: opts[i], chosen: chosen[i], onChoose: (ci) => { chosen[i] = ci; renderDots(); } });
    body.append(
      card.el,
      h(
        "div",
        { class: "nav" },
        h("button", { class: "btn ghost", type: "button", disabled: i === 0, onclick: () => go(i - 1) }, "← Předchozí"),
        i + 1 < qs.length
          ? h("button", { class: "btn primary", type: "button", onclick: () => go(i + 1) }, "Další →")
          : h("button", { class: "btn primary", type: "button", onclick: () => confirmFinish() }, "Odevzdat test"),
      ),
    );
    renderDots();
  }
  function renderDots() {
    clear(dots);
    qs.forEach((_, j) =>
      dots.appendChild(
        h("button", { type: "button", class: "dot" + (j === i ? " current" : "") + (chosen[j] >= 0 ? " done" : ""), onclick: () => go(j), "aria-label": `Otázka ${j + 1}` }, j + 1),
      ),
    );
  }
  function go(j: number) {
    if (j < 0 || j >= qs.length) return;
    i = j;
    show();
  }
  function confirmFinish() {
    const missing = chosen.filter((c) => c < 0).length;
    if (missing && !confirm(`Nezodpovězeno: ${missing}. Opravdu odevzdat?`)) return;
    finish(false);
  }
  function finish(timeout: boolean) {
    if (finished) return;
    finished = true;
    clearInterval(iv);
    removeEventListener("beforeunload", beforeUnload);
    const answers: Record<string, boolean | undefined> = {};
    qs.forEach((q, j) => (answers[q.id] = chosen[j] >= 0 ? opts[j][chosen[j]].correct : undefined));
    const res = evaluateExam(qs, answers, fmt.pass);
    const seconds = Math.min(fmt.minutes * 60, Math.round((Date.now() - started) / 1000));
    const now = Date.now();
    qs.forEach((q) => { if (answers[q.id] !== undefined) progress.cards[q.id] = answerCard(progress.cards[q.id], answers[q.id]!, now); });
    progress.exams.push({ cat: ctx.cat.cat, date: now, correct: res.correct, total: res.total, passed: res.passed, seconds, wrongIds: res.wrongIds });
    saveProgress();
    ctx.setKeys(null);

    clear(wrap);
    wrap.append(
      h(
        "div",
        { class: "card result " + (res.passed ? "ok" : "bad") },
        h("h2", null, res.passed ? "Prospěl(a) ✔" : "Neprospěl(a) ✘"),
        h("p", { class: "big-score" }, `${res.correct} / ${res.total}`),
        h("p", null, `Potřeba ≥ ${fmt.pass}. Čas ${fmtTime(seconds)}${timeout ? " (vypršel čas)" : ""}. Nezodpovězeno: ${res.unanswered}.`),
        h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/test" }, "Nový test"), h("a", { class: "btn", href: "#/chyby" }, "Opakovat chyby"), h("a", { class: "btn ghost", href: "#/" }, "Přehled")),
      ),
      res.wrongIds.length ? h("h2", null, "Rozbor chyb") : h("p", null, "Bez jediné chyby! 🎉"),
      h("div", null, qs
        .map((q, j) => ({ q, j }))
        .filter(({ q }) => res.wrongIds.includes(q.id))
        .map(({ q, j }) => h("div", { class: "review-item" }, questionCard(q, "review", { options: opts[j], chosen: chosen[j] }).el))),
    );
    window.scrollTo({ top: 0 });
  }

  wrap.append(h("div", { class: "session-head sticky" }, h("h2", null, "Test nanečisto"), timer, h("button", { class: "btn small", type: "button", onclick: confirmFinish }, "Odevzdat")), dots, body);
  tick();
  show();
  ctx.setKeys((e) => {
    const k = e.key.toLowerCase();
    const idx = { a: 0, b: 1, c: 2, "1": 0, "2": 1, "3": 2 }[k];
    if (idx !== undefined) { card.choose(idx); e.preventDefault(); }
    else if (k === "enter" || k === "arrowright") { i + 1 < qs.length ? go(i + 1) : confirmFinish(); e.preventDefault(); }
    else if (k === "arrowleft") { go(i - 1); e.preventDefault(); }
  });
}

/* ================= Prohlížení ================= */

export function browse(root: HTMLElement, ctx: Ctx, params: URLSearchParams) {
  let query = params.get("q") ?? "";
  let set = params.get("set") ?? "";
  let limit = 40;
  const list = h("div", { class: "browse-list" });
  const info = h("p", { class: "muted" });
  const input = h("input", {
    class: "input",
    type: "search",
    placeholder: "Hledat v otázkách, odpovědích i vysvětleních… (např. „vlajka A“ nebo číslo)",
    value: query,
    "aria-label": "Hledat",
    oninput: (e: Event) => { query = (e.target as HTMLInputElement).value; limit = 40; render(); },
  }) as HTMLInputElement;

  function render() {
    const res = search(ctx.qs.filter((q) => !set || q.set === set), query);
    info.textContent = `Nalezeno: ${res.length}`;
    clear(list);
    for (const q of res.slice(0, limit)) list.appendChild(browseItem(q));
    if (res.length > limit) list.appendChild(h("button", { class: "btn ghost wide", type: "button", onclick: () => { limit += 60; render(); } }, `Zobrazit další (${res.length - limit})`));
  }
  root.append(
    h("section", { class: "card" }, h("h2", null, "Prohlížení sady"), h("div", { class: "row filters" }, input, topicSelect(ctx.qs, set, (v) => { set = v; limit = 40; render(); })), info),
    list,
  );
  render();
  setTimeout(() => input.focus({ preventScroll: true }), 0);
}

function browseItem(q: Question) {
  const c = progress.cards[q.id];
  return h(
    "article",
    { class: "card browse-item" },
    questionHead(q),
    c ? h("span", { class: "stat-chip" }, `✔ ${c.right} ✘ ${c.wrong} · přihr. ${c.box}`) : null,
    questionBody(q),
    h("p", { class: "answer-ok" }, "✔ ", q.correct),
    h("details", null, h("summary", null, "Špatné možnosti a vysvětlení"), h("ul", { class: "answer-bad" }, q.wrong.map((w) => h("li", null, "✘ ", w))), explanationBox(q)),
  );
}

export type View = (root: HTMLElement, ctx: Ctx, params: URLSearchParams) => void | Session;

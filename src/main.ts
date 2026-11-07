import "./style.css";
import { h, clear } from "./dom";
import type { CategoryIndex, Question } from "./logic";
import { settings, saveSettings, requestPersistence } from "./store";
import { overview, practice, mistakes, walkAll, exam, browse, applyTheme, type Ctx } from "./views";
import { installBanner } from "./install";

const ROUTES = {
  "": { label: "Přehled", icon: "🏠", view: overview },
  procvicovani: { label: "Procvičování", icon: "✍️", view: practice },
  test: { label: "Test", icon: "⏱", view: exam },
  chyby: { label: "Chyby", icon: "🔁", view: mistakes },
  prohlizeni: { label: "Prohlížení", icon: "🔎", view: browse },
  vse: { label: "Projeď vše", icon: "📚", view: walkAll },
} as const;
type Route = keyof typeof ROUTES;

const app = document.getElementById("app")!;
let index: CategoryIndex[] = [];
const cache = new Map<string, Question[]>();
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let leaveFns: (() => void)[] = [];

async function loadJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function loadCat(cat: string) {
  if (!cache.has(cat)) cache.set(cat, await loadJson<Question[]>(`data/${cat}.json`));
  return cache.get(cat)!;
}

function parseHash(): { route: Route; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const route = (path in ROUTES ? path : "") as Route;
  return { route, params: new URLSearchParams(qs ?? "") };
}

async function render() {
  leaveFns.forEach((f) => f());
  leaveFns = [];
  keyHandler = null;

  const { route, params } = parseHash();
  const cat = index.find((c) => c.cat === settings.cat) ?? index[0];
  const qs = await loadCat(cat.cat);
  const ctx: Ctx = {
    cat,
    qs,
    byId: new Map(qs.map((q) => [q.id, q])),
    setKeys: (fn) => (keyHandler = fn),
    onLeave: (fn) => leaveFns.push(fn),
    rerender: () => void render(),
  };

  clear(app);
  const main = h("main", { class: "main", id: "main" });
  app.append(header(route), installBanner() ?? document.createComment(""), main, footerNav(route));
  ROUTES[route].view(main, ctx, params);
  window.scrollTo({ top: 0 });
  document.title = `${ROUTES[route].label} · VMP trenažér`;
}

function header(route: Route) {
  return h(
    "header",
    { class: "top" },
    h("a", { class: "brand", href: "#/" }, h("img", { src: "icons/icon-192.png", alt: "", width: 28, height: 28 }), h("span", null, "VMP trenažér")),
    h("nav", { class: "tabs", "aria-label": "Hlavní" }, navLinks(route)),
    index.length > 1
      ? h(
          "select",
          { class: "input cat-select", "aria-label": "Kategorie", onchange: (e: Event) => { saveSettings({ cat: (e.target as HTMLSelectElement).value }); void render(); } },
          index.map((c) => h("option", { value: c.cat, selected: c.cat === settings.cat }, c.cat.toUpperCase())),
        )
      : h("span", { class: "cat-pill", title: index[0]?.title }, index[0]?.cat.toUpperCase()),
  );
}

const navLinks = (route: Route) =>
  (Object.keys(ROUTES) as Route[]).map((r) =>
    h("a", { href: `#/${r}`, class: r === route ? "active" : "", "aria-current": r === route ? "page" : null }, h("span", { class: "ico", "aria-hidden": "true" }, ROUTES[r].icon), h("span", { class: "lbl" }, ROUTES[r].label)),
  );

const footerNav = (route: Route) => h("nav", { class: "bottom-tabs", "aria-label": "Hlavní (mobil)" }, navLinks(route));

addEventListener("keydown", (e) => {
  if (!keyHandler || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select")) return;
  // Enter na tlačítku necháme prohlížeči (aktivace tlačítka), jinak by se akce provedla 2×
  if (e.key === "Enter" && t.tagName === "BUTTON") return;
  keyHandler(e);
});
addEventListener("hashchange", () => void render());

async function start() {
  applyTheme();
  try {
    index = await loadJson<CategoryIndex[]>("data/index.json");
    if (!index.length) throw new Error("Žádná data. Spusť npm run parse.");
    await render();
    void requestPersistence();
  } catch (e) {
    clear(app);
    app.append(h("div", { class: "card narrow" }, h("h2", null, "Nepodařilo se načíst otázky"), h("p", null, (e as Error).message)));
  }
}

void start();

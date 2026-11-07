import { h } from "./dom";
import { settings, saveSettings } from "./store";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
});

const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const WEEK = 7 * 86_400_000;

/**
 * Výzva k instalaci. Na iPadu/iPhonu je důležitá: Safari maže data webu,
 * který se 7 dní nepoužil – nainstalovaná aplikace na ploše tohle omezení nemá.
 */
export function installBanner(): HTMLElement | null {
  if (isStandalone()) return null;
  if (Date.now() - settings.installHintDismissed < WEEK) return null;
  const dismiss = () => {
    saveSettings({ installHintDismissed: Date.now() });
    banner.remove();
  };
  const banner = h(
    "aside",
    { class: "install", role: "note" },
    isIOS()
      ? h("p", null, h("b", null, "Přidej si trenažér na plochu: "), "Sdílet ", h("span", { class: "share-ico", "aria-label": "ikona Sdílet" }, "⬆︎"), " → „Přidat na plochu“. Bude fungovat offline a Safari ti nesmaže postup (web nepoužitý 7 dní maže).")
      : h("p", null, h("b", null, "Nainstaluj si trenažér"), " – funguje offline jako aplikace a postup zůstane uložený."),
    h(
      "div",
      { class: "row" },
      !isIOS() && deferred
        ? h("button", { class: "btn primary small", type: "button", onclick: async () => { await deferred?.prompt(); deferred = null; dismiss(); } }, "Instalovat")
        : null,
      h("button", { class: "btn ghost small", type: "button", onclick: dismiss }, "Teď ne"),
    ),
  );
  return banner;
}

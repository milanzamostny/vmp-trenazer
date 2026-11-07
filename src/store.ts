import { answerCard, emptyProgress, mergeProgress, parseProgress, type Progress } from "./logic";

const KEY = "vmp-trenazer.progress.v1";
const SETTINGS_KEY = "vmp-trenazer.settings.v1";

export interface Settings {
  theme: "auto" | "light" | "dark";
  cat: string;
  installHintDismissed: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* plné úložiště nebo soukromé okno – postup zůstane jen v paměti */
  }
}

export let progress: Progress = read(KEY, emptyProgress());
export let settings: Settings = read(SETTINGS_KEY, { theme: "auto", cat: "m", installHintDismissed: 0 });

export function saveProgress() {
  progress.updated = Date.now();
  write(KEY, progress);
}

export function saveSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  write(SETTINGS_KEY, settings);
}

export function recordAnswer(id: string, correct: boolean) {
  progress.cards[id] = answerCard(progress.cards[id], correct);
  saveProgress();
}

export function exportProgress(): Blob {
  return new Blob([JSON.stringify(progress, null, 1)], { type: "application/json" });
}

export function importProgress(json: string, mode: "merge" | "replace") {
  const incoming = parseProgress(json);
  progress = mode === "merge" ? mergeProgress(progress, incoming) : incoming;
  saveProgress();
}

export function resetProgress() {
  progress = emptyProgress();
  saveProgress();
}

/** Požádá prohlížeč, aby data nemazal (Safari/Chrome to zohlední u nainstalované PWA). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

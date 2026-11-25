export type ThemeMode = "light" | "dark" | "auto";
const KEY = "app-theme-mode";
/** Auto mode: dark from 19:00 to 06:59, light otherwise. */
export const AUTO_DARK_FROM = 19;
export const AUTO_LIGHT_FROM = 7;

export function isDarkAt(hour: number): boolean {
  return hour >= AUTO_DARK_FROM || hour < AUTO_LIGHT_FROM;
}
export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "dark";
}
export function resolveDark(mode: ThemeMode, now = new Date()): boolean {
  return mode === "auto" ? isDarkAt(now.getHours()) : mode === "dark";
}
export function applyTheme(mode = getThemeMode()) {
  document.documentElement.classList.toggle("dark", resolveDark(mode));
}
export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new Event("app-theme-change"));
}
let timer: number | undefined;
export function initTheme() {
  applyTheme();
  if (timer) clearInterval(timer);
  timer = window.setInterval(() => { if (getThemeMode() === "auto") applyTheme("auto"); }, 60_000);
}

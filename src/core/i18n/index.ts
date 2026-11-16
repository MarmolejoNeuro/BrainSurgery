import { en, type I18nKey } from './en';
import { es } from './es';

export type Lang = 'en' | 'es';
export type { I18nKey };

const dicts: Record<Lang, Record<I18nKey, string>> = { en, es };
const LANG_KEY = 'icpc-sim.lang';
/** Remembered between visits (and across a case switch, which reloads the page). */
let lang: Lang = (() => {
  try {
    return localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
})();
const listeners = new Set<(l: Lang) => void>();

export function t(key: I18nKey): string {
  return dicts[lang][key] ?? key;
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* storage blocked */
  }
  document.documentElement.lang = l;
  applyDom();
  listeners.forEach((fn) => fn(l));
}

export function toggleLang(): void {
  setLang(lang === 'en' ? 'es' : 'en');
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-translate every element carrying a data-i18n attribute. */
export function applyDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
}

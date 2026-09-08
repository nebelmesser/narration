export const LOCALE_STORAGE_KEY = 'playground.locale';
export const SOUND_STORAGE_KEY = 'playground.narration.sound';

export function readSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === 'off') return false;
    if (raw === 'on') return true;
  } catch {
    /* ignore quota / private mode */
  }
  return true;
}

export function persistSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* ignore quota / private mode */
  }
}

export function localeFromNavigator(language: string): string {
  const trimmed = language.trim().toLowerCase();
  const dash = trimmed.indexOf('-');
  return dash === -1 ? trimmed : trimmed.slice(0, dash);
}

export function pickLocale(available: string[], sourceLang: string, search = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fromUrl = params.get('lang')?.trim().toLowerCase();
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const fromNav = typeof navigator !== 'undefined' ? localeFromNavigator(navigator.language || '') : '';
  for (const candidate of [fromUrl, stored, fromNav, sourceLang]) {
    if (candidate && available.includes(candidate)) return candidate;
  }
  return available[0] ?? sourceLang;
}

export function persistLocale(locale: string, replaceUrl = true): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore quota / private mode */
  }
  if (!replaceUrl || typeof history === 'undefined' || typeof location === 'undefined') return;
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  history.replaceState(history.state, '', url);
}

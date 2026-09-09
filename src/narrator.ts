import { cueBecameTrue, cueMatches } from './match.ts';
import { pickLocale, persistLocale, persistSoundEnabled, readSoundEnabled } from './locale.ts';
import { mountOverlay, type OverlayHandles } from './overlay.ts';
import { KvStore } from './store.ts';
import { spokenText } from './spoken.ts';
import { cueEvent, type CueAction, type CueDef, type Manifest, type MountOptions, type NarratorEventHandler, type StoreValue } from './types.ts';

export type Narrator = {
  readonly store: KvStore;
  emit(name: string): void;
  on(name: string, handler: NarratorEventHandler): () => void;
  off(name: string, handler: NarratorEventHandler): void;
  setLocale(locale: string): void;
  setUi(ui: { enableSound?: string }): void;
  reset(): void;
  destroy(): void;
};

type PlayState = {
  cue: CueDef;
  timer: number;
  audio: HTMLAudioElement | null;
};

function textDurationMs(text: string): number {
  return Math.min(12_000, Math.max(2_500, text.length * 60));
}

function fireActions(
  actions: CueAction[] | undefined,
  emit: (name: string, payload: Record<string, StoreValue | undefined>) => void,
): void {
  if (!actions) return;
  for (const action of actions) {
    const payload: Record<string, StoreValue | undefined> = { ...action };
    delete payload.emit;
    const dash = action.emit.lastIndexOf('-');
    if (dash > 0 && payload.target === undefined) {
      payload.target = action.emit.slice(0, dash);
    }
    emit(action.emit, payload);
    if (dash > 0) emit(action.emit.slice(dash + 1), payload);
  }
}

function resolveText(cue: CueDef, locale: string, sourceLang: string): string {
  const raw = cue.text[locale] || cue.text[sourceLang] || Object.values(cue.text)[0] || '';
  return spokenText(raw);
}

function resolveAudio(cue: CueDef, locale: string, sourceLang: string, base: URL): string | undefined {
  const rel = cue.audio[locale] || cue.audio[sourceLang];
  if (!rel) return undefined;
  return new URL(rel, base).href;
}

export async function mountNarrator(options: MountOptions = {}): Promise<Narrator> {
  const manifestUrl = new URL(
    options.manifestUrl?.toString() ?? 'narration/manifest.json',
    document.baseURI,
  );
  const store = new KvStore();
  const handlers = new Map<string, Set<NarratorEventHandler>>();
  const queue: CueDef[] = [];
  const played = new Set<string>();
  let playing: PlayState | null = null;
  let locale = '';
  let muted = !readSoundEnabled();
  let unlocked = false;
  let overlay: OverlayHandles | null = null;
  let manifest: Manifest = { source_lang: 'en', locales: ['en'], cues: [] };

  const emitOut = (name: string, payload: Record<string, StoreValue | undefined>): void => {
    const set = handlers.get(name);
    if (!set) return;
    for (const handler of set) handler(payload);
  };

  const hasEvent = (event: string): boolean => (
    (playing !== null && cueEvent(playing.cue) === event)
    || queue.some((cue) => cueEvent(cue) === event)
  );

  const onceDone = (cue: CueDef): boolean => Boolean(cue.once) && played.has(cueEvent(cue));

  const drain = (): void => {
    if (playing) return;
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      if (onceDone(next)) continue;
      if (!cueMatches(store.snapshot(), next.when, next.unless)) continue;
      startCue(next);
      return;
    }
  };

  const enqueue = (cue: CueDef): void => {
    if (hasEvent(cueEvent(cue)) || onceDone(cue)) return;
    if (!cueMatches(store.snapshot(), cue.when, cue.unless)) return;
    queue.push(cue);
    drain();
  };

  const stopAudio = (el: HTMLAudioElement | null): void => {
    if (!el) return;
    el.onended = null;
    el.onerror = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
  };

  const finishPlay = (): void => {
    if (!playing) return;
    const done = playing;
    if (done.timer) window.clearTimeout(done.timer);
    stopAudio(done.audio);
    fireActions(done.cue.finally, emitOut);
    playing = null;
    overlay?.setText('');
    drain();
  };

  const stopPlayback = (): void => {
    if (!playing) return;
    if (playing.timer) window.clearTimeout(playing.timer);
    stopAudio(playing.audio);
    fireActions(playing.cue.finally, emitOut);
    playing = null;
    overlay?.setText('');
  };

  const armTimer = (state: PlayState, ms: number): void => {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      if (playing === state) finishPlay();
    }, ms);
  };

  const playCurrentAudio = (fromStart = false): void => {
    if (!playing || !overlay) return;
    const text = resolveText(playing.cue, locale, manifest.source_lang);
    const audioUrl = resolveAudio(playing.cue, locale, manifest.source_lang, manifestUrl);
    if (muted || !audioUrl) {
      armTimer(playing, textDurationMs(text));
      return;
    }
    if (playing.timer) {
      window.clearTimeout(playing.timer);
      playing.timer = 0;
    }
    const audio = overlay.audio;
    const state = playing;
    playing.audio = audio;
    const sameSrc = audio.currentSrc === audioUrl || audio.src === audioUrl;
    if (!sameSrc || audio.ended || fromStart) {
      audio.onended = null;
      audio.onerror = null;
      if (fromStart && sameSrc && !audio.ended) {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch {
          audio.src = audioUrl;
        }
      } else {
        audio.src = audioUrl;
      }
    }
    audio.onended = () => {
      if (playing === state) finishPlay();
    };
    audio.onerror = () => {
      if (playing === state) armTimer(state, textDurationMs(text));
    };
    void audio.play().then(() => {
      unlocked = true;
      overlay?.setLocked(false);
    }).catch(() => {
      unlocked = false;
      overlay?.setLocked(true);
    });
  };

  const setMutedPref = (next: boolean): void => {
    muted = next;
    persistSoundEnabled(!muted);
    overlay?.setMuted(muted);
  };

  const unlockPlayback = (): void => {
    unlocked = true;
    if (!muted) playCurrentAudio();
  };

  const enableSound = (): void => {
    setMutedPref(false);
    unlocked = true;
    playCurrentAudio(true);
  };

  const startCue = (cue: CueDef): void => {
    if (onceDone(cue)) return;
    if (!cueMatches(store.snapshot(), cue.when, cue.unless)) return;
    if (cue.once) played.add(cueEvent(cue));
    if (cue.set) store.patch(cue.set);
    fireActions(cue.at_start, emitOut);
    const text = resolveText(cue, locale, manifest.source_lang);
    overlay?.setText(text);
    if (playing?.timer) window.clearTimeout(playing.timer);
    playing = { cue, timer: 0, audio: null };
    playCurrentAudio();
  };

  const applyLocale = (next: string, persist: boolean): void => {
    if (!manifest.locales.includes(next)) return;
    const changed = locale !== next;
    locale = next;
    overlay?.setLocales(manifest.locales, locale, manifest.locale_names);
    if (persist) persistLocale(locale);
    if (changed && playing) {
      overlay?.setText(resolveText(playing.cue, locale, manifest.source_lang));
      playCurrentAudio(true);
    }
  };

  try {
    const response = await fetch(manifestUrl);
    if (response.ok) {
      manifest = (await response.json()) as Manifest;
    } else {
      console.warn(`[narration] missing manifest at ${manifestUrl.href}`);
    }
  } catch (error) {
    console.warn('[narration] failed to load manifest', error);
  }

  locale = pickLocale(manifest.locales, manifest.source_lang, location.search);
  persistLocale(locale);

  overlay = mountOverlay({
    enableSoundLabel: options.ui?.enableSound,
    onMute() {
      setMutedPref(!muted);
      if (muted) playing?.audio?.pause();
      else enableSound();
    },
    onUnlock() {
      enableSound();
    },
    onLocale(next) {
      applyLocale(next, true);
    },
  });
  overlay.setLocales(manifest.locales, locale, manifest.locale_names);
  persistSoundEnabled(!muted);
  overlay.setMuted(muted);
  overlay.setLocked(!unlocked);

  const onFirstGesture = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('#narration-locale, .narration-sound')) return;
    unlockPlayback();
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
  };
  window.addEventListener('pointerdown', onFirstGesture, true);
  window.addEventListener('keydown', onFirstGesture, true);

  const stopStore = store.subscribe((prev, next) => {
    for (const cue of manifest.cues) {
      if (!cue.when && !cue.unless) continue;
      if (cueBecameTrue(prev, next, cue.when, cue.unless)) enqueue(cue);
    }
  });

  const pageOrigin = performance.now();
  let lastPageSec = 0;
  const pageTimer = window.setInterval(() => {
    const sec = Math.max(0, Math.floor((performance.now() - pageOrigin) / 1000));
    if (sec <= lastPageSec) return;
    const until = Math.min(sec, lastPageSec + 120);
    for (let n = lastPageSec + 1; n <= until; n++) store.set('page_sec', n);
    lastPageSec = until;
  }, 250);

  const api: Narrator = {
    store,
    emit(name: string) {
      for (const cue of manifest.cues) {
        if (cueEvent(cue) === name) enqueue(cue);
      }
    },
    on(name: string, handler: NarratorEventHandler) {
      let set = handlers.get(name);
      if (!set) {
        set = new Set();
        handlers.set(name, set);
      }
      set.add(handler);
      return () => api.off(name, handler);
    },
    off(name: string, handler: NarratorEventHandler) {
      handlers.get(name)?.delete(handler);
    },
    setLocale(next: string) {
      applyLocale(next, true);
    },
    setUi(ui) {
      if (ui.enableSound) overlay?.setEnableSoundLabel(ui.enableSound);
    },
    reset() {
      stopPlayback();
      queue.length = 0;
      played.clear();
    },
    destroy() {
      window.clearInterval(pageTimer);
      stopStore();
      if (playing) {
        if (playing.timer) window.clearTimeout(playing.timer);
        playing.audio?.pause();
        playing = null;
      }
      queue.length = 0;
      overlay?.destroy();
      overlay = null;
      window.removeEventListener('pointerdown', onFirstGesture, true);
      window.removeEventListener('keydown', onFirstGesture, true);
    },
  };

  return api;
}

function resolveTarget(map: Record<string, string | HTMLElement>, token: string): HTMLElement | null {
  const mapped = map[token];
  if (mapped instanceof HTMLElement) return mapped;
  const el = document.querySelector(typeof mapped === 'string' ? mapped : `#${CSS.escape(token)}`);
  return el instanceof HTMLElement ? el : null;
}

export function bindHighlight(map: Record<string, string | HTMLElement> = {}): NarratorEventHandler {
  return (payload) => {
    const token = payload.target;
    if (typeof token !== 'string') return;
    resolveTarget(map, token)?.classList.add('is-narrate-on');
  };
}

export function bindUnhighlight(map: Record<string, string | HTMLElement> = {}): NarratorEventHandler {
  return (payload) => {
    const token = payload.target;
    if (typeof token !== 'string') return;
    resolveTarget(map, token)?.classList.remove('is-narrate-on');
  };
}

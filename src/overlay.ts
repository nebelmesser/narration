const STYLE_ID = 'narration-overlay-style';

const CSS = `
#narration-overlay {
  position: fixed;
  left: 0;
  right: 0;
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: min(42rem, calc(100vw - 32px));
  margin: 0 auto;
  pointer-events: none;
  font-family: system-ui, sans-serif;
}
#narration-overlay.is-empty .narration-line {
  display: none;
}
.narration-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(8, 8, 8, 0.82);
  color: #f2f2f2;
  font-size: 15px;
  line-height: 1.35;
  pointer-events: none;
}
.narration-text {
  flex: 1;
  margin: 0;
  text-align: center;
}
.narration-sound {
  flex-shrink: 0;
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: #f2f2f2;
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  pointer-events: auto;
  white-space: nowrap;
}
.narration-sound[hidden] {
  display: none;
}
#narration-locale {
  appearance: none;
  position: fixed;
  top: max(var(--ctrl-inset, 12px), env(safe-area-inset-top));
  right: calc(max(var(--ctrl-inset, 12px), env(safe-area-inset-right)) + var(--ctrl-size, 36px) + var(--ctrl-gap, 10px));
  z-index: 6;
  height: var(--ctrl-size, 36px);
  padding: 0 10px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.28));
  border-radius: var(--ctrl-radius, 8px);
  background: var(--panel, rgba(12, 12, 12, 0.78));
  color: var(--fg, #eee);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  pointer-events: auto;
}
#narration-overlay audio {
  display: none;
}
`;

export type OverlayHandles = {
  root: HTMLElement;
  audio: HTMLAudioElement;
  setText(text: string): void;
  setMuted(muted: boolean): void;
  setLocked(locked: boolean): void;
  setEnableSoundLabel(label: string): void;
  setLocales(locales: string[], current: string, names?: Record<string, string>): void;
  destroy(): void;
};

export function mountOverlay(options: {
  onMute(): void;
  onUnlock(): void;
  onLocale(locale: string): void;
  enableSoundLabel?: string;
}): OverlayHandles {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }

  const root = document.createElement('div');
  root.id = 'narration-overlay';
  root.className = 'is-empty';

  const line = document.createElement('div');
  line.className = 'narration-line';

  const text = document.createElement('p');
  text.className = 'narration-text';
  text.setAttribute('aria-live', 'polite');

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'narration-sound';
  let enableSoundLabel = options.enableSoundLabel || 'Enable sound';
  mute.textContent = enableSoundLabel;
  mute.setAttribute('aria-label', enableSoundLabel);

  const existingLocale = document.getElementById('narration-locale');
  const ownedLocale = !(existingLocale instanceof HTMLSelectElement);
  const locale = existingLocale instanceof HTMLSelectElement
    ? existingLocale
    : document.createElement('select');
  if (ownedLocale) {
    locale.id = 'narration-locale';
    locale.setAttribute('aria-label', 'Language');
    locale.setAttribute('data-viewer-ui', '');
  }

  const audio = document.createElement('audio');
  audio.setAttribute('aria-hidden', 'true');
  audio.preload = 'auto';

  line.append(text, mute);
  root.append(line, audio);
  document.body.append(root);
  if (ownedLocale) document.body.append(locale);

  const syncSoundButton = (): void => {
    const show = mute.dataset.muted === '1' || mute.dataset.locked === '1';
    mute.hidden = !show;
    mute.textContent = enableSoundLabel;
    mute.setAttribute('aria-label', enableSoundLabel);
  };

  mute.addEventListener('click', () => {
    if (mute.dataset.locked === '1' || mute.dataset.muted === '1') options.onUnlock();
    else options.onMute();
  });
  if (ownedLocale) {
    locale.addEventListener('change', () => options.onLocale(locale.value));
  }

  return {
    root,
    audio,
    setText(next: string) {
      text.textContent = next;
      root.classList.toggle('is-empty', !next);
    },
    setMuted(muted: boolean) {
      mute.dataset.muted = muted ? '1' : '0';
      syncSoundButton();
    },
    setLocked(locked: boolean) {
      mute.dataset.locked = locked ? '1' : '0';
      syncSoundButton();
    },
    setEnableSoundLabel(label: string) {
      enableSoundLabel = label;
      syncSoundButton();
    },
    setLocales(locales: string[], current: string, names: Record<string, string> = {}) {
      if (ownedLocale) {
        locale.replaceChildren();
        for (const code of locales) {
          const option = document.createElement('option');
          option.value = code;
          option.textContent = names[code] || code;
          option.selected = code === current;
          locale.append(option);
        }
      }
      locale.value = current;
      syncSoundButton();
    },
    destroy() {
      root.remove();
      if (ownedLocale) locale.remove();
    },
  };
}

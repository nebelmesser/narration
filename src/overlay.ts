const STYLE_ID = 'narration-overlay-style';

const CSS = `
#narration-overlay {
  position: fixed;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: min(42rem, calc(100vw - 32px));
  pointer-events: none;
  font-family: system-ui, sans-serif;
}
#narration-overlay.is-empty .narration-line {
  display: none;
}
.narration-line {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(8, 8, 8, 0.82);
  color: #f2f2f2;
  font-size: 15px;
  line-height: 1.35;
  text-align: center;
  pointer-events: none;
}
.narration-chrome {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  pointer-events: auto;
}
.narration-chrome button,
.narration-chrome select {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(12, 12, 12, 0.78);
  color: #eee;
  border-radius: 8px;
  padding: 4px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.narration-chrome button.is-on {
  border-color: #8ec5ff;
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
  setLocales(locales: string[], current: string): void;
  destroy(): void;
};

export function mountOverlay(options: {
  onMute(): void;
  onUnlock(): void;
  onLocale(locale: string): void;
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

  const line = document.createElement('p');
  line.className = 'narration-line';
  line.setAttribute('aria-live', 'polite');

  const chrome = document.createElement('div');
  chrome.className = 'narration-chrome';

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.textContent = 'Sound off';
  mute.setAttribute('aria-label', 'Toggle narration sound');

  const locale = document.createElement('select');
  locale.setAttribute('aria-label', 'Narration language');

  const audio = document.createElement('audio');
  audio.setAttribute('aria-hidden', 'true');
  audio.preload = 'auto';

  chrome.append(mute, locale);
  root.append(line, chrome, audio);
  document.body.append(root);

  mute.addEventListener('click', () => {
    if (mute.dataset.locked === '1') options.onUnlock();
    else options.onMute();
  });
  locale.addEventListener('change', () => options.onLocale(locale.value));

  return {
    root,
    audio,
    setText(text: string) {
      line.textContent = text;
      root.classList.toggle('is-empty', !text);
    },
    setMuted(muted: boolean) {
      mute.dataset.muted = muted ? '1' : '0';
      if (mute.dataset.locked === '1') return;
      mute.textContent = muted ? 'Sound off' : 'Sound on';
      mute.classList.toggle('is-on', !muted);
    },
    setLocked(locked: boolean) {
      mute.dataset.locked = locked ? '1' : '0';
      if (locked) {
        mute.textContent = 'Enable sound';
        mute.classList.remove('is-on');
        return;
      }
      mute.textContent = mute.dataset.muted === '1' ? 'Sound off' : 'Sound on';
      mute.classList.toggle('is-on', mute.dataset.muted !== '1');
    },
    setLocales(locales: string[], current: string) {
      locale.replaceChildren();
      for (const code of locales) {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = code;
        option.selected = code === current;
        locale.append(option);
      }
      locale.value = current;
    },
    destroy() {
      root.remove();
    },
  };
}

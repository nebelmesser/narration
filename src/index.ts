export { bindHighlight, bindUnhighlight, mountNarrator, type Narrator } from './narrator.ts';
export { KvStore } from './store.ts';
export {
  LOCALE_STORAGE_KEY,
  SOUND_STORAGE_KEY,
  persistLocale,
  persistSoundEnabled,
  pickLocale,
  readSoundEnabled,
} from './locale.ts';
export { cueBecameTrue, cueMatches } from './match.ts';
export { cueEvent } from './types.ts';
export type {
  CueAction,
  CueDef,
  Manifest,
  MountOptions,
  NarrationUi,
  NarratorEventHandler,
  StoreSnapshot,
  StoreValue,
} from './types.ts';

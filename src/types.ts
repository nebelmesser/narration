export type StoreValue = string | number | boolean;
export type StoreSnapshot = Record<string, StoreValue>;

export type CompareCond = {
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
};

export type WhenValue = StoreValue | CompareCond;
export type WhenSnapshot = Record<string, WhenValue>;

export type CueAction = {
  emit: string;
  [key: string]: StoreValue | undefined;
};

export type CueDef = {
  on?: string;
  once?: string;
  when?: WhenSnapshot;
  unless?: WhenSnapshot;
  text: Record<string, string>;
  audio: Record<string, string | undefined>;
  at_start?: CueAction[];
  finally?: CueAction[];
  set?: StoreSnapshot;
};

export function cueEvent(cue: { on?: string; once?: string }): string {
  return cue.once || cue.on || '';
}

export type Manifest = {
  source_lang: string;
  locales: string[];
  locale_names?: Record<string, string>;
  cues: CueDef[];
};

export type NarratorEventHandler = (payload: Record<string, StoreValue | undefined>) => void;

export type NarrationUi = {
  enableSound?: string;
};

export type MountOptions = {
  manifestUrl?: string | URL;
  ui?: NarrationUi;
};

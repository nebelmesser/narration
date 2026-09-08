export type StoreValue = string | number | boolean;
export type StoreSnapshot = Record<string, StoreValue>;

export type CueAction = {
  emit: string;
  [key: string]: StoreValue | undefined;
};

export type CueOn = {
  event?: string;
};

export type CueDef = {
  id: string;
  on?: CueOn;
  when?: StoreSnapshot;
  unless?: StoreSnapshot;
  play_once?: boolean;
  text: Record<string, string>;
  audio: Record<string, string | undefined>;
  at_start?: CueAction[];
  finally?: CueAction[];
  set?: StoreSnapshot;
};

export type Manifest = {
  source_lang: string;
  locales: string[];
  cues: CueDef[];
};

export type NarratorEventHandler = (payload: Record<string, StoreValue | undefined>) => void;

export type MountOptions = {
  manifestUrl?: string | URL;
};

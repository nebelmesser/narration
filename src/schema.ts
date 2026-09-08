import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import type { CueAction, StoreSnapshot, StoreValue } from './types.ts';

export type ProjectConfig = {
  source_lang: string;
  locales: string[];
  openrouter: {
    translate_model: string;
    tts_model: string;
    voices: Record<string, string>;
  };
};

export type ScenarioCue = {
  id: string;
  on?: { event?: string };
  when?: StoreSnapshot;
  unless?: StoreSnapshot;
  play_once?: boolean;
  text: string;
  at_start?: CueAction[];
  finally?: CueAction[];
  set?: StoreSnapshot;
};

export type ScenarioFile = {
  cues: ScenarioCue[];
};

function asStore(value: unknown): StoreSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: StoreSnapshot = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      out[key] = item;
    }
  }
  return out;
}

function asAction(item: unknown): CueAction | undefined {
  if (typeof item === 'string') {
    const emit = item.trim();
    return emit ? { emit } : undefined;
  }
  if (!item || typeof item !== 'object' || typeof (item as { emit?: unknown }).emit !== 'string') return undefined;
  const action: CueAction = { emit: (item as { emit: string }).emit };
  for (const [key, field] of Object.entries(item as Record<string, unknown>)) {
    if (key === 'emit' || key === 'target') continue;
    if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
      action[key] = field as StoreValue;
    }
  }
  return action;
}

function asActions(value: unknown): CueAction[] | undefined {
  if (typeof value === 'string') {
    const action = asAction(value);
    return action ? [action] : undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const out: CueAction[] = [];
  for (const item of value) {
    const action = asAction(item);
    if (action) out.push(action);
  }
  return out.length ? out : undefined;
}

export function parseConfig(raw: string): ProjectConfig {
  const data = YAML.parse(raw) as Record<string, unknown>;
  const locales = Array.isArray(data.locales) ? data.locales.map(String) : ['ru'];
  const openrouter = (data.openrouter ?? {}) as Record<string, unknown>;
  const voices = (openrouter.voices ?? {}) as Record<string, string>;
  return {
    source_lang: String(data.source_lang ?? 'ru'),
    locales,
    openrouter: {
      translate_model: String(openrouter.translate_model ?? 'anthropic/claude-sonnet-4'),
      tts_model: String(openrouter.tts_model ?? 'openai/gpt-4o-mini-tts-2025-12-15'),
      voices,
    },
  };
}

export function parseScenario(raw: string): ScenarioFile {
  const data = YAML.parse(raw) as Record<string, unknown>;
  const cuesRaw = Array.isArray(data.cues) ? data.cues : [];
  const cues: ScenarioCue[] = [];
  for (const item of cuesRaw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.text !== 'string') continue;
    const on = row.on && typeof row.on === 'object' && !Array.isArray(row.on)
      ? { event: typeof (row.on as { event?: unknown }).event === 'string' ? (row.on as { event: string }).event : undefined }
      : undefined;
    cues.push({
      id: row.id,
      on,
      when: asStore(row.when),
      unless: asStore(row.unless),
      play_once: row.play_once === true ? true : undefined,
      text: row.text,
      at_start: asActions(row.at_start),
      finally: asActions(row.finally),
      set: asStore(row.set),
    });
  }
  return { cues };
}

export function readYamlFile<T>(path: string, parse: (raw: string) => T): T {
  return parse(readFileSync(path, 'utf8'));
}

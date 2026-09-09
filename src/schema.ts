import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import type { CueAction, StoreSnapshot, StoreValue, WhenSnapshot, WhenValue } from './types.ts';

export type ProjectConfig = {
  source_lang: string;
  locales: string[];
  locale_names: Record<string, string>;
  openrouter: {
    translate_model: string;
    tts_model: string;
    voices: Record<string, string>;
  };
};

export type ScenarioCue = {
  on?: string;
  once?: string;
  when?: WhenSnapshot;
  unless?: WhenSnapshot;
  text: string;
  at_start?: CueAction[];
  finally?: CueAction[];
  set?: StoreSnapshot;
};

export type ScenarioFile = {
  cues: ScenarioCue[];
};

function asWhenValue(item: unknown): WhenValue | undefined {
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const row = item as Record<string, unknown>;
  const cond: { lt?: number; lte?: number; gt?: number; gte?: number } = {};
  for (const op of ['lt', 'lte', 'gt', 'gte'] as const) {
    if (typeof row[op] === 'number' && Number.isFinite(row[op])) cond[op] = row[op];
  }
  return cond.lt !== undefined || cond.lte !== undefined || cond.gt !== undefined || cond.gte !== undefined
    ? cond
    : undefined;
}

function asWhen(value: unknown): WhenSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: WhenSnapshot = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const parsed = asWhenValue(item);
    if (parsed !== undefined) out[key] = parsed;
  }
  return Object.keys(out).length ? out : undefined;
}

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

function parseLocales(raw: unknown): { locales: string[]; locale_names: Record<string, string> } {
  if (Array.isArray(raw)) {
    const locales = raw.map(String);
    return { locales, locale_names: Object.fromEntries(locales.map((code) => [code, code])) };
  }
  if (raw && typeof raw === 'object') {
    const locales: string[] = [];
    const locale_names: Record<string, string> = {};
    for (const [code, name] of Object.entries(raw as Record<string, unknown>)) {
      locales.push(code);
      locale_names[code] = typeof name === 'string' && name.trim() ? name.trim() : code;
    }
    if (locales.length) return { locales, locale_names };
  }
  return { locales: ['ru'], locale_names: { ru: 'Русский' } };
}

export function parseConfig(raw: string): ProjectConfig {
  const data = YAML.parse(raw) as Record<string, unknown>;
  const { locales, locale_names } = parseLocales(data.locales);
  const openrouter = (data.openrouter ?? {}) as Record<string, unknown>;
  const voices = (openrouter.voices ?? {}) as Record<string, string>;
  return {
    source_lang: String(data.source_lang ?? 'ru'),
    locales,
    locale_names,
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
    if (typeof row.text !== 'string') continue;
    const once = typeof row.once === 'string' ? row.once.trim() : '';
    const on = typeof row.on === 'string' ? row.on.trim() : '';
    if (!once && !on) continue;
    cues.push({
      ...(once ? { once } : { on }),
      when: asWhen(row.when),
      unless: asWhen(row.unless),
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenRouter } from '@openrouter/sdk';
import YAML from 'yaml';
import { buildManifest, writeLocaleYaml, writeManifest, writeUiJson } from './compile.ts';
import { sha256 } from './hash.ts';
import { parseConfig, parseScenario, type ProjectConfig, type ScenarioFile } from './schema.ts';
import { cueEvent } from './types.ts';
import { translateLocale } from './translate.ts';
import { synthesizeSpeech } from './tts.ts';
import type { LocaleFile } from './validate.ts';

export type SyncOptions = {
  dir: string;
  dryRun?: boolean;
  forceIds?: string[] | true;
  sourceOnly?: boolean;
};

type LockFile = {
  cues: Record<string, {
    sourceHash: string;
    locales: Record<string, { textHash: string }>;
  }>;
};

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readLocaleFile(path: string): LocaleFile {
  if (!existsSync(path)) return {};
  const parsed = YAML.parse(readFileSync(path, 'utf8')) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return {};
  const out: LocaleFile = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    if (typeof row.text !== 'string') continue;
    out[id] = { text: row.text, frozen: row.frozen === true ? true : undefined };
  }
  return out;
}

function defaultPromptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'translate.md');
}

function loadPrompt(dir: string): string {
  const override = join(dir, 'prompts', 'translate.md');
  const path = existsSync(override) ? override : defaultPromptPath();
  return readFileSync(path, 'utf8');
}

function forceMatch(force: SyncOptions['forceIds'], id: string): boolean {
  if (force === true) return true;
  if (!Array.isArray(force)) return false;
  if (force.includes(id)) return true;
  if (id.startsWith('ui.') && force.includes(id.slice(3))) return true;
  return false;
}

function flattenUiSource(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string' && value.trim() && prefix) return { [prefix]: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string' && item.trim()) out[id] = item;
    else Object.assign(out, flattenUiSource(item, id));
  }
  return out;
}

function readUiSource(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const parsed = YAML.parse(readFileSync(path, 'utf8')) as unknown;
  return flattenUiSource(parsed);
}

function uiKey(id: string): string {
  return `ui.${id}`;
}

export async function syncProject(options: SyncOptions): Promise<void> {
  const dir = options.dir;
  loadEnv(join(process.cwd(), '.env'));
  loadEnv(join(dir, '.env'));

  const config: ProjectConfig = parseConfig(readFileSync(join(dir, 'config.yaml'), 'utf8'));
  const scenario: ScenarioFile = parseScenario(readFileSync(join(dir, 'scenario.yaml'), 'utf8'));
  const lockPath = join(dir, '.sync-lock.json');
  const lock = readJson<LockFile>(lockPath, { cues: {} });
  const locales: Record<string, LocaleFile> = {};

  for (const locale of config.locales) {
    locales[locale] = readLocaleFile(join(dir, 'i18n', `${locale}.yaml`));
  }

  const sourceLocale = locales[config.source_lang] ?? (locales[config.source_lang] = {});
  for (const cue of scenario.cues) {
    const event = cueEvent(cue);
    const prev = sourceLocale[event];
    sourceLocale[event] = { text: cue.text, frozen: prev?.frozen };
  }

  const uiSource = readUiSource(join(dir, 'ui.yaml'));
  const uiIds = Object.keys(uiSource);
  for (const id of uiIds) {
    const key = uiKey(id);
    const prev = sourceLocale[key];
    sourceLocale[key] = { text: uiSource[id], frozen: prev?.frozen };
  }

  const allIds = [...scenario.cues.map((cue) => cueEvent(cue)), ...uiIds.map(uiKey)];

  const changed: Record<string, string[]> = {};
  for (const locale of config.locales) {
    if (locale === config.source_lang) continue;
    changed[locale] = [];
    const file = locales[locale] ?? (locales[locale] = {});
    for (const id of allIds) {
      const sourceText = sourceLocale[id]?.text;
      if (!sourceText) continue;
      const sourceHash = sha256(sourceText);
      const locked = lock.cues[id];
      const sourceChanged = locked?.sourceHash !== sourceHash;
      const missing = !file[id]?.text;
      const forced = forceMatch(options.forceIds, id);
      if (file[id]?.frozen && !forced) continue;
      if (missing || sourceChanged || forced) changed[locale].push(id);
    }
  }

  const ttsNeeded: Array<{ locale: string; id: string; text: string }> = [];
  const apiNeeded = !options.sourceOnly && Object.values(changed).some((ids) => ids.length > 0);

  if (options.dryRun) {
    console.log(JSON.stringify({ changed, tts: options.sourceOnly ? 'skipped' : 'after translation', sourceOnly: Boolean(options.sourceOnly) }, null, 2));
    return;
  }

  if (apiNeeded) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      console.warn('skipping translation: OPENROUTER_API_KEY is missing');
    } else {
      const client = new OpenRouter({ apiKey: key });
      const prompt = loadPrompt(dir);
      for (const [locale, ids] of Object.entries(changed)) {
        if (!ids.length) continue;
        const sources: Record<string, { source: string; existing?: string }> = {};
        for (const id of ids) {
          const sourceText = sourceLocale[id]?.text;
          if (!sourceText) continue;
          const existing = locales[locale][id]?.text;
          sources[id] = existing ? { source: sourceText, existing } : { source: sourceText };
        }
        const translated = await translateLocale({
          client,
          model: config.openrouter.translate_model,
          prompt,
          locale,
          sources,
        });
        for (const [id, entry] of Object.entries(translated)) {
          const frozen = locales[locale][id]?.frozen;
          locales[locale][id] = { text: entry.text, frozen };
        }
      }
    }
  }

  if (!options.sourceOnly) {
    for (const locale of config.locales) {
      for (const cue of scenario.cues) {
        const event = cueEvent(cue);
        const text = locales[locale][event]?.text;
        if (!text) continue;
        const textHash = sha256(text);
        const previous = lock.cues[event]?.locales[locale]?.textHash;
        const audioPath = join(dir, 'audio', locale, `${event}.mp3`);
        const forced = forceMatch(options.forceIds, event);
        if (previous !== textHash || !existsSync(audioPath) || forced) {
          ttsNeeded.push({ locale, id: event, text });
        }
      }
    }
  }

  if (ttsNeeded.length) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      console.warn('skipping TTS: OPENROUTER_API_KEY is missing');
    } else {
      const client = new OpenRouter({ apiKey: key });
      for (const item of ttsNeeded) {
        const voice = config.openrouter.voices[item.locale];
        if (!voice) {
          console.warn(`skipping TTS for ${item.locale}/${item.id}: no voice in config`);
          continue;
        }
        await synthesizeSpeech({
          client,
          model: config.openrouter.tts_model,
          voice,
          text: item.text,
          outPath: join(dir, 'audio', item.locale, `${item.id}.mp3`),
        });
      }
    }
  }

  mkdirSync(join(dir, 'i18n'), { recursive: true });
  for (const locale of config.locales) {
    const keep: LocaleFile = {};
    for (const id of allIds) {
      if (locales[locale][id]) keep[id] = locales[locale][id];
    }
    writeLocaleYaml(join(dir, 'i18n', `${locale}.yaml`), keep);
  }

  if (!options.sourceOnly) {
    const nextLock: LockFile = { cues: {} };
    for (const id of allIds) {
      const localesLock: Record<string, { textHash: string }> = {};
      for (const locale of config.locales) {
        const text = locales[locale][id]?.text;
        if (text) localesLock[locale] = { textHash: sha256(text) };
      }
      const sourceText = sourceLocale[id]?.text;
      if (!sourceText) continue;
      nextLock.cues[id] = { sourceHash: sha256(sourceText), locales: localesLock };
    }
    writeFileSync(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`);
  }

  const scenarioText = new Map(scenario.cues.map((cue) => [cueEvent(cue), cue.text]));
  const manifest = buildManifest(config, scenario, locales);
  for (const cue of manifest.cues) {
    const event = cueEvent(cue);
    const sourceChanged = options.sourceOnly
      && lock.cues[event]?.sourceHash !== sha256(scenarioText.get(event) ?? '');
    for (const locale of config.locales) {
      const audioPath = join(dir, 'audio', locale, `${event}.mp3`);
      if (sourceChanged || !existsSync(audioPath)) delete cue.audio[locale];
    }
  }
  writeManifest(dir, manifest);
  if (uiIds.length) writeUiJson(dir, config, uiIds, locales);
  if (options.sourceOnly) {
    console.log('source-only: updated manifest and source locale without translation or TTS');
  }
}

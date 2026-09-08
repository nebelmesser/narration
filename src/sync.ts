import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenRouter } from '@openrouter/sdk';
import YAML from 'yaml';
import { buildManifest, writeLocaleYaml, writeManifest } from './compile.ts';
import { sha256 } from './hash.ts';
import { parseConfig, parseScenario, type ProjectConfig, type ScenarioFile } from './schema.ts';
import { translateLocale } from './translate.ts';
import { synthesizeSpeech } from './tts.ts';
import type { LocaleFile } from './validate.ts';

export type SyncOptions = {
  dir: string;
  dryRun?: boolean;
  forceIds?: string[] | true;
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
  return Array.isArray(force) && force.includes(id);
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
    const prev = sourceLocale[cue.id];
    sourceLocale[cue.id] = { text: cue.text, frozen: prev?.frozen };
  }

  const changed: Record<string, string[]> = {};
  for (const locale of config.locales) {
    if (locale === config.source_lang) continue;
    changed[locale] = [];
    const file = locales[locale] ?? (locales[locale] = {});
    for (const cue of scenario.cues) {
      const sourceHash = sha256(cue.text);
      const locked = lock.cues[cue.id];
      const sourceChanged = locked?.sourceHash !== sourceHash;
      const missing = !file[cue.id]?.text;
      const forced = forceMatch(options.forceIds, cue.id);
      if (file[cue.id]?.frozen && !forced) continue;
      if (missing || sourceChanged || forced) changed[locale].push(cue.id);
    }
  }

  const ttsNeeded: Array<{ locale: string; id: string; text: string }> = [];
  const apiNeeded = Object.values(changed).some((ids) => ids.length > 0);

  if (options.dryRun) {
    console.log(JSON.stringify({ changed, tts: 'after translation' }, null, 2));
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
          const cue = scenario.cues.find((item) => item.id === id);
          if (!cue) continue;
          const existing = locales[locale][id]?.text;
          sources[id] = existing ? { source: cue.text, existing } : { source: cue.text };
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

  for (const locale of config.locales) {
    for (const cue of scenario.cues) {
      const text = locales[locale][cue.id]?.text;
      if (!text) continue;
      const textHash = sha256(text);
      const previous = lock.cues[cue.id]?.locales[locale]?.textHash;
      const audioPath = join(dir, 'audio', locale, `${cue.id}.mp3`);
      const forced = forceMatch(options.forceIds, cue.id);
      if (previous !== textHash || !existsSync(audioPath) || forced) {
        ttsNeeded.push({ locale, id: cue.id, text });
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
    for (const cue of scenario.cues) {
      if (locales[locale][cue.id]) keep[cue.id] = locales[locale][cue.id];
    }
    writeLocaleYaml(join(dir, 'i18n', `${locale}.yaml`), keep);
  }

  const nextLock: LockFile = { cues: {} };
  for (const cue of scenario.cues) {
    const localesLock: Record<string, { textHash: string }> = {};
    for (const locale of config.locales) {
      const text = locales[locale][cue.id]?.text;
      if (text) localesLock[locale] = { textHash: sha256(text) };
    }
    nextLock.cues[cue.id] = { sourceHash: sha256(cue.text), locales: localesLock };
  }
  writeFileSync(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`);

  const manifest = buildManifest(config, scenario, locales);
  for (const cue of manifest.cues) {
    for (const locale of config.locales) {
      const audioPath = join(dir, 'audio', locale, `${cue.id}.mp3`);
      if (!existsSync(audioPath)) delete cue.audio[locale];
    }
  }
  writeManifest(dir, manifest);
}

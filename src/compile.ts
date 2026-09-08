import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import type { CueDef, Manifest } from './types.ts';
import type { LocaleFile } from './validate.ts';
import type { ProjectConfig, ScenarioFile } from './schema.ts';

export function writeLocaleYaml(path: string, data: LocaleFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const ordered: LocaleFile = {};
  for (const id of Object.keys(data).sort()) ordered[id] = data[id];
  writeFileSync(path, YAML.stringify(ordered));
}

export function buildManifest(
  config: ProjectConfig,
  scenario: ScenarioFile,
  locales: Record<string, LocaleFile>,
): Manifest {
  const cues: CueDef[] = scenario.cues.map((cue) => {
    const text: Record<string, string> = {};
    const audio: Record<string, string | undefined> = {};
    for (const locale of config.locales) {
      const entry = locales[locale]?.[cue.id];
      if (entry?.text) text[locale] = entry.text;
      audio[locale] = `audio/${locale}/${cue.id}.mp3`;
    }
    if (!text[config.source_lang]) text[config.source_lang] = cue.text;
    return {
      id: cue.id,
      on: cue.on,
      when: cue.when,
      unless: cue.unless,
      play_once: cue.play_once || undefined,
      text,
      audio,
      at_start: cue.at_start,
      finally: cue.finally,
      set: cue.set,
    };
  });
  return {
    source_lang: config.source_lang,
    locales: config.locales,
    cues,
  };
}

export function writeManifest(dir: string, manifest: Manifest): void {
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

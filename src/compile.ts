import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { cueEvent, type CueDef, type Manifest } from './types.ts';
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
    const event = cueEvent(cue);
    const text: Record<string, string> = {};
    const audio: Record<string, string | undefined> = {};
    for (const locale of config.locales) {
      const entry = locales[locale]?.[event];
      if (entry?.text) text[locale] = entry.text;
      audio[locale] = `audio/${locale}/${event}.mp3`;
    }
    if (!text[config.source_lang]) text[config.source_lang] = cue.text;
    return {
      on: cue.on,
      once: cue.once,
      when: cue.when,
      unless: cue.unless,
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
    locale_names: config.locale_names,
    cues,
  };
}

export function writeManifest(dir: string, manifest: Manifest): void {
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

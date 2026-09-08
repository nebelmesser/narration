import YAML from 'yaml';

export type LocaleEntry = {
  text: string;
  frozen?: boolean;
};

export type LocaleFile = Record<string, LocaleEntry>;

export function extractYaml(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:yaml|yml)?\s*([\s\S]*?)```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

export function parseLocaleMap(raw: string, expectedIds: string[]): { ok: true; data: LocaleFile } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = YAML.parse(extractYaml(raw));
  } catch (error) {
    return { ok: false, errors: [`yaml_parse: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['yaml_parse: root must be a map of id → { text }'] };
  }
  const data: LocaleFile = {};
  const got = new Set<string>();
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    got.add(id);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`bad_value: ${id}`);
      continue;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== 'text' && key !== 'frozen') errors.push(`extra_key: ${id}.${key}`);
    }
    if (typeof record.text !== 'string' || record.text.trim() === '') {
      errors.push(`empty_text: ${id}`);
      continue;
    }
    data[id] = {
      text: record.text,
      frozen: record.frozen === true ? true : undefined,
    };
  }
  for (const id of expectedIds) {
    if (!got.has(id)) errors.push(`missing_id: ${id}`);
  }
  for (const id of got) {
    if (!expectedIds.includes(id)) errors.push(`extra_id: ${id}`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, data };
}

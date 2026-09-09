import { OpenRouter } from '@openrouter/sdk';
import YAML from 'yaml';
import { parseLocaleMap, type LocaleFile } from './validate.ts';

type Turn = { role: 'user' | 'assistant'; content: string };

function assistantText(result: unknown): string {
  const row = result as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = row.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

export async function translateLocale(options: {
  client: OpenRouter;
  model: string;
  prompt: string;
  locale: string;
  sources: Record<string, { source: string; existing?: string }>;
  maxAttempts?: number;
}): Promise<LocaleFile> {
  const ids = Object.keys(options.sources);
  const payload = YAML.stringify({
    locale: options.locale,
    entries: options.sources,
  });
  const messages: Turn[] = [
    { role: 'user', content: `${options.prompt.trim()}\n\n${payload}` },
  ];
  const maxAttempts = options.maxAttempts ?? 5;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`translate ${options.locale}: attempt ${attempt + 1}/${maxAttempts}`);
    const result = await options.client.chat.send({
      chatRequest: {
        model: options.model,
        stream: false,
        messages: messages.map((turn) => (
          turn.role === 'assistant'
            ? { role: 'assistant' as const, content: turn.content }
            : { role: 'user' as const, content: turn.content }
        )),
      },
    });
    const text = assistantText(result);
    messages.push({ role: 'assistant', content: text });
    const parsed = parseLocaleMap(text, ids);
    if (parsed.ok) return parsed.data;
    lastErrors = parsed.errors;
    console.log(`translate ${options.locale}: retry (${lastErrors.length} ${lastErrors.length === 1 ? 'error' : 'errors'})`);
    messages.push({ role: 'user', content: lastErrors.join('\n') });
  }

  throw new Error(`translation failed for ${options.locale} after ${maxAttempts} attempts:\n${lastErrors.join('\n')}`);
}

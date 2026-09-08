import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { OpenRouter } from '@openrouter/sdk';

async function bytesFromUnknown(result: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  if (typeof result === 'string') return Buffer.from(result);
  if (result && typeof result === 'object') {
    const row = result as { arrayBuffer?: () => Promise<ArrayBuffer> };
    if (typeof row.arrayBuffer === 'function') {
      return Buffer.from(await row.arrayBuffer());
    }
    const stream = result as ReadableStream<Uint8Array>;
    if (typeof stream.getReader === 'function') {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
  }
  throw new Error('unexpected TTS response');
}

export async function synthesizeSpeech(options: {
  client: OpenRouter;
  model: string;
  voice: string;
  text: string;
  outPath: string;
}): Promise<void> {
  const result = await options.client.tts.createSpeech({
    speechRequest: {
      input: options.text,
      model: options.model,
      voice: options.voice,
      responseFormat: 'mp3',
    },
  });
  const bytes = await bytesFromUnknown(result);
  mkdirSync(dirname(options.outPath), { recursive: true });
  writeFileSync(options.outPath, bytes);
}

#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { syncProject } from './sync.ts';

function printHelp(): void {
  console.log(`Usage: narration sync [--dir path] [--dry-run] [--force [id]]

Reads narration/config.yaml and narration/scenario.yaml in the project directory.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args[0] !== 'sync') {
    printHelp();
    if (args[0] && args[0] !== 'sync' && args[0] !== '--help' && args[0] !== '-h') {
      process.exitCode = 1;
    }
    return;
  }

  let dir = '';
  let dryRun = false;
  let forceIds: string[] | true | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir') {
      dir = args[++i] ?? '';
    } else if (arg === '--force') {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        forceIds = [...(Array.isArray(forceIds) ? forceIds : []), next];
        i++;
      } else {
        forceIds = true;
      }
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exitCode = 1;
      return;
    }
  }

  const cwd = process.cwd();
  const resolved = dir
    ? resolve(cwd, dir)
    : existsSync(resolve(cwd, 'narration', 'scenario.yaml'))
      ? resolve(cwd, 'narration')
      : existsSync(resolve(cwd, 'scenario.yaml'))
        ? cwd
        : resolve(cwd, 'narration');

  if (!existsSync(resolve(resolved, 'scenario.yaml'))) {
    throw new Error(`scenario.yaml not found in ${resolved}`);
  }

  await syncProject({ dir: resolved, dryRun, forceIds });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

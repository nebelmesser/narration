# @nebelmesser/narration

Queued subtitles and voiceover for playground apps. Source lives in this
playground submodule; the Git remote is [nebelmesser/narration](https://github.com/nebelmesser/narration).

## App

```ts
import { bindHighlight, bindUnhighlight, mountNarrator } from '@nebelmesser/narration';

const n = await mountNarrator();
n.on('highlight', bindHighlight());
n.on('unhighlight', bindUnhighlight());
n.store.set('iter_quality', 'high');
n.emit('boot');
```

Outgoing cue actions are `target-event` names (`probe-highlight`). `bindHighlight` / `bindUnhighlight` still listen for `highlight` / `unhighlight`; the target is the prefix.

One-shot lines use `once: map-ready` instead of `on:` plus `play_once`. Repeatable lines stay `on:`.

## Authoring

Put `narration/config.yaml` and `narration/scenario.yaml` next to the published
HTML. Then:

```bash
export OPENROUTER_API_KEY=...
npx narration sync
```

`--dry-run` prints the planned translation/TTS work. `--force` / `--force boot`
rebuilds translations and audio. Cue identity is `on:` or `once:` (the app event name).
Native locale labels go in `config.yaml` under `locales` as `code: Native name`.

import { loadGameData } from './data/load';
import { isLanguage } from './data/strings';
import { AudioPlayer } from './engine/audio';
import { createScreen } from './engine/screen';
import { TextureStore } from './engine/textures';
import { LevelScene } from './game/levelScene';
import { LevelSelect } from './game/levelSelect';
import { Progress } from './game/progress';
import { STAGES } from './game/stages';

declare global {
  interface Window {
    /** Exposed for manual poking and automated checks. */
    game?: LevelScene;
    progress?: Progress;
  }
}

/**
 * Screens are separate page loads: `?stage=S&level=N` plays a level, no level shows the stage
 * screen. `?reset` is dropped on navigation so it only applies once.
 */
function navigate(stage: number, level: number | null): void {
  const params = new URLSearchParams(location.search);
  params.delete('reset');
  params.set('stage', String(stage));
  if (level === null) params.delete('level');
  else params.set('level', String(level));
  location.href = `${location.pathname}?${params.toString()}`;
}

async function main(): Promise<void> {
  const host = document.getElementById('game')!;
  const params = new URLSearchParams(location.search);
  const data = await loadGameData();
  const app = await createScreen(host);
  const textures = new TextureStore(data.resources);
  const language = params.get('lang');
  const chosen = isLanguage(language) ? language : 'spanish';
  const progress = Progress.load();
  if (params.has('reset')) progress.reset();
  window.progress = progress;

  const stageWanted = Number.parseInt(params.get('stage') ?? '1', 10);
  const stage = STAGES.has(stageWanted) ? stageWanted : 1;
  const layout = STAGES.get(stage)!;
  const levels = data.areas.get(stage)!.levelsCount;
  const requested = Number.parseInt(params.get('level') ?? '', 10);
  const level = Number.isInteger(requested) && requested >= 1 && requested <= levels ? requested : null;

  if (level === null) {
    await LevelSelect.create(app, data, textures, {
      stage,
      layout,
      strings: await data.strings(chosen),
      progress,
      stages: [...STAGES.keys()].map((s) => ({ stage: s, open: progress.stageUnlocked(s, data.areas.get(s - 1)?.levelsCount ?? 0) })),
      onPlay: (next) => navigate(stage, next),
      onStage: (next) => navigate(next, null),
    });
  } else {
    const audio = new AudioPlayer(data.resources);
    audio.muted = params.has('mute');
    window.game = await LevelScene.create(app, data, textures, audio, {
      stage,
      level,
      layout,
      language: chosen,
      progress,
      onNavigate: (next) => navigate(stage, next),
      showNodes: params.has('nodes'),
    });
  }
  document.body.dataset.ready = 'true';
}

main().catch((error: unknown) => {
  console.error(error);
  document.body.dataset.error = String(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f66;padding:16px;white-space:pre-wrap';
  pre.textContent = String(error);
  document.body.appendChild(pre);
});

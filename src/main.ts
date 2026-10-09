import { loadGameData } from './data/load';
import { isLanguage } from './data/strings';
import { AudioPlayer } from './engine/audio';
import { createScreen } from './engine/screen';
import { TextureStore } from './engine/textures';
import { LevelScene } from './game/levelScene';
import { LevelSelect } from './game/levelSelect';
import { Progress } from './game/progress';
import { ARCHES } from './game/stages/arches';

declare global {
  interface Window {
    /** Exposed for manual poking and automated checks. */
    game?: LevelScene;
    progress?: Progress;
  }
}

const STAGE = 1;

/** Screens are separate page loads: `?level=N` plays a level, no level shows the stage screen. */
function navigate(level: number | null): void {
  const params = new URLSearchParams(location.search);
  if (level === null) params.delete('level');
  else params.set('level', String(level));
  const query = params.toString();
  location.href = `${location.pathname}${query ? `?${query}` : ''}`;
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

  const levels = data.areas.get(STAGE)!.levelsCount;
  const requested = Number.parseInt(params.get('level') ?? '', 10);
  const level = Number.isInteger(requested) && requested >= 1 && requested <= levels ? requested : null;

  if (level === null) {
    await LevelSelect.create(app, data, textures, {
      stage: STAGE,
      layout: ARCHES,
      strings: await data.strings(chosen),
      progress,
      onPlay: navigate,
    });
  } else {
    const audio = new AudioPlayer(data.resources);
    audio.muted = params.has('mute');
    window.game = await LevelScene.create(app, data, textures, audio, {
      stage: STAGE,
      level,
      layout: ARCHES,
      language: chosen,
      progress,
      onNavigate: navigate,
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

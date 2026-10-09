import { loadGameData } from './data/load';
import { isLanguage } from './data/strings';
import { AudioPlayer } from './engine/audio';
import { createScreen } from './engine/screen';
import { TextureStore } from './engine/textures';
import { LevelScene } from './game/levelScene';
import { ARCHES } from './game/stages/arches';

declare global {
  interface Window {
    /** Exposed for manual poking and automated checks. */
    game?: LevelScene;
  }
}

async function main(): Promise<void> {
  const host = document.getElementById('game')!;
  const params = new URLSearchParams(location.search);
  const data = await loadGameData();
  const app = await createScreen(host);
  const textures = new TextureStore(data.resources);

  const language = params.get('lang');
  const audio = new AudioPlayer(data.resources);
  audio.muted = params.has('mute');

  // Stage 1 has six levels; ?level=N picks one.
  const requested = Number.parseInt(params.get('level') ?? '1', 10);
  const level = Number.isInteger(requested) && requested >= 1 && requested <= 6 ? requested : 1;

  window.game = await LevelScene.create(app, data, textures, audio, {
    stage: 1,
    level,
    layout: ARCHES,
    language: isLanguage(language) ? language : 'spanish',
    showNodes: params.has('nodes'),
  });
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

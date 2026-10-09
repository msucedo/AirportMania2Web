import { loadGameData } from './data/load';
import { isLanguage } from './data/strings';
import { AudioPlayer } from './engine/audio';
import { createScreen } from './engine/screen';
import { TextureStore } from './engine/textures';
import { LevelScene } from './game/levelScene';
import { LevelSelect } from './game/levelSelect';
import { MainMenu } from './game/mainMenu';
import { loadSettings, saveSettings } from './game/settings';
import { OPTIONS_SURFACES, OptionsDialog } from './game/view/optionsDialog';
import { WorldMap } from './game/worldMap';
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
 * Screens are separate page loads: no parameters shows the main menu, `?map` the world map
 * (`?map=S` centred on a stage), `?stage=S` a stage's screen and `?stage=S&level=N` plays a level. `?reset` is dropped on navigation so it only applies once.
 */
function navigate(stage: number | null, level: number | null, map?: number | ''): void {
  const params = new URLSearchParams(location.search);
  params.delete('reset');
  params.delete('map');
  if (stage === null) {
    params.delete('stage');
    params.delete('level');
    if (map !== undefined) params.set('map', String(map));
    location.href = `${location.pathname}?${params.toString()}`;
    return;
  }
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
  let settings = loadSettings();
  // `?lang=` overrides the language chosen in the options, for trying one out.
  const language = params.get('lang');
  const chosen = isLanguage(language) ? language : settings.language;
  const makeAudio = (): AudioPlayer => {
    const player = new AudioPlayer(data.resources);
    player.muted = params.has('mute');
    player.setVolumes(settings.sound, settings.music);
    return player;
  };
  const progress = Progress.load();
  if (params.has('reset')) progress.reset();
  window.progress = progress;

  const stageWanted = Number.parseInt(params.get('stage') ?? '1', 10);
  const stage = STAGES.has(stageWanted) ? stageWanted : 1;
  const layout = STAGES.get(stage)!;
  const levels = data.areas.get(stage)!.levelsCount;
  const requested = Number.parseInt(params.get('level') ?? '', 10);
  const level = Number.isInteger(requested) && requested >= 1 && requested <= levels ? requested : null;

  const playable = new Map([...STAGES.keys()].map((s) => [s, data.areas.get(s)!.levelsCount]));
  if (params.has('map')) {
    const audio = makeAudio();
    const focus = Number.parseInt(params.get('map') ?? '', 10);
    await WorldMap.create(app, data, textures, audio, {
      strings: await data.strings(chosen),
      progress,
      playable,
      focus: STAGES.has(focus) ? focus : null,
      onPlay: (s, l) => navigate(s, l),
      onStage: (s) => navigate(s, null),
      onMenu: () => navigate(null, null),
    });
  } else if (!params.has('stage') && level === null) {
    const audio = makeAudio();
    const strings = await data.strings(chosen);
    await textures.load(OPTIONS_SURFACES);
    await MainMenu.create(app, data, textures, audio, {
      strings,
      enabled: ['PLAY', 'OPTIONS'],
      onSelect: (entry) => {
        if (entry === 'PLAY') return navigate(null, null, '');
        const dialog = new OptionsDialog(textures, audio, strings, settings, (next) => {
          const languageChanged = next.language !== settings.language;
          settings = next;
          saveSettings(settings);
          // Texts are loaded once per page, so a new language needs the page again.
          if (languageChanged) location.reload();
          // Removed after the touch that closed it has been dispatched.
          else setTimeout(() => dialog.destroy({ children: true }));
        });
        app.stage.addChild(dialog);
      },
    });
  } else if (level === null) {
    await LevelSelect.create(app, data, textures, {
      stage,
      layout,
      strings: await data.strings(chosen),
      progress,
      stages: [...STAGES.keys()].map((s) => ({ stage: s, open: progress.stageUnlocked(s, data.areas.get(s - 1)?.levelsCount ?? 0) })),
      onPlay: (next) => navigate(stage, next),
      onStage: (next) => navigate(next, null),
      onMenu: () => navigate(null, null, stage),
    });
  } else {
    const audio = makeAudio();
    window.game = await LevelScene.create(app, data, textures, audio, {
      stage,
      level,
      layout,
      language: chosen,
      progress,
      // Leaving a level goes back to the map; the next-level button goes straight on.
      onNavigate: (next) => (next === null ? navigate(null, null, stage) : navigate(stage, next)),
      settings,
      onSettings: (next) => {
        settings = next;
        saveSettings(next);
      },
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

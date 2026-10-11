import { loadGameData } from './data/load';
import { isLanguage } from './data/strings';
import { AudioPlayer } from './engine/audio';
import { loadFonts } from './engine/fonts';
import { createScreen } from './engine/screen';
import { TextureStore, type EnlargedImages } from './engine/textures';
import { AwardsRoom } from './game/awardsRoom';
import { EndingScene } from './game/endingScene';
import { LevelScene } from './game/levelScene';
import { MainMenu } from './game/mainMenu';
import { loadSettings, saveSettings } from './game/settings';
import { CREDITS_FONTS, CREDITS_SURFACES, CreditsDialog } from './game/view/creditsDialog';
import { GAME_MENU_SURFACES, GameMenu } from './game/view/gameMenu';
import { NameDialog, USERS_FONTS, USERS_SURFACES, UsersDialog } from './game/view/usersDialogs';
import { TUTORIAL_QUESTION_SURFACES, TutorialQuestionDialog } from './game/view/tutorialViews';
import { WorldMap } from './game/worldMap';
import { PROGRESS_KEY, Progress, type StageRules } from './game/progress';
import { Users } from './game/users';
import { STAGES, stageLayout } from './game/stages';

declare global {
  interface Window {
    /** Exposed for manual poking and automated checks. */
    game?: LevelScene;
    map?: WorldMap;
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
  params.delete('go');
  params.delete('awards');
  params.delete('ending');
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

/** The enlarged images, if tools/upscale-assets.py has been run; otherwise the originals are used. */
async function enlargedImages(): Promise<EnlargedImages | null> {
  try {
    const response = await fetch('assets-hd/manifest.json');
    if (!response.ok) return null;
    const manifest = (await response.json()) as { scale: number; files: string[] };
    return { baseUrl: 'assets-hd/', scale: manifest.scale, files: new Set(manifest.files) };
  } catch {
    return null;
  }
}

/** Opens one of the screens named by a bare parameter (`?awards`, `?ending`). */
function goTo(screen: 'awards' | 'ending'): void {
  const next = new URLSearchParams(location.search);
  for (const name of ['reset', 'stage', 'level', 'map', 'go', 'awards', 'ending']) next.delete(name);
  next.set(screen, '');
  location.href = `${location.pathname}?${next.toString()}`;
}

async function main(): Promise<void> {
  const host = document.getElementById('game')!;
  const params = new URLSearchParams(location.search);
  const data = await loadGameData();
  const app = await createScreen(host);
  let settings = loadSettings();
  // `?hd=0` and `?hd=1` switch the enlarged images off and on, and the choice is kept.
  if (params.has('hd')) {
    settings = { ...settings, enlarged: params.get('hd') !== '0' };
    saveSettings(settings);
  }
  const textures = new TextureStore(data.resources, settings.enlarged ? await enlargedImages() : null);
  // `?lang=` overrides the language chosen in the options, for trying one out.
  const language = params.get('lang');
  const chosen = isLanguage(language) ? language : settings.language;
  const makeAudio = (): AudioPlayer => {
    const player = new AudioPlayer(data.resources);
    player.muted = params.has('mute');
    player.setVolumes(settings.sound, settings.music);
    return player;
  };
  // Only the stages that can be played take part in the rules, so the last one opens nothing.
  const rules = new Map<number, StageRules>(
    [...STAGES.keys()].map((s) => {
      const area = data.areas.get(s)!;
      return [s, { levels: area.levelsCount, perStar: area.perStarAmount, clearBonus: area.stageClearAmount }];
    }),
  );
  // Each user has their own progress; before there is a user it is kept where it always was.
  const users = Users.load(localStorage, PROGRESS_KEY);
  const progress = Progress.load(rules, users.progressKey);
  if (params.has('reset')) progress.reset();
  window.progress = progress;

  const stageWanted = Number.parseInt(params.get('stage') ?? '1', 10);
  const stage = stageLayout(stageWanted) ? stageWanted : 1;
  const layout = stageLayout(stage)!;
  const levels = data.areas.get(stage)!.levelsCount;
  const requested = Number.parseInt(params.get('level') ?? '', 10);
  const level = Number.isInteger(requested) && requested >= 1 && requested <= levels ? requested : null;

  const playable = new Map([...STAGES.keys()].map((s) => [s, data.areas.get(s)!.levelsCount]));
  if (params.has('ending')) {
    // The ending, reached from the last stage's clear screen; it goes back to the main menu.
    await EndingScene.create(app, data, textures, makeAudio(), { strings: await data.strings(chosen), onReturn: () => navigate(null, null) });
  } else if (params.has('awards')) {
    // The awards room, reached from the map and going back to it.
    await AwardsRoom.create(app, data, textures, makeAudio(), {
      strings: await data.strings(chosen),
      awards: progress.awards,
      user: users.current?.name ?? null,
      planes: data.planes,
      onBack: () => navigate(null, null, ''),
    });
  } else if (level === null && (params.has('map') || params.has('stage'))) {
    // A stage without a level is the map centred on it.
    const audio = makeAudio();
    const focus = Number.parseInt(params.get('map') || params.get('stage') || '', 10);
    window.map = await WorldMap.create(app, data, textures, audio, {
      strings: await data.strings(chosen),
      progress,
      playable,
      licences: new Map([...STAGES].map(([s, l]) => [s, l.extraPlaneLicence])),
      focus: STAGES.has(focus) ? focus : null,
      onPlay: (s, l) => navigate(s, l),
      onMenu: () => navigate(null, null),
      onAwards: () => {
        const next = new URLSearchParams(location.search);
        next.delete('reset');
        next.set('awards', '');
        location.href = `${location.pathname}?${next.toString()}`;
      },
    });
  } else if (level === null) {
    const audio = makeAudio();
    const strings = await data.strings(chosen);
    await Promise.all([textures.load([...GAME_MENU_SURFACES, ...CREDITS_SURFACES, ...USERS_SURFACES, ...TUTORIAL_QUESTION_SURFACES]), loadFonts(data.resources, [...CREDITS_FONTS, ...USERS_FONTS])]);
    await MainMenu.create(app, data, textures, audio, {
      strings,
      enabled: ['PLAY', 'USERS', 'OPTIONS', 'CREDITS'],
      onSelect: (entry) => {
        if (entry === 'PLAY') {
          // 0x5d024: with no user the name is asked first; a game not begun asks about the
          // tutorial; otherwise the map opens. (`?nouser` skips the name, for automated checks.)
          const go = (): void => {
            const mine = Progress.load(rules, users.progressKey);
            if (!mine.fresh) return navigate(null, null, '');
            const question = new TutorialQuestionDialog(textures, audio, strings, (tutorial) => {
              mine.begin();
              if (tutorial) navigate(0, 1);
              else navigate(null, null, '');
            });
            app.stage.addChild(question);
          };
          if (users.list.length > 0 || params.has('nouser')) return go();
          app.stage.addChild(
            new NameDialog({ textures, audio, strings, users }, 'first', () => {
              if (users.current) go();
            }),
          );
          return;
        }
        if (entry === 'USERS') {
          const dialog = new UsersDialog({ textures, audio, strings, users }, () => setTimeout(() => dialog.destroy({ children: true })));
          app.stage.addChild(dialog);
          return;
        }
        if (entry === 'CREDITS') {
          const credits = new CreditsDialog(textures, audio, strings, app.ticker, () => setTimeout(() => credits.destroy({ children: true })));
          app.stage.addChild(credits);
          return;
        }
        const dialog = new GameMenu(textures, audio, {
          strings,
          settings,
          inGame: false,
          onSettings: (next) => {
            settings = next;
            saveSettings(settings);
          },
          // Removed after the touch that closed it has been dispatched.
          onExit: () => setTimeout(() => dialog.destroy({ children: true })),
        });
        app.stage.addChild(dialog);
      },
    });
  } else {
    const audio = makeAudio();
    window.game = await LevelScene.create(app, data, textures, audio, {
      stage,
      level,
      layout,
      language: chosen,
      progress,
      // Leaving a level goes back to the map; restarting loads it again.
      onNavigate: (next) => (next === null ? navigate(null, null, stage) : navigate(stage, next)),
      ...(stage === Math.max(...STAGES.keys()) ? { onEnding: () => goTo('ending') } : {}),
      onMainMenu: () => navigate(null, null),
      settings,
      rules: rules.get(stage)!,
      skipShop: params.has('go'),
      skipIntro: params.has('nointro'),
      onRebuild: () => {
        const next = new URLSearchParams(location.search);
        next.set('go', '');
        location.search = next.toString();
      },
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

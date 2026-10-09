import { Application } from 'pixi.js';

/** The original game renders at the 3.5" iPhone resolution, landscape. */
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 320;

/** Creates the renderer at the native resolution and letterboxes it into the host element. */
export async function createScreen(host: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    background: 0x000000,
    antialias: false,
    autoDensity: false,
    resolution: 1,
  });
  host.appendChild(app.canvas);

  const fit = (): void => {
    const scale = Math.min(host.clientWidth / SCREEN_WIDTH, host.clientHeight / SCREEN_HEIGHT);
    app.canvas.style.width = `${Math.floor(SCREEN_WIDTH * scale)}px`;
    app.canvas.style.height = `${Math.floor(SCREEN_HEIGHT * scale)}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  return app;
}

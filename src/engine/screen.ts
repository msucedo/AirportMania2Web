import { Application } from 'pixi.js';

/** The original game renders at the 3.5" iPhone resolution, landscape. */
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 320;

/** Above this the extra pixels cost more than they show. */
const MAX_RESOLUTION = 4;

/**
 * Creates the renderer and letterboxes it into the host element. The game is laid out in the
 * original's 480×320 units, but drawn with as many real pixels as the canvas occupies on screen:
 * stretching a 480×320 picture afterwards blurs everything, text and edges included.
 */
export async function createScreen(host: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    background: 0x000000,
    antialias: true,
    autoDensity: false,
    resolution: 1,
  });
  host.appendChild(app.canvas);

  const fit = (): void => {
    const scale = Math.min(host.clientWidth / SCREEN_WIDTH, host.clientHeight / SCREEN_HEIGHT);
    const width = Math.floor(SCREEN_WIDTH * scale);
    const height = Math.floor(SCREEN_HEIGHT * scale);
    const resolution = Math.max(1, Math.min(MAX_RESOLUTION, (width / SCREEN_WIDTH) * (window.devicePixelRatio || 1)));
    app.renderer.resize(SCREEN_WIDTH, SCREEN_HEIGHT, resolution);
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  return app;
}

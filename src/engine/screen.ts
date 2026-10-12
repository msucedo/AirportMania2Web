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
    // The room is what the host leaves inside its padding (a phone's notch and home bar).
    const style = getComputedStyle(host);
    const room = {
      width: host.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0),
      height: host.clientHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0),
    };
    const scale = Math.min(room.width / SCREEN_WIDTH, room.height / SCREEN_HEIGHT);
    const width = Math.floor(SCREEN_WIDTH * scale);
    const height = Math.floor(SCREEN_HEIGHT * scale);
    const resolution = Math.max(1, Math.min(MAX_RESOLUTION, (width / SCREEN_WIDTH) * (window.devicePixelRatio || 1)));
    app.renderer.resize(SCREEN_WIDTH, SCREEN_HEIGHT, resolution);
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;
  };
  fit();
  window.addEventListener('resize', fit);
  // A phone turned over says so late, and not always as a resize.
  const later = (): void => {
    fit();
    window.setTimeout(fit, 300);
  };
  window.addEventListener('orientationchange', later);
  window.addEventListener('pageshow', later);
  window.visualViewport?.addEventListener('resize', fit);
  quietBrowserGestures();
  return app;
}

/**
 * Ours, for phones: two quick touches are the browser's own gesture (it zooms or slides the
 * page), and the game's way of taking an order back. The browser's is called off; the game's
 * pointer events come all the same.
 */
function quietBrowserGestures(): void {
  const typing = (target: EventTarget | null): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  const off = (event: Event): void => {
    if (!typing(event.target)) event.preventDefault();
  };
  for (const name of ['dblclick', 'gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(name, off, { passive: false });
  let last = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = performance.now();
      if (now - last < 350) off(event);
      last = now;
    },
    { passive: false },
  );
  // Should the page have been moved all the same, it is put back.
  window.addEventListener('scroll', () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  });
}

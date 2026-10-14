// Ours, not the original's: the built game is kept on the device by a service worker
// (public/sw.js) so that it plays offline, and a line under the game says how far that has got.

type Message = { type: 'keeping'; done: number; total: number } | { type: 'kept' } | { type: 'failed'; reason: string };

/** Starts keeping the game for playing offline, where the browser allows it (a built page over HTTPS). */
export function keepForOffline(): void {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  const label = document.getElementById('offline');
  let hide = 0;
  const say = (text: string, forMs = 0): void => {
    if (!label) return;
    label.textContent = text;
    label.style.display = 'block';
    window.clearTimeout(hide);
    if (forMs > 0) hide = window.setTimeout(() => (label.style.display = 'none'), forMs);
  };
  const worker = navigator.serviceWorker;
  worker.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    // With a build already kept and serving this page, what is kept now is an update.
    const updating = worker.controller !== null;
    const what = updating ? 'Guardando la versión nueva' : 'Guardando para jugar sin conexión';
    if (message.type === 'keeping') say(`${what}… ${Math.floor((100 * message.done) / Math.max(1, message.total))} %`);
    else if (message.type === 'kept') say(updating ? 'Versión nueva lista: cierra el juego y vuelve a abrirlo' : 'Listo para jugar sin conexión', updating ? 10000 : 5000);
    else if (message.type === 'failed') say('No se pudo guardar el juego; se intentará al volver a abrirlo', 8000);
  };
  worker.startMessages();
  void worker
    .register('sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      // Safari does not always look for a new build by itself, least of all in a game kept on the
      // home screen and brought back from the background: it is asked to on opening and on coming back.
      let asked = 0;
      const look = (): void => {
        if (document.visibilityState !== 'visible' || performance.now() - asked < 30000) return;
        asked = performance.now();
        void registration.update().catch(() => undefined);
      };
      look();
      document.addEventListener('visibilitychange', look);
    })
    .catch((error: unknown) => console.warn('Offline play is not available', error));
  // Asks the browser not to throw the kept game away when it is short of room.
  void navigator.storage?.persist?.().catch(() => false);
}

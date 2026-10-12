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
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message.type === 'keeping') say(`Guardando para jugar sin conexión… ${Math.floor((100 * message.done) / Math.max(1, message.total))} %`);
    else if (message.type === 'kept') say('Listo para jugar sin conexión', 5000);
    else if (message.type === 'failed') say('No se pudo guardar el juego; se intentará al volver a abrirlo', 8000);
  });
  void navigator.serviceWorker.register('sw.js').catch((error: unknown) => console.warn('Offline play is not available', error));
  // Asks the browser not to throw the kept game away when it is short of room.
  void navigator.storage?.persist?.().catch(() => false);
}

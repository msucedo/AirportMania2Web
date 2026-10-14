// Serves the built game (dist/) to the phones on the home network over HTTPS, which is what a
// phone asks for before it keeps a page for playing offline. The certificate is made by mkcert
// (`brew install mkcert`) for this computer's addresses and kept in .certs/, which is not committed.
// Usage: node tools/serve-https.mjs [distDir]      (PORT=8443 and HTTP_PORT=8080 can be changed)
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.PORT ?? 8443);
const httpPort = Number(process.env.HTTP_PORT ?? 8080);
const certs = resolve('.certs');

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`There is no built game in ${dist}: run \`npm run build\` first.`);
  process.exit(1);
}

function run(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

let authority;
try {
  authority = join(run('mkcert', ['-CAROOT']), 'rootCA.pem');
} catch {
  console.error('mkcert is needed to make the certificate: `brew install mkcert`, then run this again.');
  process.exit(1);
}

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address)
  // A self-assigned address is no use to a phone: the network's own first.
  .sort((a, b) => Number(a.startsWith('169.254.')) - Number(b.startsWith('169.254.')));
let name = null;
try {
  name = `${run('scutil', ['--get', 'LocalHostName'])}.local`;
} catch {
  // Not a Mac: the addresses will do.
}
const hosts = [...(name ? [name] : []), ...addresses, 'localhost', '127.0.0.1'];

// A new certificate when this computer's addresses are not those of the one kept.
mkdirSync(certs, { recursive: true });
const made = join(certs, 'hosts.txt');
if (!existsSync(join(certs, 'cert.pem')) || !existsSync(made) || readFileSync(made, 'utf8') !== hosts.join('\n')) {
  execFileSync('mkcert', ['-cert-file', join(certs, 'cert.pem'), '-key-file', join(certs, 'key.pem'), ...hosts], { stdio: ['ignore', 'ignore', 'inherit'] });
  writeFileSync(made, hosts.join('\n'));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
};

function serve(request, response) {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  // What tells whether a phone looks for a new build, and takes it.
  if (path === '/sw.js' || path === '/precache.json') console.log(`${new Date().toLocaleTimeString()}  ${request.socket.remoteAddress?.replace('::ffff:', '')}  asks for ${path.slice(1)}`);
  // The certificate authority the phone has to trust, once.
  if (path === '/rootCA.pem') {
    response.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="airport-mania-local-ca.pem"' });
    createReadStream(authority).pipe(response);
    return;
  }
  const file = normalize(join(dist, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }
  // The service worker and its list are always asked for again; it decides what is new.
  response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}

createHttps({ cert: readFileSync(join(certs, 'cert.pem')), key: readFileSync(join(certs, 'key.pem')) }, serve).listen(port);
createHttp(serve).listen(httpPort);

const first = addresses[0] ?? 'localhost';
console.log(`
The game is being served. On the iPhone, on the same wifi:

 1. Once only, trust this computer's certificates:
      open  http://${first}:${httpPort}/rootCA.pem  in Safari and allow the download;
      Settings > General > VPN & Device Management > install the profile;
      Settings > General > About > Certificate Trust Settings > switch it on.
 2. Open  https://${first}:${port}/  in Safari${name ? `  (or https://${name}:${port}/)` : ''}
    and wait for "Listo para jugar sin conexión".
 3. Share > Add to Home Screen. From then on it opens from its icon, without this computer.

On this computer: http://localhost:${httpPort}/
`);

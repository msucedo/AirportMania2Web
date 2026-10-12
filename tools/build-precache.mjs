// Lists what a phone keeps to play offline, after `vite build`: writes dist/precache.json with
// every file of the build and a version made from their contents. Of the original pictures only
// those without an enlarged copy are listed, since the enlarged ones are what is drawn.
// Usage: node tools/build-precache.mjs [distDir]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const SKIP = new Set(['precache.json', 'sw.js', 'rootCA.pem']);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.startsWith('.') ? [] : [path];
  });
}

const enlargedList = join(dist, 'assets-hd', 'manifest.json');
const enlarged = new Set(existsSync(enlargedList) ? JSON.parse(readFileSync(enlargedList, 'utf8')).files.map((file) => `assets/${file}`) : []);

const hash = createHash('sha1');
let bytes = 0;
const files = [];
for (const path of walk(dist).sort()) {
  const name = relative(dist, path).split(sep).join('/');
  if (SKIP.has(name) || enlarged.has(name)) continue;
  hash.update(name).update(readFileSync(path));
  bytes += statSync(path).size;
  files.push(name);
}
const version = hash.digest('hex').slice(0, 12);
writeFileSync(join(dist, 'precache.json'), JSON.stringify({ version, bytes, files }));
// The worker carries the version, so that the browser sees a new one with every build.
const worker = join(dist, 'sw.js');
writeFileSync(worker, readFileSync(worker, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
console.log(`precache.json: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB, version ${version}${enlarged.size ? '' : ' (no enlarged pictures: the originals are kept)'}`);

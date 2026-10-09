// Imports the extracted game assets into the project:
//   - copies every file to public/assets/ (renaming .cgf, which are plain PNGs, to .png)
//   - flattens resources.xml into src/data/generated/resources.json
//   - converts the data XMLs into generic JSON trees under src/data/generated/
//
// Usage: node tools/import-assets.mjs [path-to-extracted-assets]

import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.resolve(
  process.argv[2] ?? process.env.AM2_ASSETS ?? path.join(os.homedir(), 'Desktop', 'AirportMania2_Assets'),
);
const publicRoot = path.join(projectRoot, 'public', 'assets');
const generatedRoot = path.join(projectRoot, 'src', 'data', 'generated');

if (!fs.existsSync(path.join(srcRoot, 'resources.xml'))) {
  console.error(`resources.xml not found under ${srcRoot}`);
  process.exit(1);
}

// ---------------------------------------------------------------- XML -> tree

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
});

// The files declare encodings like "ASCII" or "UNICODE" but are all UTF-8, most with a BOM.
function readXml(file, fixup = (text) => text) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return toNodes(parser.parse(fixup(text)));
}

// resources.xml ships with one <Surface ...> that is missing its closing slash, which would
// swallow the rest of the AIRPORT group. Surfaces are always leaves, so self-close them all.
let surfaceFixups = 0;
function closeSurfaces(text) {
  return text.replace(/<Surface\b[^<>]*>/g, (tag) => {
    if (tag.endsWith('/>')) return tag;
    surfaceFixups++;
    return `${tag.slice(0, -1)}/>`;
  });
}

// Node shape: { t: tag, a: attributes, c: children, x?: text }
function toNodes(items) {
  const out = [];
  for (const item of items) {
    const tag = Object.keys(item).find((k) => k !== ':@');
    if (tag === undefined || tag === '?xml') continue;
    if (tag === '#text') continue;
    const children = Array.isArray(item[tag]) ? item[tag] : [];
    const node = { t: tag, a: item[':@'] ?? {}, c: toNodes(children) };
    const text = children.filter((c) => '#text' in c).map((c) => String(c['#text'])).join('');
    if (text !== '') node.x = text;
    out.push(node);
  }
  return out;
}

// ---------------------------------------------------------------- copy files

const diskFiles = new Map(); // lower-cased relative path -> output relative path
function walk(dir, rel = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), r);
    else diskFiles.set(r.toLowerCase(), r);
  }
}
walk(srcRoot);

const outPathFor = (rel) => rel.replace(/\.cgf$/i, '.png');

fs.rmSync(publicRoot, { recursive: true, force: true });
fs.rmSync(generatedRoot, { recursive: true, force: true });
let copied = 0;
for (const rel of diskFiles.values()) {
  const dst = path.join(publicRoot, outPathFor(rel));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(srcRoot, rel), dst);
  copied++;
}

// ---------------------------------------------------------------- resources.xml

const isTrue = (v) => typeof v === 'string' && v.toLowerCase() === 'true';
const num = (v) => (v === undefined ? undefined : Number.parseFloat(v));
const joinPath = (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/').replace(/\/$/, '');
const joinName = (...parts) => parts.filter(Boolean).join('.');

const resources = { groups: {}, surfaces: {}, samples: {}, files: {}, fonts: {}, cachedFonts: {} };
const missing = [];
const duplicates = [];

function resolveFile(rel, id) {
  const hit = diskFiles.get(rel.toLowerCase());
  if (!hit) {
    missing.push({ id, file: rel });
    return null;
  }
  return outPathFor(hit);
}

function addUnique(table, id, value) {
  if (id in table) duplicates.push(id);
  table[id] = value;
}

function visit(node, ctx) {
  const a = node.a;
  switch (node.t) {
    case 'Group': {
      const group = { loads: [], surfaces: [], samples: [], files: [], fonts: [] };
      resources.groups[a.Name] = group;
      // Group names are load units only; they do not prefix resource identifiers.
      const inner = { group, dir: a.Directory ?? '', ns: '', atlas: null };
      for (const child of node.c) visit(child, inner);
      break;
    }
    case 'Load':
      ctx.group.loads.push(a.Group);
      break;
    case 'NameSpace': {
      const inner = { ...ctx, dir: joinPath(ctx.dir, a.Directory), ns: joinName(ctx.ns, a.Name) };
      for (const child of node.c) visit(child, inner);
      break;
    }
    case 'Atlas': {
      // Atlases only describe how the original engine packed textures; they are not part of names.
      const inner = { ...ctx, atlas: { name: a.Name ?? null, blending: a.Blending ?? 'ALPHA', format: a.Format } };
      for (const child of node.c) visit(child, inner);
      break;
    }
    case 'Surface': {
      const id = joinName(ctx.ns, a.Name);
      const file = resolveFile(joinPath(ctx.dir, a.File), id);
      const surface = {
        file,
        centered: isTrue(a.Centered),
        blending: a.Blending ?? ctx.atlas?.blending ?? 'ALPHA',
      };
      if (isTrue(a.NoClip)) surface.noClip = true;
      if (a.X !== undefined) surface.x = num(a.X);
      if (a.Y !== undefined) surface.y = num(a.Y);
      addUnique(resources.surfaces, id, surface);
      ctx.group.surfaces.push(id);
      break;
    }
    case 'Sample': {
      const id = joinName(ctx.ns, a.Name);
      const file = resolveFile(joinPath(ctx.dir, a.File), id);
      addUnique(resources.samples, id, { file, stream: a.Mode === 'STREAM_FROM_DISK' });
      ctx.group.samples.push(id);
      break;
    }
    case 'FileName': {
      const id = joinName(ctx.ns, a.Name);
      const file = resolveFile(joinPath(ctx.dir, a.File), id);
      (resources.files[id] ??= []).push({ file, ...(a.Language ? { language: a.Language } : {}) });
      ctx.group.files.push(id);
      break;
    }
    case 'FontTT': {
      const id = joinName(ctx.ns, a.Name);
      const file = resolveFile(joinPath(ctx.dir, a.File), id);
      (resources.fonts[id] ??= []).push({
        file,
        ascentFactor: num(a.AscentFactor),
        ...(a.Language ? { languages: a.Language.split(',') } : {}),
      });
      ctx.group.fonts.push(id);
      break;
    }
    case 'CachedFontTT': {
      const id = joinName(ctx.ns, a.Name);
      (resources.cachedFonts[id] ??= []).push({
        font: a.FontTT,
        height: num(a.Height),
        widthScale: num(a.WidthScale),
        extraKerning: num(a.ExtraKerning),
        effect: a.Effect,
        ...(a.Y !== undefined ? { y: num(a.Y) } : {}),
        ...(a.Center !== undefined ? { center: isTrue(a.Center) } : {}),
        ...(a.Language ? { languages: a.Language.split(',') } : {}),
      });
      break;
    }
    default:
      throw new Error(`Unhandled <${node.t}> in resources.xml`);
  }
}

const resourcesTree = readXml(path.join(srcRoot, 'resources.xml'), closeSurfaces);
const root = resourcesTree.find((n) => n.t === 'Resources');
for (const child of root.c) visit(child, null);

// ---------------------------------------------------------------- data XMLs

function writeJson(rel, value) {
  const dst = path.join(generatedRoot, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(value));
}

writeJson('resources.json', resources);

let converted = 0;
for (const rel of [...diskFiles.values()].sort()) {
  if (rel === 'resources.xml') continue;
  if (!/\.(xml|cfg)$/i.test(rel)) continue;
  if (rel.startsWith('data/languages/')) {
    // Languages become flat { id: text } tables; "&br;" is the engine's line break marker.
    const table = {};
    const collect = (nodes) => {
      for (const n of nodes) {
        if (n.t === 'String') table[n.a.Name] = (n.x ?? '').replaceAll('&br;', '\n');
        else collect(n.c);
      }
    };
    collect(readXml(path.join(srcRoot, rel)));
    writeJson(rel.replace(/\.xml$/i, '.json'), table);
  } else {
    writeJson(rel.replace(/\.(xml|cfg)$/i, '.json'), readXml(path.join(srcRoot, rel)));
  }
  converted++;
}

// ---------------------------------------------------------------- report

const count = (o) => Object.keys(o).length;
console.log(`source:      ${srcRoot}`);
console.log(`copied:      ${copied} files -> public/assets/`);
console.log(`converted:   ${converted} data files -> src/data/generated/`);
console.log(
  `resources:   ${count(resources.groups)} groups, ${count(resources.surfaces)} surfaces, ` +
    `${count(resources.samples)} samples, ${count(resources.files)} file ids, ${count(resources.fonts)} fonts`,
);
if (surfaceFixups) console.log(`repaired:    ${surfaceFixups} unclosed <Surface> tag(s) in resources.xml`);
if (duplicates.length) console.log(`duplicate ids (last definition wins): ${duplicates.length}`, duplicates.slice(0, 10));
if (missing.length) {
  console.log(`unresolved files: ${missing.length}`);
  for (const m of missing) console.log(`  ${m.id} -> ${m.file}`);
}

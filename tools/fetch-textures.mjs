// Downloads CC0 PBR textures from Poly Haven and converts them to WebP for the web build.
// Usage: node tools/fetch-textures.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fetch, EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(new EnvHttpProxyAgent({ connectTimeout: 30000 }));
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public/textures');

// slug -> [output name, max size]
const TEXTURES = {
  decrepit_wallpaper: ['wallpaper', 1024],
  old_wooden_floor_02: ['woodfloor', 1024],
  old_linoleum_flooring_01: ['linoleum', 1024],
  ceiling_interior: ['ceiling', 512],
  concrete_floor_worn_001: ['concrete', 1024],
  rustic_stone_wall: ['stonewall', 1024],
  dark_wood: ['darkwood', 512],
  weathered_planks: ['porch', 512],
  dirty_carpet: ['carpet', 512],
  wood_table_worn: ['table', 512],
  rusty_metal_02: ['rust', 512],
  weathered_plank_siding: ['siding', 512],
};
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', arm: 'arm' };

await fs.mkdir(OUT, { recursive: true });
for (const [slug, [name, size]] of Object.entries(TEXTURES)) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${slug}`)).json();
  for (const [key, suffix] of Object.entries(MAPS)) {
    const out = path.join(OUT, `${name}_${suffix}.webp`);
    try { await fs.access(out); continue; } catch {}
    const url = files[key]['1k'].jpg.url;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await sharp(buf).resize(size, size).webp({ quality: suffix === 'diff' ? 82 : 88 }).toFile(out);
    console.log('saved', path.relative(ROOT, out));
  }
}

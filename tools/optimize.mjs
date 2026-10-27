// Turns the raw Meshy downloads in assets_raw/ into web-ready files in public/models/:
// WebP textures at game-appropriate sizes and meshopt-compressed geometry.
// Animation-only files keep just the skeleton nodes and clips.
// Usage: node tools/optimize.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RAW = path.join(ROOT, 'assets_raw');
const OUT = path.join(ROOT, 'public/models');

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// name -> max texture size
const MODELS = {
  altar: 1024, crt_tv: 1024, desk: 1024, doll: 1024, fridge: 1024, furnace: 1024,
  fuse_box: 1024, grandfather_clock: 1024, music_box: 512, pocket_watch: 512,
  rocking_chair: 1024, safe: 1024, sofa: 1024, tube_radio: 1024,
  bookshelf: 1024, dining_table: 1024, dining_chair: 512, stove: 1024, kitchen_counter: 1024,
  fireplace: 1024, transmitter: 1024, valve: 512, fuse: 256, basement_shelf: 1024, barrel: 512,
  coat_rack: 512, portrait: 1024, floor_lamp: 512, skeleton_key: 256, pendant_lamp: 512,
  front_door: 1024, phone_table: 512, radio_head: 512,
  player_a_rigged: 1024, player_b_rigged: 1024, player_c_rigged: 1024, player_d_rigged: 1024,
  listener2b_rigged: 1024,
};
const CHARS = ['player_a', 'player_b', 'player_c', 'player_d', 'listener2b'];
const ANIMS = CHARS.flatMap((c) => [`${c}_walk`, `${c}_run`, `${c}_anims`]);

await fs.mkdir(OUT, { recursive: true });

for (const [name, size] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(RAW, `${name}.glb`));
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = path.join(OUT, `${name.replace('_rigged', '')}.glb`);
  await io.write(out, doc);
  console.log(path.basename(out), ((await fs.stat(out)).size / 1e6).toFixed(2), 'MB');
}

for (const name of ANIMS) {
  const doc = await io.read(path.join(RAW, `${name}.glb`));
  const root = doc.getRoot();
  for (const node of root.listNodes()) { node.setMesh(null); node.setSkin(null); }
  for (const list of [root.listMeshes(), root.listSkins(), root.listMaterials(), root.listTextures()]) {
    for (const item of list) item.dispose();
  }
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  console.log(path.basename(out), ((await fs.stat(out)).size / 1e3).toFixed(0), 'KB');
}

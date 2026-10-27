import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import fs from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort()) {
  const doc = await io.read(`${dir}/${f}`);
  const root = doc.getRoot();
  const b = getBounds(root.listScenes()[0]);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  const tris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  const tex = root.listTextures().map(t => `${t.getSize()?.join('x')}`).join(',');
  const anims = root.listAnimations().map(a => `${a.getName()}(${a.listChannels().length}ch)`).join(',');
  const skins = root.listSkins().map(s => s.listJoints().length + 'j').join(',');
  const mats = root.listMaterials().map(m => m.getName()).join(',');
  console.log(f, 'size', size, 'min', b.min.map(v => +v.toFixed(2)), 'tris', tris, 'tex', tex, 'anims', anims, 'skins', skins, 'mats', mats);
}

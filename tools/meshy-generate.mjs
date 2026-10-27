// Generates the game's 3D assets with the Meshy API (meshy-t2.5 smart topology).
// Usage: MESHY_API_KEY=msy_... node tools/meshy-generate.mjs [assetName ...]
// Task ids are saved to tools/meshy-state.json so an interrupted run resumes
// without paying twice. The API key is only read from the environment.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch, EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

// Honor HTTPS_PROXY / HTTP_PROXY like curl does (Node's fetch ignores them).
setGlobalDispatcher(new EnvHttpProxyAgent({ connectTimeout: 30000 }));

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STATE_FILE = path.join(ROOT, 'tools/meshy-state.json');
const OUT_DIR = path.join(ROOT, 'assets_raw');
const API = 'https://api.meshy.ai/openapi';
const KEY = process.env.MESHY_API_KEY;
if (!KEY) throw new Error('Set MESHY_API_KEY');

const assets = JSON.parse(await fs.readFile(path.join(ROOT, 'tools/assets.json'), 'utf8'));
const only = process.argv.slice(2);
let state = {};
try { state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch {}
const save = () => fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function api(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + url, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 20) { await sleep(5000); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text}`);
    return JSON.parse(text);
  }
}

async function waitTask(kind, id, label) {
  let last = -1;
  for (;;) {
    const t = await api('GET', `${kind}/${id}`);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') {
      throw new Error(`${label} ${t.status}: ${JSON.stringify(t.task_error)}`);
    }
    if (t.progress !== last) { log(label, t.status, `${t.progress}%`); last = t.progress; }
    await sleep(8000);
  }
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${file} -> ${res.status}`);
  await fs.writeFile(path.join(OUT_DIR, file), Buffer.from(await res.arrayBuffer()));
  log('saved', file);
}

async function generate(a) {
  const s = (state[a.name] ??= {});
  if (!s.preview) {
    const r = await api('POST', '/v2/text-to-3d', {
      mode: 'preview',
      prompt: a.prompt,
      model_type: 'smart-topology',
      ai_model: 'meshy-t2.5',
      target_polycount: a.polycount,
      pose_mode: a.pose ?? '',
      target_formats: ['glb'],
    });
    s.preview = r.result; await save();
    log(a.name, 'preview task', s.preview);
  }
  const preview = await waitTask('/v2/text-to-3d', s.preview, `${a.name}:preview`);
  if (a.previewOnly) {
    // Untextured candidate: save the thumbnail so a human can pick before paying for texture + rig.
    if (!s.previewThumb && preview.thumbnail_url) {
      await download(preview.thumbnail_url, `${a.name}_preview.png`);
      s.previewThumb = true; await save();
    }
    log(a.name, 'PREVIEW ONLY');
    return;
  }

  if (!s.refine) {
    const r = await api('POST', '/v2/text-to-3d', {
      mode: 'refine',
      preview_task_id: s.preview,
      enable_pbr: true,
      texture_resolution: '2k',
      texture_prompt: a.texture,
      target_formats: ['glb'],
    });
    s.refine = r.result; await save();
    log(a.name, 'refine task', s.refine);
  }
  const refined = await waitTask('/v2/text-to-3d', s.refine, `${a.name}:refine`);
  if (!s.downloaded) {
    await download(refined.model_urls.glb, `${a.name}.glb`);
    if (refined.thumbnail_url) await download(refined.thumbnail_url, `${a.name}.png`);
    s.downloaded = true; await save();
  }

  if (a.rig) {
    if (!s.rig) {
      const r = await api('POST', '/v1/rigging', { input_task_id: s.refine, height_meters: a.height });
      s.rig = r.result; await save();
      log(a.name, 'rig task', s.rig);
    }
    const rig = await waitTask('/v1/rigging', s.rig, `${a.name}:rig`);
    if (!s.rigDownloaded) {
      await download(rig.result.rigged_character_glb_url, `${a.name}_rigged.glb`);
      const anims = rig.result.basic_animations ?? {};
      if (anims.walking_glb_url) await download(anims.walking_glb_url, `${a.name}_walk.glb`);
      if (anims.running_glb_url) await download(anims.running_glb_url, `${a.name}_run.glb`);
      s.rigDownloaded = true; await save();
    }
    if (a.anims?.length) {
      // One task returns a single GLB with one clip per action, in order.
      if (!s.anim) {
        const r = await api('POST', '/v1/animations', { rig_task_id: s.rig, action_ids: a.anims });
        s.anim = r.result; await save();
        log(a.name, 'animation task', s.anim);
      }
      const anim = await waitTask('/v1/animations', s.anim, `${a.name}:anims`);
      if (!s.animDownloaded) {
        await download(anim.result.animation_glb_url, `${a.name}_anims.glb`);
        s.animDownloaded = true; await save();
      }
    }
  }
  log(a.name, 'DONE');
}

const queue = assets.filter((a) => (only.length ? only.includes(a.name) : !a.retired));
const failures = [];
async function worker() {
  while (queue.length) {
    const a = queue.shift();
    try { await generate(a); } catch (e) { failures.push(a.name); log('ERROR', a.name, e.message); }
  }
}
// The default Pro plan allows 10 concurrent tasks.
await Promise.all(Array.from({ length: 8 }, worker));
const bal = await api('GET', '/v1/balance');
log('finished; failures:', failures.join(', ') || 'none', '; balance:', bal.balance);

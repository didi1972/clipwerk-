// Bündelt alle KI-Bibliotheken lokal nach <out>, damit die Desktop-App keinen Code aus dem Netz lädt.
// Aufruf: node build.mjs <ausgabeordner>
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = path.join(here, 'node_modules');
const out = path.resolve(process.argv[2] || path.join(here, '../../build/lib'));
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
fs.rmSync(out, { recursive: true, force: true });

// 1) MediaPipe (Personen freistellen) + Modell
const mp = path.join(nm, '@mediapipe/tasks-vision');
cp(path.join(mp, 'vision_bundle.mjs'), path.join(out, 'mediapipe/vision_bundle.mjs'));
// Electron (Chromium) unterstützt immer WASM-SIMD → keine Nicht-SIMD-Variante nötig
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'])
  cp(path.join(mp, 'wasm', f), path.join(out, 'mediapipe/wasm', f));
cp(path.join(here, 'models/selfie_segmenter.tflite'), path.join(out, 'mediapipe/selfie_segmenter.tflite'));

// 2) RNNoise (Rauschunterdrückung, WASM bereits eingebettet)
cp(path.join(nm, '@shiguredo/rnnoise-wasm/dist/rnnoise.js'), path.join(out, 'rnnoise/rnnoise.js'));

// 3) transformers.js (Whisper) – nur WASM-Backend, ohne WebGPU (kleiner, stabiler)
await build({
  stdin: { contents: "export { pipeline, env } from '@huggingface/transformers';", resolveDir: here },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  alias: { 'onnxruntime-web/webgpu': 'onnxruntime-web' },
  outfile: path.join(out, 'transformers/transformers.mjs'), logLevel: 'warning',
});
const ortT = path.join(nm, '@huggingface/transformers/node_modules/onnxruntime-web/dist');
const ortTDir = fs.existsSync(ortT) ? ortT : path.join(nm, 'onnxruntime-web/dist');
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) cp(path.join(ortTDir, f), path.join(out, 'ort/', f));

// 4) Piper (Offline-Stimme) – CDN-Adressen auf lokale Dateien umbiegen
const vits = path.join(nm, '@diffusionstudio/vits-web/dist');
await build({
  entryPoints: [path.join(vits, 'vits-web.js')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  outfile: path.join(out, 'piper/vits-web.mjs'), logLevel: 'warning',
  plugins: [{ name: 'node-stubs', setup(b) { b.onResolve({ filter: /^(fs|path|crypto|worker_threads|url)$/ }, a => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {};', loader: 'js' })); } }],
});
let code = fs.readFileSync(path.join(out, 'piper/vits-web.mjs'), 'utf8');
const swaps = [
  ['https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/', '/lib/ort18/'],
  ['https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize', '/lib/piper/piper_phonemize'],
];
for (const [a, b] of swaps) { if (!code.includes(a)) throw new Error('Adresse nicht gefunden: ' + a); code = code.split(a).join(b); }
fs.writeFileSync(path.join(out, 'piper/vits-web.mjs'), code);
const pw = path.join(nm, '@diffusionstudio/piper-wasm/build');
for (const f of fs.readdirSync(pw)) if (/^piper_phonemize\.(js|wasm|data)$/.test(f)) cp(path.join(pw, f), path.join(out, 'piper', f));
// Ohne Cross-Origin-Isolation läuft ORT einfädig → nur die Varianten ohne Threads
const ort18 = path.join(nm, 'onnxruntime-web/dist');
for (const f of fs.readdirSync(ort18)) if (/^ort-wasm(-simd)?\.wasm$/.test(f)) cp(path.join(ort18, f), path.join(out, 'ort18', f));

const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log('Bibliotheken gebündelt:', out, Math.round(size(out) / 1e6), 'MB');

// Copies the OCR engine and English model into public/ocr so the app can
// run Tesseract fully offline (nothing is loaded from a CDN).
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const out = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'ocr')
mkdirSync(out, { recursive: true })

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`))
const files = [
  [join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), 'worker.min.js'],
  // SIMD + LSTM build: supported by every current Android Chrome / iOS Safari
  [join(pkgDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
]
for (const [from, name] of files) copyFileSync(from, join(out, name))
console.log(`OCR files copied to ${out}`)

// zxing-cpp compiled to WebAssembly. Reads small / soft 1D codes far better
// than the pure-JS ZXing port and finds every code in an image in one call.
// The .wasm file is bundled (no CDN), so it works offline.
import { prepareZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import type { BarcodeFormatName } from '../config'
import type { Rect } from './geometry'

const TO_WASM: Record<BarcodeFormatName, NonNullable<ReaderOptions['formats']>[number]> = {
  code_128: 'Code128',
  code_39: 'Code39',
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPCA',
  upc_e: 'UPCE',
  itf: 'ITF',
}
const FROM_WASM: Record<string, BarcodeFormatName> = Object.fromEntries(
  Object.entries(TO_WASM).map(([ours, theirs]) => [theirs, ours as BarcodeFormatName]),
)

let ready: Promise<unknown> | null = null

export function loadWasmReader(): Promise<unknown> {
  if (!ready) {
    ready = prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      },
      fireImmediately: true,
    })
    ready.catch(() => {
      ready = null
    })
  }
  return ready
}

export interface WasmCode {
  value: string
  format?: BarcodeFormatName
  box: Rect
  /** For picking the code under the reticle center. */
  center: { x: number; y: number }
}

function toCode(r: ReadResult): WasmCode {
  const p = r.position
  const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x]
  const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y]
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const width = Math.max(...xs) - x
  const height = Math.max(...ys) - y
  const center = { x: x + width / 2, y: y + height / 2 }
  // 1D results are often a thin line through the code; give the box some body
  const box =
    height < width * 0.2
      ? { x, y: center.y - width * 0.15, width, height: width * 0.3 }
      : width < height * 0.2
        ? { x: center.x - height * 0.15, y, width: height * 0.3, height }
        : { x, y, width, height }
  return { value: r.text, format: FROM_WASM[r.format], box, center }
}

export async function readCodes(
  image: ImageData,
  formats: BarcodeFormatName[],
  minLength: number,
  thorough = true,
): Promise<WasmCode[]> {
  await loadWasmReader()
  const results = await readBarcodes(image, {
    formats: formats.map((f) => TO_WASM[f]),
    tryHarder: thorough,
    tryRotate: thorough,
    tryInvert: false,
    tryDownscale: true,
    maxNumberOfSymbols: 32,
  })
  return results.filter((r) => r.isValid && r.text.length >= minLength).map(toCode)
}

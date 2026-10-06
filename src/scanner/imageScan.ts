// Barcode search in still images, on plain luminance buffers so it can run in
// a Web Worker (and in unit tests) without any DOM.
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  RGBLuminanceSource,
} from '@zxing/library'
import type { BarcodeFormatName } from '../config'
import type { Rect } from './geometry'

export interface ImageBarcode {
  value: string
  format?: BarcodeFormatName
  box: Rect
}

export interface ScanOptions {
  formats: BarcodeFormatName[]
  minLength: number
  /** Also scan an unsharp-masked copy (soft or tiny codes). */
  sharpened: boolean
  /** Also scan the image turned 90°, for labels stuck on sideways. */
  sideways: boolean
  /** Band height as a fraction of image height. */
  bandFraction: number
}

export const TO_ZXING: Record<BarcodeFormatName, BarcodeFormat> = {
  code_128: BarcodeFormat.CODE_128,
  code_39: BarcodeFormat.CODE_39,
  ean_13: BarcodeFormat.EAN_13,
  ean_8: BarcodeFormat.EAN_8,
  upc_a: BarcodeFormat.UPC_A,
  upc_e: BarcodeFormat.UPC_E,
  itf: BarcodeFormat.ITF,
}

export function rgbaToLuminance(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const lum = new Uint8ClampedArray(w * h)
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (rgba[j] + 2 * rgba[j + 1] + rgba[j + 2]) >> 2
  return lum
}

/**
 * Unsharp mask (box blur, radius r). Phone photos of small labels are soft;
 * this brings thin bars back and made the difference between "nothing" and
 * a read in tests.
 */
export function sharpen(lum: Uint8ClampedArray, w: number, h: number, r = 2, amount = 2.5): Uint8ClampedArray {
  const tmp = new Float32Array(w * h)
  const blur = new Float32Array(w * h)
  const win = 2 * r + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let x = -r; x <= r; x++) acc += lum[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win
      acc += lum[row + Math.min(w - 1, x + r + 1)] - lum[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      blur[y * w + x] = acc / win
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0; i < out.length; i++) out[i] = lum[i] + amount * (lum[i] - blur[i])
  return out
}

/** Clockwise 90° turn: (x, y) -> (h - 1 - y, x). */
export function rotate90(lum: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = lum[y * w + x]
  return out
}

/**
 * ZXing's 1D reader returns one code per call, so the image is read in
 * overlapping horizontal bands, and each band also in left / right parts.
 * That finds every code on a label, including small ones next to big ones.
 */
function scanBands(
  lum: Uint8ClampedArray,
  w: number,
  h: number,
  opts: ScanOptions,
  toImage: (x: number, y: number) => { x: number; y: number },
  found: Map<string, ImageBarcode>,
) {
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, opts.formats.map((f) => TO_ZXING[f])]])
  const reader = new MultiFormatOneDReader(hints)
  const fromZxing = new Map(opts.formats.map((f) => [TO_ZXING[f], f]))
  const band = Math.max(48, Math.round(h * opts.bandFraction))
  const cols: [number, number][] = [
    [0, w],
    [0, Math.round(w * 0.6)],
    [Math.round(w * 0.4), w - Math.round(w * 0.4)],
  ]
  for (let top = 0; top < h; top += Math.round(band / 2)) {
    const bh = Math.min(band, h - top)
    if (bh < 16) break
    for (const [left, cw] of cols) {
      try {
        const src = new RGBLuminanceSource(lum, cw, bh, w, h, left, top)
        const r = reader.decode(new BinaryBitmap(new HybridBinarizer(src)), hints)
        const value = r.getText()
        if (found.has(value) || value.length < opts.minLength) continue
        const pts = r.getResultPoints().map((p) => toImage(left + p.getX(), top + p.getY()))
        const xs = pts.map((p) => p.x)
        const ys = pts.map((p) => p.y)
        const x0 = Math.min(...xs)
        const y0 = Math.min(...ys)
        const vertical = Math.max(...ys) - y0 > Math.max(...xs) - x0
        const len = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 30)
        found.set(value, {
          value,
          format: fromZxing.get(r.getBarcodeFormat()),
          box: vertical
            ? { x: x0 - len * 0.15, y: y0, width: len * 0.3, height: len }
            : { x: x0, y: y0 - len * 0.15, width: len, height: len * 0.3 },
        })
      } catch {
        // nothing in this piece
      } finally {
        reader.reset()
      }
    }
  }
}

export function scanImage(lum: Uint8ClampedArray, w: number, h: number, opts: ScanOptions): ImageBarcode[] {
  const found = new Map<string, ImageBarcode>()
  const same = (x: number, y: number) => ({ x, y })
  scanBands(lum, w, h, opts, same, found)
  if (opts.sharpened) scanBands(sharpen(lum, w, h), w, h, opts, same, found)
  if (opts.sideways) {
    // rotated image is h wide, w tall; map back with the inverse of rotate90
    scanBands(rotate90(lum, w, h), h, w, opts, (x, y) => ({ x: y, y: h - 1 - x }), found)
  }
  return [...found.values()]
}

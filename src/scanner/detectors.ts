import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  RGBLuminanceSource,
} from '@zxing/library'
import type { BarcodeFormatName } from '../config'
import { centerOf, type Point, type Rect } from './geometry'
import { pickCandidate, type Candidate, type Detection } from './pick'

export type { Detection }

export interface FrameDetector {
  readonly name: string
  /** Returns the best code whose center lies inside `roi` (video pixel coords). */
  detect(video: HTMLVideoElement, roi: Rect): Promise<Detection | null>
}

// ---------- Native BarcodeDetector (Android Chrome, uses on-device ML Kit) ----------

interface NativeBarcode {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
  cornerPoints: Point[]
}
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<NativeBarcode[]>
}
interface NativeDetectorCtor {
  new (opts?: { formats: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

function nativeCtor(): NativeDetectorCtor | null {
  const ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}

class NativeFrameDetector implements FrameDetector {
  readonly name = 'native'
  constructor(private detector: NativeDetector) {}

  async detect(video: HTMLVideoElement, roi: Rect): Promise<Detection | null> {
    const codes = await this.detector.detect(video)
    const cands: Candidate[] = codes
      .filter((c) => c.rawValue)
      .map((c) => ({
        value: c.rawValue,
        format: c.format as BarcodeFormatName,
        center: c.cornerPoints?.length
          ? centerOf(c.cornerPoints)
          : {
              x: c.boundingBox.x + c.boundingBox.width / 2,
              y: c.boundingBox.y + c.boundingBox.height / 2,
            },
        area: c.boundingBox.width * c.boundingBox.height,
      }))
    const best = pickCandidate(cands, roi)
    return best ? { value: best.value, format: best.format } : null
  }
}

// ---------- ZXing fallback (iOS, desktop, phones without the native API) ----------

const TO_ZXING: Record<BarcodeFormatName, BarcodeFormat> = {
  code_128: BarcodeFormat.CODE_128,
  code_39: BarcodeFormat.CODE_39,
  ean_13: BarcodeFormat.EAN_13,
  ean_8: BarcodeFormat.EAN_8,
  upc_a: BarcodeFormat.UPC_A,
  upc_e: BarcodeFormat.UPC_E,
  itf: BarcodeFormat.ITF,
}

const MAX_CROP_WIDTH = 1280

class ZxingFrameDetector implements FrameDetector {
  readonly name = 'zxing'
  private reader: MultiFormatOneDReader
  private hints = new Map<DecodeHintType, unknown>()
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  private fromZxing = new Map<BarcodeFormat, BarcodeFormatName>()

  constructor(formats: BarcodeFormatName[]) {
    // all supported formats are 1D, so the 1D reader is enough (and quieter
    // than MultiFormatReader, which console.warns on every empty frame)
    this.hints.set(
      DecodeHintType.POSSIBLE_FORMATS,
      formats.map((f) => TO_ZXING[f]),
    )
    this.hints.set(DecodeHintType.TRY_HARDER, true)
    this.reader = new MultiFormatOneDReader(this.hints)
    for (const f of formats) this.fromZxing.set(TO_ZXING[f], f)
  }

  async detect(video: HTMLVideoElement, roi: Rect): Promise<Detection | null> {
    if (roi.width < 10 || roi.height < 10) return null
    // Only the reticle area is decoded, so codes outside it can never win.
    // ZXing's 1D readers scan rows starting from the middle, which also
    // favours the code closest to the reticle center.
    const scale = Math.min(1, MAX_CROP_WIDTH / roi.width)
    const w = Math.round(roi.width * scale)
    const h = Math.round(roi.height * scale)
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    this.ctx.drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, w, h)
    const rgba = this.ctx.getImageData(0, 0, w, h).data
    const lum = new Uint8ClampedArray(w * h)
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
      lum[i] = (rgba[j] + 2 * rgba[j + 1] + rgba[j + 2]) >> 2
    }
    try {
      // plain luminance source: no 90° rotation attempts, the reticle is horizontal anyway
      const source = new RGBLuminanceSource(lum, w, h)
      const result = this.reader.decode(new BinaryBitmap(new HybridBinarizer(source)), this.hints)
      return { value: result.getText(), format: this.fromZxing.get(result.getBarcodeFormat()) }
    } catch {
      return null // NotFound / Checksum / Format: nothing readable this frame
    } finally {
      this.reader.reset()
    }
  }
}

export async function createDetector(formats: BarcodeFormatName[]): Promise<FrameDetector> {
  const Native = nativeCtor()
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      const usable = formats.filter((f) => supported.includes(f))
      if (usable.length > 0) return new NativeFrameDetector(new Native({ formats: usable }))
    } catch {
      // fall through to ZXing
    }
  }
  return new ZxingFrameDetector(formats)
}

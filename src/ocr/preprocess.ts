import type { Rect } from '../scanner/geometry'

export const LINE_BORDER = 20

function boxBlur(lum: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return lum
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
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
      out[y * w + x] = acc / win
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

export interface CleanOptions {
  /** Height the crop is enlarged to. */
  targetHeight: number
  /**
   * Extra horizontal stretch. The shell print is a very narrow, tall inkjet
   * font; widened 2x it reads like a normal font (tested on 3 shell photos).
   */
  stretch?: number
  /** Pixels darker than mean * threshold become black. */
  threshold?: number
}

/**
 * Turns a crop into clean black-on-white text for Tesseract: enlarged, blurred
 * a little (joins the dots of dot-matrix / inkjet prints like "Serial no.:
 * 839662" on the shells) and thresholded, with a white border around it.
 * Returns the canvas and the scales used, to map word boxes back.
 */
export function cleanTextCrop(
  src: CanvasImageSource,
  rect: Rect,
  { targetHeight, stretch = 1, threshold: thresholdFactor = 0.85 }: CleanOptions,
): { canvas: HTMLCanvasElement; scaleX: number; scaleY: number } {
  const scale = Math.max(1, Math.min(5, targetHeight / rect.height))
  const scaleX = scale * stretch
  const w = Math.max(1, Math.round(rect.width * scaleX))
  const h = Math.max(1, Math.round(rect.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w + 2 * LINE_BORDER
  canvas.height = h + 2 * LINE_BORDER
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height, LINE_BORDER, LINE_BORDER, w, h)

  const img = ctx.getImageData(LINE_BORDER, LINE_BORDER, w, h)
  const d = img.data
  let lum: Float32Array = new Float32Array(w * h)
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (d[j] + 2 * d[j + 1] + d[j + 2]) / 4
  lum = boxBlur(lum, w, h, Math.round(scale * 0.5))
  let sum = 0
  for (const v of lum) sum += v
  const threshold = (sum / lum.length) * thresholdFactor
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    const v = lum[i] > threshold ? 255 : 0
    d[j] = d[j + 1] = d[j + 2] = v
    d[j + 3] = 255
  }
  ctx.putImageData(img, LINE_BORDER, LINE_BORDER)
  return { canvas, scaleX, scaleY: scale }
}

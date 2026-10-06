import { scanConfig } from '../config'
import { recognize } from '../ocr/engine'
import { asNumber } from '../ocr/extract'
import type { InputMethod, SerialKind } from '../lib/types'
import { detectBarcodesInImage } from '../scanner/detectors'
import type { Point, Rect } from '../scanner/geometry'

export interface PhotoHit {
  value: string
  method: InputMethod
  /** In photo pixel coordinates. */
  box: Rect
  /** What the app would pick on its own. */
  suggested?: boolean
}

const MAX_SIDE = 2000
const MIN_DIGITS = 5

/** Loads a photo into a canvas, EXIF rotation applied, scaled to a sane size. */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas
}

interface Word {
  text: string
  box: Rect
}

function wordsOf(
  data: Awaited<ReturnType<typeof recognize>>['data'],
  offset: Point = { x: 0, y: 0 },
  scale = 1,
): Word[] {
  const words: Word[] = []
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const w of line.words) {
          const b = w.bbox
          words.push({
            text: w.text,
            box: {
              x: offset.x + b.x0 / scale,
              y: offset.y + b.y0 / scale,
              width: (b.x1 - b.x0) / scale,
              height: (b.y1 - b.y0) / scale,
            },
          })
        }
      }
    }
  }
  return words
}

function numberHits(words: Word[]): PhotoHit[] {
  const hits: PhotoHit[] = []
  for (const w of words) {
    const n = asNumber(w.text)
    if (n && n.length >= MIN_DIGITS) hits.push({ value: n, method: 'ocr', box: w.box })
  }
  return hits
}

/** Same printed row: vertical centers close, number to the right of the label word. */
function sameRow(label: Rect, num: Rect): boolean {
  const dy = Math.abs(label.y + label.height / 2 - (num.y + num.height / 2))
  return dy < Math.max(label.height, num.height) * 0.8 && num.x > label.x
}

/**
 * Marks the number printed in the same row as the anchor word (e.g. "Production
 * Order"). Only an unambiguous match is suggested; numbers in skipped rows
 * (Item Number etc.) never are.
 */
function markSuggested(words: Word[], hits: PhotoHit[], kind: SerialKind) {
  const rule = scanConfig.ocr[kind]
  if (!rule.anchor) return
  const anchor = new RegExp(rule.anchor, 'i')
  const skip = rule.skip ? new RegExp(rule.skip, 'i') : null
  const anchors = words.filter((w) => anchor.test(w.text))
  const skips = skip ? words.filter((w) => skip.test(w.text) && !anchor.test(w.text)) : []
  const re = new RegExp(rule.pattern)
  const candidates = hits.filter(
    (h) =>
      re.test(h.value) &&
      anchors.some((a) => sameRow(a.box, h.box)) &&
      !skips.some((sk) => sameRow(sk.box, h.box)),
  )
  const values = new Set(candidates.map((c) => c.value))
  if (values.size === 1) for (const c of candidates) c.suggested = true
}

/** Grayscale + contrast copy; this was the most stable input for Tesseract in tests. */
function prepared(canvas: HTMLCanvasElement, maxSide: number, filter: string): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height))
  const c = document.createElement('canvas')
  c.width = Math.round(canvas.width * scale)
  c.height = Math.round(canvas.height * scale)
  const ctx = c.getContext('2d')!
  ctx.filter = filter
  ctx.drawImage(canvas, 0, 0, c.width, c.height)
  return c
}

async function ocrPass(canvas: HTMLCanvasElement, maxSide: number, filter: string): Promise<Word[]> {
  const img = prepared(canvas, maxSide, filter)
  const { data } = await recognize(img, 'sparse', true)
  return wordsOf(data, { x: 0, y: 0 }, img.width / canvas.width)
}

/** Barcodes and every number-like word on the photo, as tappable boxes. */
export async function analyzePhoto(canvas: HTMLCanvasElement, kind: SerialKind): Promise<PhotoHit[]> {
  const barcodes = await detectBarcodesInImage(canvas, scanConfig.formats)
  const hits: PhotoHit[] = barcodes.map((b) => ({ value: b.value, method: 'barcode', box: b.box }))

  let words = await ocrPass(canvas, MAX_SIDE, 'grayscale(1) contrast(1.4)')
  let textHits = numberHits(words)
  markSuggested(words, textHits, kind)
  if (!textHits.some((h) => h.suggested)) {
    // OCR on a whole photo is touchy; a second look at another scale often fixes it
    const more = await ocrPass(canvas, 1600, 'grayscale(1) contrast(1.4)')
    words = [...words, ...more]
    const extra = numberHits(more).filter((h) => !textHits.some((t) => t.value === h.value))
    textHits = [...textHits, ...extra]
    for (const h of textHits) h.suggested = false
    markSuggested(words, textHits, kind)
  }
  return [...hits, ...textHits]
}

/**
 * The user tapped a spot where the app found nothing: read a strip of the
 * photo around that point, enlarged, which often works when the full photo did not.
 */
export async function readAround(canvas: HTMLCanvasElement, p: Point): Promise<PhotoHit[]> {
  const w = Math.min(canvas.width, Math.max(300, canvas.width * 0.45))
  const h = Math.min(canvas.height, Math.max(80, canvas.height * 0.09))
  const x = Math.max(0, Math.min(canvas.width - w, p.x - w / 2))
  const y = Math.max(0, Math.min(canvas.height - h, p.y - h / 2))
  const scale = Math.min(3, 1400 / w)
  const strip = document.createElement('canvas')
  strip.width = Math.round(w * scale)
  strip.height = Math.round(h * scale)
  const ctx = strip.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.4)'
  ctx.drawImage(canvas, x, y, w, h, 0, 0, strip.width, strip.height)
  const { data } = await recognize(strip, 'block', true)
  const hits = numberHits(wordsOf(data, { x, y }, scale))
  // closest to the finger first
  const dist = (r: Rect) => Math.hypot(r.x + r.width / 2 - p.x, r.y + r.height / 2 - p.y)
  return hits.sort((a, b) => dist(a.box) - dist(b.box))
}

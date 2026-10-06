import { scanConfig } from '../config'
import { recognize } from '../ocr/engine'
import { cleanTextCrop, LINE_BORDER } from '../ocr/preprocess'
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

// barcodes on a label are small, so keep plenty of pixels (OCR downsizes itself)
const MAX_SIDE = 3200
const OCR_SIDE = 2000
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

/** Step 1 (fast): every barcode on the photo. */
export async function findBarcodes(
  canvas: HTMLCanvasElement,
  onProgress?: (hits: PhotoHit[]) => void,
): Promise<PhotoHit[]> {
  const toHits = (codes: { value: string; box: Rect }[]): PhotoHit[] =>
    codes.map((b) => ({ value: b.value, method: 'barcode', box: b.box }))
  const barcodes = await detectBarcodesInImage(canvas, scanConfig.formats, false, (c) => onProgress?.(toHits(c)))
  return toHits(barcodes)
}

/** Step 2 (slower): number-like words, with the anchored one marked as suggested. */
export async function findNumbers(canvas: HTMLCanvasElement, kind: SerialKind): Promise<PhotoHit[]> {
  let words = await ocrPass(canvas, OCR_SIDE, 'grayscale(1) contrast(1.4)')
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
  return textHits
}

/** Barcode right under the finger: a wide band around the tap, enlarged if small. */
async function barcodesAround(canvas: HTMLCanvasElement, p: Point): Promise<PhotoHit[]> {
  const w = Math.min(canvas.width, Math.max(300, canvas.width * 0.4))
  const h = Math.min(canvas.height, w * 0.35)
  const x = Math.max(0, Math.min(canvas.width - w, p.x - w / 2))
  const y = Math.max(0, Math.min(canvas.height - h, p.y - h / 2))
  // enlarge: together with sharpening this gives thin bars enough pixels
  const scale = Math.max(1.5, Math.min(2.5, 1600 / w))
  const crop = document.createElement('canvas')
  crop.width = Math.round(w * scale)
  crop.height = Math.round(h * scale)
  crop.getContext('2d', { willReadFrequently: true })!.drawImage(canvas, x, y, w, h, 0, 0, crop.width, crop.height)
  const codes = await detectBarcodesInImage(crop, scanConfig.formats, true)
  const dist = (r: Rect) => Math.hypot(r.x + r.width / 2 - p.x, r.y + r.height / 2 - p.y)
  return codes
    .map((c) => ({
      value: c.value,
      method: 'barcode' as const,
      box: { x: x + c.box.x / scale, y: y + c.box.y / scale, width: c.box.width / scale, height: c.box.height / scale },
    }))
    .sort((a, b) => dist(a.box) - dist(b.box))
}

/**
 * The user tapped a spot where the app found nothing: read a strip of the
 * photo around that point, enlarged, which often works when the full photo did not.
 */
export async function readAround(canvas: HTMLCanvasElement, p: Point): Promise<PhotoHit[]> {
  // barcode and text are looked for at the same time; a barcode wins
  const [codes, text] = await Promise.all([
    barcodesAround(canvas, p).catch(() => [] as PhotoHit[]),
    textAround(canvas, p).catch(() => [] as PhotoHit[]),
  ])
  return codes.length ? codes : text
}

/**
 * Text under the finger. The line height on a photo depends on distance, so a
 * few crops are tried, each cleaned up for OCR (enlarged, widened for the
 * narrow shell font, dots joined, black and white). The number read most
 * often wins; the rest are offered too. Settings come from tests on 3 shell
 * photos where each of them read all three serials.
 */
async function textAround(canvas: HTMLCanvasElement, p: Point): Promise<PhotoHit[]> {
  const w = Math.min(canvas.width, Math.max(240, canvas.width * 0.38))
  const x = Math.max(0, Math.min(canvas.width - w, p.x - w / 2))
  const votes = new Map<string, { hit: PhotoHit; n: number }>()
  const tries = [
    { frac: 0.05, threshold: 0.9, stretch: 2 },
    { frac: 0.07, threshold: 0.85, stretch: 2 },
    { frac: 0.035, threshold: 0.9, stretch: 2 },
    { frac: 0.05, threshold: 0.9, stretch: 1.5 },
    { frac: 0.07, threshold: 0.85, stretch: 1.5 },
  ]
  const reads: string[] = []
  for (const t of tries) {
    const h = Math.min(canvas.height, Math.max(24, canvas.width * t.frac))
    const y = Math.max(0, Math.min(canvas.height - h, p.y - h / 2))
    const { canvas: img, scaleX, scaleY } = cleanTextCrop(
      canvas,
      { x, y, width: w, height: h },
      { targetHeight: 150, stretch: t.stretch, threshold: t.threshold },
    )
    const { data } = await recognize(img, 'line', true)
    // word boxes come back in the enlarged, widened crop; map them to the photo
    for (const word of wordsOf(data)) {
      const n = asNumber(word.text)
      if (!n || n.length < MIN_DIGITS) continue
      const hit: PhotoHit = {
        value: n,
        method: 'ocr',
        box: {
          x: x + (word.box.x - LINE_BORDER) / scaleX,
          y: y + (word.box.y - LINE_BORDER) / scaleY,
          width: word.box.width / scaleX,
          height: word.box.height / scaleY,
        },
      }
      reads.push(n)
      const v = votes.get(n)
      if (v) v.n++
      else votes.set(n, { hit, n: 1 })
    }
  }
  const ranked = [...votes.values()].sort((a, b) => b.n - a.n || b.hit.value.length - a.hit.value.length)
  if (ranked.length === 0) return []
  // one misread digit should not win: vote digit by digit among reads of the
  // most common length and put that consensus first
  const best = consensus(reads)
  const top = ranked.find((r) => r.hit.value === best)?.hit ?? { ...ranked[0].hit, value: best }
  return [top, ...ranked.map((r) => r.hit).filter((h) => h.value !== best)]
}

/** Per-position majority over reads of the most common length. */
export function consensus(reads: string[]): string {
  const byLen = new Map<number, string[]>()
  for (const r of reads) byLen.set(r.length, [...(byLen.get(r.length) ?? []), r])
  const group = [...byLen.values()].sort((a, b) => b.length - a.length)[0] ?? []
  if (group.length === 0) return ''
  let out = ''
  for (let i = 0; i < group[0].length; i++) {
    const count = new Map<string, number>()
    for (const r of group) count.set(r[i], (count.get(r[i]) ?? 0) + 1)
    out += [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return out
}

/** Drops OCR reads that are just a cut-off piece of a barcode value (e.g. "9464704" of "29464704"). */
function withoutFragments(hits: PhotoHit[]): PhotoHit[] {
  const codes = hits.filter((h) => h.method === 'barcode').map((h) => h.value)
  return hits.filter((h) => h.method === 'barcode' || !codes.some((c) => c !== h.value && c.includes(h.value)))
}

/**
 * When nothing is suggested from the label text, use what was saved before:
 * a hit with the same length and first 3 digits as earlier serials of this
 * kind (prefabs here look like 136xxxxx, material numbers like 2946xxxx).
 * Only an unambiguous match is suggested.
 */
export function suggestFromHistory(hits: PhotoHit[], history: string[]): PhotoHit[] {
  hits = withoutFragments(hits)
  if (hits.some((h) => h.suggested) || history.length === 0) return hits
  const shapes = new Set(history.map((v) => `${v.length}:${v.slice(0, 3)}`))
  const matching = new Set(hits.filter((h) => shapes.has(`${h.value.length}:${h.value.slice(0, 3)}`)).map((h) => h.value))
  if (matching.size !== 1) return hits
  const [value] = matching
  return hits.map((h) => (h.value === value ? { ...h, suggested: true } : h))
}

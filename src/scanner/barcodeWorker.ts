import { rgbaToLuminance, scanImage, sharpen, type ImageBarcode, type ScanOptions } from './imageScan'
import { readCodes } from './wasmReader'

export interface WorkerJob {
  id: number
  rgba: Uint8ClampedArray
  w: number
  h: number
  opts: ScanOptions & {
    /** Whole photo: extra pass on overlapping tiles enlarged 2x (small codes). */
    upscaleTiles: boolean
    /**
     * Small area around a tap: also read a sharpened copy and run the JS port,
     * which is too slow for a whole photo but cheap here.
     */
    exhaustive: boolean
  }
}

export interface WorkerReply {
  id: number
  codes?: ImageBarcode[]
  /** false while more passes are still running */
  done?: boolean
  error?: string
}

/** Overlapping tiles drawn 2x bigger: gives thin bars of small codes more pixels. */
async function tilePass(full: ImageData, job: WorkerJob, add: (codes: ImageBarcode[]) => void) {
  if (typeof OffscreenCanvas === 'undefined') return
  const src = new OffscreenCanvas(job.w, job.h)
  src.getContext('2d')!.putImageData(full, 0, 0)
  const tile = Math.round(Math.max(job.w, job.h) / 2.5)
  const step = Math.round(tile * 0.6)
  const dst = new OffscreenCanvas(tile * 2, tile * 2)
  const ctx = dst.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  for (let ty = 0; ; ty += step) {
    const th = Math.min(tile, job.h - ty)
    for (let tx = 0; ; tx += step) {
      const tw = Math.min(tile, job.w - tx)
      dst.width = tw * 2
      dst.height = th * 2
      ctx.drawImage(src, tx, ty, tw, th, 0, 0, tw * 2, th * 2)
      const img = ctx.getImageData(0, 0, tw * 2, th * 2)
      const toPhoto = (c: { value: string; format?: ImageBarcode['format']; box: ImageBarcode['box'] }) => ({
        value: c.value,
        format: c.format,
        box: { x: tx + c.box.x / 2, y: ty + c.box.y / 2, width: c.box.width / 2, height: c.box.height / 2 },
      })
      add((await readCodes(img, job.opts.formats, job.opts.minLength)).map(toPhoto))
      if (tx + tw >= job.w) break
    }
    if (ty + th >= job.h) break
  }
}

self.onmessage = async (e: MessageEvent<WorkerJob>) => {
  const job = e.data
  const found = new Map<string, ImageBarcode>()
  const reply = (done: boolean) =>
    self.postMessage({ id: job.id, codes: [...found.values()], done } satisfies WorkerReply)
  const add = (codes: ImageBarcode[]) => {
    let fresh = false
    for (const c of codes) {
      if (found.has(c.value)) continue
      found.set(c.value, c)
      fresh = true
    }
    if (fresh) reply(false)
  }
  try {
    let wasmOk = true
    try {
      const full = new ImageData(new Uint8ClampedArray(job.rgba), job.w, job.h)
      add(await readCodes(full, job.opts.formats, job.opts.minLength))
      if (job.opts.exhaustive) {
        const lum = sharpen(rgbaToLuminance(full.data, job.w, job.h), job.w, job.h, 3, 2)
        const sharp = new ImageData(job.w, job.h)
        for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
          sharp.data[j] = sharp.data[j + 1] = sharp.data[j + 2] = lum[i]
          sharp.data[j + 3] = 255
        }
        add(await readCodes(sharp, job.opts.formats, job.opts.minLength))
      }
      if (job.opts.upscaleTiles) await tilePass(full, job, add)
    } catch {
      wasmOk = false
    }
    // JS port: the fallback without WebAssembly, and one more opinion near a tap
    if (!wasmOk || job.opts.exhaustive) {
      add(scanImage(rgbaToLuminance(job.rgba, job.w, job.h), job.w, job.h, job.opts))
    }
    reply(true)
  } catch (err) {
    self.postMessage({ id: job.id, error: String(err) } satisfies WorkerReply)
  }
}

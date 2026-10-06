import { scanImage, type ScanOptions } from './imageScan'

interface Job {
  id: number
  lum: Uint8ClampedArray
  w: number
  h: number
  opts: ScanOptions
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, lum, w, h, opts } = e.data
  try {
    self.postMessage({ id, codes: scanImage(lum, w, h, opts) })
  } catch (err) {
    self.postMessage({ id, error: String(err) })
  }
}

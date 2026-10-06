import { scanConfig } from '../config'
import type { SerialKind } from '../lib/types'
import type { FrameDetector } from '../scanner/detectors'
import type { Rect } from '../scanner/geometry'
import type { Detection } from '../scanner/pick'
import { getOcrWorker, recognize } from './engine'
import { extractSerial } from './extract'
import { cleanTextCrop } from './preprocess'

const MAX_WIDTH = 1400

/** Reads text inside the reticle and pulls the serial out of it. */
export async function createOcrDetector(kind: SerialKind): Promise<FrameDetector> {
  await getOcrWorker() // load up front so the UI can say when it is ready
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  let frame = 0
  return {
    name: 'ocr',
    async detect(video: HTMLVideoElement, roi: Rect): Promise<Detection | null> {
      if (roi.width < 10 || roi.height < 10) return null
      // every other frame: cleaned-up black-and-white version, which reads
      // dot-matrix prints (shell serials) that the plain image does not
      if (++frame % 2 === 0) {
        const { canvas: clean } = cleanTextCrop(video, roi, 360)
        const { data } = await recognize(clean, 'block')
        const v = extractSerial(data.text, scanConfig.ocr[kind])
        return v ? { value: v } : null
      }
      const scale = Math.min(1, MAX_WIDTH / roi.width)
      canvas.width = Math.round(roi.width * scale)
      canvas.height = Math.round(roi.height * scale)
      // grayscale + a bit of contrast helps with the green, textured label film
      ctx.filter = 'grayscale(1) contrast(1.4)'
      ctx.drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, canvas.width, canvas.height)
      ctx.filter = 'none'
      const { data } = await recognize(canvas, 'block')
      const value = extractSerial(data.text, scanConfig.ocr[kind])
      return value ? { value } : null
    },
  }
}

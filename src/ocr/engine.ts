import type { PSM, RecognizeResult, Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null
let queue: Promise<unknown> = Promise.resolve()
let currentPsm: PSM | null = null

/** One shared Tesseract worker, created on first use from files in /ocr (no CDN). */
export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js')
      const base = new URL('ocr/', document.baseURI).href
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'tesseract-core-simd-lstm.wasm.js',
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        // the service worker already keeps these files offline
        cacheMethod: 'none',
        workerBlobURL: false,
      })
    })()
    workerPromise.catch(() => {
      workerPromise = null // allow retry
    })
  }
  return workerPromise
}

export type PageMode = 'block' | 'sparse' | 'line'

/**
 * Runs OCR with the given page mode. Calls are queued so the camera loop and
 * the photo screen never change parameters under each other.
 */
export function recognize(
  image: HTMLCanvasElement,
  mode: PageMode,
  withWords = false,
): Promise<RecognizeResult> {
  const job = queue.then(async () => {
    const worker = await getOcrWorker()
    const { PSM } = await import('tesseract.js')
    const psm = mode === 'block' ? PSM.SINGLE_BLOCK : mode === 'line' ? PSM.SINGLE_LINE : PSM.SPARSE_TEXT
    if (psm !== currentPsm) {
      await worker.setParameters({ tessedit_pageseg_mode: psm })
      currentPsm = psm
    }
    return worker.recognize(image, {}, { text: true, blocks: withWords })
  })
  queue = job.catch(() => undefined)
  return job
}

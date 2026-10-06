import { useEffect, useRef, useState, type ReactNode } from 'react'
import { scanConfig, type BarcodeFormatName } from '../config'
import { createOcrDetector } from '../ocr/detector'
import type { SerialKind } from '../lib/types'
import { createDetector, type FrameDetector } from './detectors'
import { elementRectToVideo } from './geometry'
import { StabilityFilter } from './stability'
import { useCamera } from './useCamera'
import { Icon } from '../components/Icon'

export interface CameraScannerProps {
  title: string
  hint: string
  /** When false the camera keeps running but nothing is decoded. */
  active: boolean
  /**
   * Called with a stable code. Return true to stop decoding (parent takes over),
   * false to keep scanning. Either way the same code is ignored until it has
   * left the reticle, so a code that is still in view cannot fire twice.
   */
  onScan: (value: string, format?: BarcodeFormatName) => boolean
  /** Green frame + value shown after a good read. */
  success?: { label: string; value: string } | null
  message?: string | null
  header?: ReactNode
  actions?: ReactNode
  /** Small secondary buttons shown above the toolbar. */
  extras?: ReactNode
  formats?: BarcodeFormatName[]
  /** 'ocr' reads printed text in the reticle instead of a barcode. */
  engine?: 'barcode' | 'ocr'
  /** Which OCR rule set to use (prefab / shell). */
  ocrKind?: SerialKind
}

const IGNORE_CLEAR_MS = 1500

export function CameraScanner({
  title,
  hint,
  active,
  onScan,
  success,
  message,
  header,
  actions,
  extras,
  formats = scanConfig.formats,
  engine = 'barcode',
  ocrKind = 'prefab',
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const reticleRef = useRef<HTMLDivElement>(null)
  const camera = useCamera(videoRef)
  const [detector, setDetector] = useState<FrameDetector | null>(null)
  const [detectorError, setDetectorError] = useState<string | null>(null)
  const [locking, setLocking] = useState(false)
  const [torchNote, setTorchNote] = useState<string | null>(null)
  const onScanRef = useRef(onScan)
  const ignoredRef = useRef<{ value: string; lastSeen: number } | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const formatsKey = formats.join(',')
  const detectorKey = engine === 'ocr' ? `ocr:${ocrKind}` : `barcode:${formatsKey}`
  useEffect(() => {
    let cancelled = false
    const [kind, arg] = detectorKey.split(':')
    const make =
      kind === 'ocr'
        ? createOcrDetector(arg as SerialKind)
        : createDetector(arg.split(',') as BarcodeFormatName[])
    make.then(
      (d) => {
        if (cancelled) return
        setDetector(d)
        setDetectorError(null)
      },
      () => {
        if (!cancelled) setDetectorError('Could not load text recognition')
      },
    )
    return () => {
      cancelled = true
      setDetector(null)
    }
  }, [detectorKey])

  useEffect(() => {
    if (!active || camera.status !== 'ready' || !detector) return
    let stopped = false
    // OCR runs at ~1-2 reads/s, so it needs equal reads in a row rather than a time window
    const filter =
      detector.name === 'ocr'
        ? new StabilityFilter(0, scanConfig.ocr.minHits, 5000)
        : new StabilityFilter(scanConfig.stableMs, scanConfig.minHits)
    // restart the "left the reticle" clock, dialogs may have been open for a while
    if (ignoredRef.current) ignoredRef.current.lastSeen = performance.now()
    let wasLocking = false

    const setLock = (v: boolean) => {
      if (v !== wasLocking) {
        wasLocking = v
        setLocking(v)
      }
    }

    async function tick() {
      if (stopped) return
      const video = videoRef.current
      const reticle = reticleRef.current
      if (video && reticle && video.videoWidth > 0 && video.readyState >= 2) {
        const vb = video.getBoundingClientRect()
        const rb = reticle.getBoundingClientRect()
        const roi = elementRectToVideo(
          { x: rb.left - vb.left, y: rb.top - vb.top, width: rb.width, height: rb.height },
          vb.width,
          vb.height,
          video.videoWidth,
          video.videoHeight,
        )
        let found = await detector!.detect(video, roi).catch(() => null)
        if (stopped) return
        const now = performance.now()

        const ignored = ignoredRef.current
        if (ignored) {
          if (found?.value === ignored.value) {
            ignored.lastSeen = now
            found = null
          } else if (now - ignored.lastSeen > IGNORE_CLEAR_MS) {
            ignoredRef.current = null
          }
        }

        const stable = filter.push(found?.value ?? null, now)
        setLock(filter.candidate !== null)
        if (stable) {
          filter.reset()
          setLock(false)
          ignoredRef.current = { value: stable, lastSeen: now }
          if (onScanRef.current(stable, found?.format)) return // parent switches `active` off
        }
      }
      // native detector is fast, ZXing is the bottleneck anyway; ~12 fps is plenty
      setTimeout(() => requestAnimationFrame(() => void tick()), 60)
    }
    void tick()
    return () => {
      stopped = true
      setLocking(false)
    }
  }, [active, camera.status, detector])

  const frameClass = success ? 'reticle ok' : locking && active ? 'reticle locking' : 'reticle'

  return (
    <div className="scanner">
      <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
      <div className="scanner-top">
        {header}
        <div className="scanner-title">{title}</div>
      </div>
      <div ref={reticleRef} className={frameClass}>
        <span className="scanline" />
      </div>
      <div className="scanner-bottom">
        {success ? (
          <div className="detected">
            <div className="detected-label">{success.label}</div>
            <div className="detected-value">{success.value}</div>
          </div>
        ) : (
          <div className="scanner-hint">
            {camera.status === 'error'
              ? camera.error
              : (torchNote ??
                message ??
                detectorError ??
                (engine === 'ocr' && !detector ? 'Loading text recognition…' : hint))}
          </div>
        )}
        {extras && <div className="scanner-extras">{extras}</div>}
        <div className="scanner-actions">
          {actions}
          {camera.status === 'ready' && (
            <button
              type="button"
              className={camera.torchOn ? 'tool torch on' : 'tool torch'}
              onClick={async () => {
                const ok = await camera.toggleTorch()
                setTorchNote(ok ? null : 'Light is not available on this phone / browser')
                if (!ok) setTimeout(() => setTorchNote(null), 3000)
              }}
            >
              <Icon name="flash" />
              <span>{camera.torchOn ? 'Light on' : 'Light'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

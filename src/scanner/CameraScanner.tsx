import { useEffect, useRef, useState, type ReactNode } from 'react'
import { scanConfig, type BarcodeFormatName } from '../config'
import { createDetector, type FrameDetector } from './detectors'
import { elementRectToVideo } from './geometry'
import { StabilityFilter } from './stability'
import { useCamera } from './useCamera'

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
  formats?: BarcodeFormatName[]
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
  formats = scanConfig.formats,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const reticleRef = useRef<HTMLDivElement>(null)
  const camera = useCamera(videoRef)
  const [detector, setDetector] = useState<FrameDetector | null>(null)
  const [locking, setLocking] = useState(false)
  const onScanRef = useRef(onScan)
  const ignoredRef = useRef<{ value: string; lastSeen: number } | null>(null)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const formatsKey = formats.join(',')
  useEffect(() => {
    let cancelled = false
    void createDetector(formatsKey.split(',') as BarcodeFormatName[]).then((d) => {
      if (!cancelled) setDetector(d)
    })
    return () => {
      cancelled = true
    }
  }, [formatsKey])

  useEffect(() => {
    if (!active || camera.status !== 'ready' || !detector) return
    let stopped = false
    const filter = new StabilityFilter(scanConfig.stableMs, scanConfig.minHits)
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
            {camera.status === 'error' ? camera.error : message ?? hint}
          </div>
        )}
        <div className="scanner-actions">
          {actions}
          {camera.torchSupported && (
            <button
              type="button"
              className={camera.torchOn ? 'btn btn-torch on' : 'btn btn-torch'}
              onClick={() => void camera.toggleTorch()}
            >
              Torch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

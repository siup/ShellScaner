import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type CameraStatus = 'starting' | 'ready' | 'error'

interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean
  focusMode?: string[]
  zoom?: { min: number; max: number }
}

export interface Lens {
  id: string
  label: string
}

const DEVICE_KEY = 'scanner.cameraId'

function baseConstraints(): MediaTrackConstraints {
  // 1080p gives thin 1D bars enough pixels without killing frame rate.
  return { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
}

function storedDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

function storeDevice(id: string) {
  try {
    localStorage.setItem(DEVICE_KEY, id)
  } catch {
    // ignore
  }
}

/** Rear cameras in browser order. When the labels say nothing about facing, all of them. */
export function rearLenses(devices: Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[]): Lens[] {
  const cams = devices.filter((d) => d.kind === 'videoinput' && d.deviceId)
  const rear = cams.filter((d) => /back|rear|environment/i.test(d.label))
  return (rear.length ? rear : cams).map((d) => ({ id: d.deviceId, label: d.label }))
}

async function listLenses(): Promise<Lens[]> {
  try {
    return rearLenses(await navigator.mediaDevices.enumerateDevices())
  } catch {
    return []
  }
}

/**
 * On many Android phones facingMode "environment" lands on the ultra-wide lens,
 * which cannot focus close enough for small labels. Android names the main
 * rear lens "camera2 0, facing back", so prefer that one when it exists.
 * Phones with telephoto lenses can still end up on the wrong one, that is what
 * the lens button in the scanner is for.
 */
async function preferredRearCamera(current: string | undefined): Promise<string | null> {
  const main = (await listLenses()).find((l) => /camera2 0\b.*back/i.test(l.label))
  return main && main.id !== current ? main.id : null
}

async function open(deviceId: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = deviceId
    ? { ...baseConstraints(), deviceId: { exact: deviceId } }
    : { ...baseConstraints(), facingMode: { ideal: 'environment' } }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

async function enableAutofocus(track: MediaStreamTrack) {
  try {
    const caps = track.getCapabilities?.() as CameraCapabilities | undefined
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      })
    }
  } catch {
    // not supported
  }
}

/** 1x, or as close to it as the lens goes. Below 1x a phone may jump to the ultra-wide. */
export function zoomTarget(min: number, max: number): number {
  return Math.min(Math.max(1, min), max)
}

/** Some phones hand the stream over already zoomed in, put it back to 1x. */
async function resetZoom(track: MediaStreamTrack) {
  try {
    const zoom = (track.getCapabilities?.() as CameraCapabilities | undefined)?.zoom
    const current = (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom
    if (!zoom || current === undefined) return
    const target = zoomTarget(zoom.min, zoom.max)
    if (Math.abs(current - target) > 0.01) {
      await track.applyConstraints({ advanced: [{ zoom: target } as MediaTrackConstraintSet] })
    }
  } catch {
    // not supported
  }
}

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [lenses, setLenses] = useState<Lens[]>([])
  const [lensId, setLensId] = useState<string | null>(null)
  // lens picked with the switch button; a new object every tap, so the camera always reopens
  const [picked, setPicked] = useState<{ id: string } | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null

    const stop = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop())

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setError(
          window.isSecureContext
            ? 'Camera is not supported in this browser'
            : 'Camera needs HTTPS (or localhost)',
        )
        return
      }
      try {
        const saved = picked?.id ?? storedDevice()
        try {
          stream = await open(saved)
        } catch (e) {
          if (!saved) throw e
          stream = await open(null) // saved camera is gone
        }
        if (!saved) {
          const settings = stream.getVideoTracks()[0]?.getSettings()
          const better = await preferredRearCamera(settings?.deviceId)
          if (better && !cancelled) {
            stop(stream)
            stream = await open(better)
          }
          const id = stream.getVideoTracks()[0]?.getSettings().deviceId
          if (id) storeDevice(id)
        }
        if (cancelled) return stop(stream)

        const track = stream.getVideoTracks()[0]
        trackRef.current = track
        await enableAutofocus(track)
        await resetZoom(track)
        const checkTorch = () => {
          const caps = track.getCapabilities?.() as CameraCapabilities | undefined
          if (!cancelled && caps?.torch) setTorchSupported(true)
        }
        checkTorch()
        // some Android phones report the torch only once frames are flowing
        setTimeout(checkTorch, 800)

        const found = await listLenses()
        if (cancelled) return
        setLenses(found)
        setLensId(track.getSettings().deviceId ?? null)

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        video.muted = true
        await video.play().catch(() => undefined)
        if (!cancelled) setStatus('ready')
      } catch (e) {
        if (cancelled) return
        const name = (e as DOMException)?.name
        setStatus('error')
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission denied'
            : name === 'NotFoundError'
              ? 'No camera found'
              : 'Could not start camera',
        )
      }
    }

    void start()
    return () => {
      cancelled = true
      stop(stream)
      trackRef.current = null
    }
  }, [videoRef, picked])

  /** Rear lens currently in use, null when there is nothing to switch to. */
  const lensIndex = lenses.findIndex((l) => l.id === lensId)
  const lens =
    lenses.length > 1 ? { index: Math.max(0, lensIndex), count: lenses.length } : null

  /** Opens the next rear lens and remembers it. Returns its label. */
  const switchLens = useCallback((): string | null => {
    if (lenses.length < 2) return null
    const next = lenses[(lensIndex + 1) % lenses.length]
    storeDevice(next.id)
    setStatus('starting')
    setTorchOn(false)
    setTorchSupported(false)
    setLensId(next.id)
    setPicked({ id: next.id })
    return next.label
  }, [lenses, lensIndex])

  /** Returns false when the phone/browser does not let us control the light. */
  const toggleTorch = useCallback(async (): Promise<boolean> => {
    const track = trackRef.current
    if (!track) return false
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      const applied = (track.getSettings() as MediaTrackSettings & { torch?: boolean }).torch
      if (applied !== undefined && applied !== next) return false
      setTorchOn(next)
      setTorchSupported(true)
      return true
    } catch {
      return false
    }
  }, [torchOn])

  return { status, error, torchSupported, torchOn, toggleTorch, lens, switchLens }
}

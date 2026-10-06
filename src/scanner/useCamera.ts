import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

type CameraStatus = 'starting' | 'ready' | 'error'

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean
  focusMode?: string[]
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

/**
 * On many Android phones facingMode "environment" lands on the ultra-wide lens,
 * which cannot focus close enough for small labels. Android names the main
 * rear lens "camera2 0, facing back", so prefer that one when it exists.
 */
async function preferredRearCamera(current: string | undefined): Promise<string | null> {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'videoinput',
    )
    const main = devices.find((d) => /camera2 0\b.*back/i.test(d.label))
    if (main && main.deviceId && main.deviceId !== current) return main.deviceId
  } catch {
    // ignore
  }
  return null
}

async function open(deviceId: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = deviceId
    ? { ...baseConstraints(), deviceId: { exact: deviceId } }
    : { ...baseConstraints(), facingMode: { ideal: 'environment' } }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

async function enableAutofocus(track: MediaStreamTrack) {
  try {
    const caps = track.getCapabilities?.() as TorchCapabilities | undefined
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      })
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
        const saved = storedDevice()
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
          try {
            if (id) localStorage.setItem(DEVICE_KEY, id)
          } catch {
            // ignore
          }
        }
        if (cancelled) return stop(stream)

        const track = stream.getVideoTracks()[0]
        trackRef.current = track
        await enableAutofocus(track)
        const caps = track.getCapabilities?.() as TorchCapabilities | undefined
        setTorchSupported(!!caps?.torch)

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
  }, [videoRef])

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {
      setTorchSupported(false)
    }
  }, [torchOn])

  return { status, error, torchSupported, torchOn, toggleTorch }
}

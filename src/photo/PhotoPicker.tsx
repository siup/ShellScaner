import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { InputMethod, SerialKind } from '../lib/types'
import { findBarcodes, findNumbers, loadPhoto, readAround, suggestFromHistory, type PhotoHit } from './analyze'

type Status = 'loading' | 'reading' | 'ready' | 'error'

/**
 * Shows the photo with every barcode / number found on it. The user taps the
 * right one; tapping an empty spot reads just that area.
 */
export function PhotoPicker({
  file,
  kind,
  history,
  onPick,
  onCancel,
  onManual,
}: {
  file: File
  kind: SerialKind
  /** Serials of this kind saved earlier, used to guess which number is the right one. */
  history: string[]
  onPick: (value: string, method: InputMethod) => void
  onCancel: () => void
  onManual: () => void
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [hits, setHits] = useState<PhotoHit[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [note, setNote] = useState<string | null>(null)
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      try {
        const c = await loadPhoto(file)
        if (cancelled) return
        // <img> applies EXIF rotation the same way createImageBitmap does
        objectUrl = URL.createObjectURL(file)
        setCanvas(c)
        setUrl(objectUrl)
        setStatus('reading')
        // barcodes (worker) and text (OCR worker) run in parallel; whatever
        // finishes first is shown right away
        // a barcode beats the same number read as text (exact, no OCR doubt)
        const merge = (more: PhotoHit[]) =>
          !cancelled &&
          setHits((prev) => {
            const next = [...prev]
            for (const m of more) {
              const i = next.findIndex((p) => p.value === m.value)
              if (i < 0) next.push(m)
              else if (m.method === 'barcode' && next[i].method !== 'barcode') next[i] = { ...m, suggested: next[i].suggested }
            }
            return next
          })
        const codes = findBarcodes(c, merge).then(merge, () => undefined)
        const numbers = findNumbers(c, kind).then(merge, () => undefined)
        await Promise.all([codes, numbers])
        if (cancelled) return
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, kind])

  const onImageTap = async (e: MouseEvent<HTMLDivElement>) => {
    if (!canvas || status !== 'ready' || !imgRef.current) return
    const r = imgRef.current.getBoundingClientRect()
    const p = {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    }
    setTap(p)
    setStatus('reading')
    setNote('Reading this spot…')
    try {
      const near = await readAround(canvas, p)
      if (near.length === 0) {
        setNote('Nothing here. Tap right on the barcode or digits, or enter it manually.')
      } else {
        // keep earlier hits, add the new ones (closest first)
        setHits((prev) => [...near, ...prev.filter((h) => !near.some((n) => n.value === h.value))])
        setNote(near.length === 1 ? 'Found it. Tap the box to use it.' : 'Tap the right number.')
      }
    } catch {
      setNote('Could not read this spot.')
    }
    setTap(null)
    setStatus('ready')
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`
  const shown = suggestFromHistory(hits, history)

  return (
    <div className="photo-screen">
      <div className="photo-top">
        <button type="button" className="chip" onClick={onCancel}>
          ‹ Back
        </button>
        <span className="photo-status">
          {status === 'loading' && 'Opening photo…'}
          {status === 'reading' &&
            (note === 'Reading this spot…' ? note : 'Reading photo…')}
          {status === 'ready' &&
            (note ?? (hits.length ? 'Tap the right number' : 'Nothing found. Tap the number or barcode on the photo.'))}
          {status === 'error' && 'Could not open this photo'}
        </span>
      </div>

      <div className="photo-scroll">
        {url && canvas && (
          <div className="photo-wrap" onClick={(e) => void onImageTap(e)}>
            <img ref={imgRef} src={url} alt="" className="photo-img" draggable={false} />
            {shown.map((h, i) => (
              <button
                key={`${h.value}-${i}`}
                type="button"
                className={`photo-hit ${h.method}${h.suggested ? ' suggested' : ''}`}
                style={{
                  // positioned by center so the minimum tap size grows evenly
                  left: pct(h.box.x + h.box.width / 2, canvas.width),
                  top: pct(h.box.y + h.box.height / 2, canvas.height),
                  width: pct(h.box.width, canvas.width),
                  height: pct(h.box.height, canvas.height),
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onPick(h.value, h.method)
                }}
                aria-label={h.value}
              />
            ))}
            {tap && (
              <span
                className="photo-tap"
                style={{ left: pct(tap.x, canvas.width), top: pct(tap.y, canvas.height) }}
              />
            )}
          </div>
        )}
      </div>

      <div className="photo-bottom">
        {shown.length > 0 && (
          <div className="photo-choices">
            {[...new Map(
              [...shown].sort(
                (a, b) =>
                  Number(!!b.suggested) - Number(!!a.suggested) ||
                  Number(b.method === 'barcode') - Number(a.method === 'barcode'),
              ).map((h) => [h.value, h]),
            ).values()].map((h) => (
              <button
                key={h.value}
                type="button"
                className={`photo-choice ${h.method}${h.suggested ? ' suggested' : ''}`}
                onClick={() => onPick(h.value, h.method)}
              >
                <span className="mono">{h.value}</span>
                <span className="photo-choice-kind">
                  {h.suggested ? 'Suggested' : h.method === 'barcode' ? 'Barcode' : 'Text'}
                </span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn" onClick={onManual}>
          Enter manually
        </button>
      </div>
    </div>
  )
}

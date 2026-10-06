import type { BarcodeFormatName } from '../config'
import { contains, type Point, type Rect } from './geometry'

export interface Detection {
  value: string
  format?: BarcodeFormatName
}

export interface Candidate extends Detection {
  center: Point
  area: number
}

/**
 * Picks one code among those inside the reticle. Prefers the largest one;
 * when the two biggest are about the same size, the one closer to the reticle
 * center wins. Codes whose center is outside the reticle are ignored.
 */
export function pickCandidate(cands: Candidate[], roi: Rect): Candidate | null {
  const inside = cands.filter((c) => contains(roi, c.center))
  if (inside.length === 0) return null
  if (inside.length === 1) return inside[0]
  const mid = { x: roi.x + roi.width / 2, y: roi.y + roi.height / 2 }
  const dist = (c: Candidate) => Math.hypot(c.center.x - mid.x, c.center.y - mid.y)
  const sorted = [...inside].sort((a, b) => b.area - a.area)
  const [a, b] = sorted
  if (b.area >= a.area * 0.8) return dist(a) <= dist(b) ? a : b
  return a
}

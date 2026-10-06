export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Maps a rectangle given in element (CSS px) coordinates to the video's
 * intrinsic pixel coordinates, assuming the video is drawn with object-fit: cover.
 */
export function elementRectToVideo(
  rect: Rect,
  elW: number,
  elH: number,
  vidW: number,
  vidH: number,
): Rect {
  const scale = Math.max(elW / vidW, elH / vidH)
  const offX = (elW - vidW * scale) / 2
  const offY = (elH - vidH * scale) / 2
  const x = (rect.x - offX) / scale
  const y = (rect.y - offY) / scale
  const w = rect.width / scale
  const h = rect.height / scale
  // clamp to frame
  const cx = Math.max(0, x)
  const cy = Math.max(0, y)
  return {
    x: cx,
    y: cy,
    width: Math.min(vidW, x + w) - cx,
    height: Math.min(vidH, y + h) - cy,
  }
}

export function centerOf(points: Point[]): Point {
  const n = points.length || 1
  return {
    x: points.reduce((a, p) => a + p.x, 0) / n,
    y: points.reduce((a, p) => a + p.y, 0) / n,
  }
}

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
}

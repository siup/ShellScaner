/**
 * Accepts a code only after it was read consistently for a while.
 * A different code resets the window, so two codes flickering in the
 * reticle never get accepted by accident. Short gaps (frames where nothing
 * decoded) are tolerated because 1D decoding misses frames all the time.
 */
export class StabilityFilter {
  private value: string | null = null
  private firstSeen = 0
  private lastSeen = 0
  private hits = 0

  constructor(
    private stableMs: number,
    private minHits: number,
    private maxGapMs = 350,
  ) {}

  reset() {
    this.value = null
    this.hits = 0
  }

  /** Feed one frame result (null = nothing in reticle). Returns the value once stable. */
  push(value: string | null, now: number): string | null {
    if (value === null) {
      if (this.value !== null && now - this.lastSeen > this.maxGapMs) this.reset()
      return null
    }
    if (value !== this.value || now - this.lastSeen > this.maxGapMs) {
      this.value = value
      this.firstSeen = now
      this.hits = 0
    }
    this.lastSeen = now
    this.hits++
    if (this.hits >= this.minHits && now - this.firstSeen >= this.stableMs) return value
    return null
  }

  /** 0..1 progress of the current candidate, for UI feedback. */
  progress(now: number): number {
    if (this.value === null) return 0
    return Math.min(1, (now - this.firstSeen) / this.stableMs)
  }

  get candidate() {
    return this.value
  }
}

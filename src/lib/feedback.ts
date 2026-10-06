let audio: AudioContext | null = null

/** Must be called from a user gesture once, otherwise mobile browsers keep audio muted. */
export function unlockAudio() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    if (!audio) audio = new Ctor()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

export function beep(freq = 1800, ms = 90) {
  try {
    if (!audio || audio.state !== 'running') return
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.value = 0.08
    osc.connect(gain).connect(audio.destination)
    const t = audio.currentTime
    osc.start(t)
    osc.stop(t + ms / 1000)
  } catch {
    // ignore
  }
}

export function vibrate(pattern: number | number[] = 80) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // ignore
  }
}

export function successFeedback() {
  beep()
  vibrate(80)
}

export function errorFeedback() {
  beep(400, 250)
  vibrate([120, 60, 120])
}

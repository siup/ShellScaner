import { describe, expect, it } from 'vitest'
import { checkRules, scanConfig, type ScanConfig } from '../config'
import { elementRectToVideo } from '../scanner/geometry'
import { pickCandidate } from '../scanner/pick'
import { rotate90, scanImage, sharpen } from '../scanner/imageScan'
import { extractSerial } from '../ocr/extract'
import { suggestFromHistory } from '../photo/analyze'
import { StabilityFilter } from '../scanner/stability'
import { rearLenses, zoomTarget } from '../scanner/useCamera'

describe('StabilityFilter', () => {
  it('accepts only after the code was stable long enough', () => {
    const f = new StabilityFilter(400, 3)
    expect(f.push('A', 0)).toBeNull()
    expect(f.push('A', 100)).toBeNull()
    expect(f.push('A', 200)).toBeNull()
    expect(f.push('A', 400)).toBe('A')
  })

  it('resets when another code shows up', () => {
    const f = new StabilityFilter(400, 3)
    f.push('A', 0)
    f.push('A', 200)
    f.push('B', 300)
    expect(f.push('A', 420)).toBeNull()
    expect(f.push('A', 600)).toBeNull()
    expect(f.push('A', 820)).toBe('A')
  })

  it('never accepts two codes flickering', () => {
    const f = new StabilityFilter(400, 3)
    for (let t = 0; t < 3000; t += 60) expect(f.push(t % 120 ? 'A' : 'B', t)).toBeNull()
  })

  it('tolerates short gaps but not long ones', () => {
    const f = new StabilityFilter(400, 3, 300)
    f.push('A', 0)
    f.push(null, 100)
    f.push('A', 200)
    expect(f.push('A', 400)).toBe('A')

    const g = new StabilityFilter(400, 3, 300)
    g.push('A', 0)
    g.push('A', 100)
    g.push(null, 500) // gap > 300ms
    expect(g.push('A', 520)).toBeNull()
  })
})

describe('pickCandidate', () => {
  const roi = { x: 100, y: 100, width: 400, height: 100 }

  it('ignores codes whose center is outside the reticle', () => {
    expect(pickCandidate([{ value: 'X', center: { x: 50, y: 150 }, area: 9999 }], roi)).toBeNull()
  })

  it('prefers the largest code inside the reticle', () => {
    const r = pickCandidate(
      [
        { value: 'small', center: { x: 300, y: 150 }, area: 1000 },
        { value: 'big', center: { x: 450, y: 120 }, area: 5000 },
        { value: 'outside', center: { x: 300, y: 400 }, area: 90000 },
      ],
      roi,
    )
    expect(r?.value).toBe('big')
  })

  it('picks the more central one when sizes are similar', () => {
    const r = pickCandidate(
      [
        { value: 'edge', center: { x: 480, y: 110 }, area: 5000 },
        { value: 'middle', center: { x: 310, y: 148 }, area: 4600 },
      ],
      roi,
    )
    expect(r?.value).toBe('middle')
  })
})

describe('elementRectToVideo', () => {
  it('maps reticle through object-fit: cover', () => {
    // 400x800 element showing a 1080x1920 portrait video: scale = 0.4167,
    // video is drawn 450px wide so 25px are cut on each side
    const r = elementRectToVideo({ x: 0, y: 300, width: 400, height: 200 }, 400, 800, 1080, 1920)
    expect(r.x).toBeCloseTo(60)
    expect(r.y).toBeCloseTo(720)
    expect(r.width).toBeCloseTo(960)
    expect(r.height).toBeCloseTo(480)
  })

  it('accounts for cropped sides', () => {
    // landscape video 1920x1080 in a 400x800 element: scale = 0.7407, x offset = -511
    const r = elementRectToVideo({ x: 100, y: 0, width: 200, height: 800 }, 400, 800, 1920, 1080)
    expect(r.x + r.width / 2).toBeCloseTo(960)
    expect(r.height).toBeCloseTo(1080)
  })
})

describe('checkRules', () => {
  it('accepts anything with the default config', () => {
    expect(checkRules('prefab', '29464704')).toBeNull()
  })

  it('supports reject patterns for the material number', () => {
    const cfg: ScanConfig = {
      ...scanConfig,
      rules: { prefab: [{ rejectPattern: '^2946', message: 'Material Number' }], shell: [] },
    }
    expect(checkRules('prefab', '29464704', undefined, cfg)).toBe('Material Number')
    expect(checkRules('prefab', '13682767', undefined, cfg)).toBeNull()
  })

  it('supports format restriction', () => {
    const cfg: ScanConfig = {
      ...scanConfig,
      rules: { prefab: [], shell: [{ formats: ['code_128'], message: 'Wrong barcode type' }] },
    }
    expect(checkRules('shell', '839662', 'ean_8', cfg)).toBe('Wrong barcode type')
    expect(checkRules('shell', '839662', 'code_128', cfg)).toBeNull()
  })
})

describe('extractSerial (OCR)', () => {
  const prefab = scanConfig.ocr.prefab
  const shell = scanConfig.ocr.shell

  // real Tesseract output from a photo of a "V164_LEP PREFAB B1" label
  it('takes the Production Order, not the Item Number', () => {
    const text = [
      '{ {TEM NUMBER _ 20464707 |',
      'Production Order 13690706 ~~ -',
      '|PRODUCTIONDATE | #/F 21°,',
      'FACTORY MAL ¢',
    ].join('\n')
    expect(extractSerial(text, prefab)).toBe('13690706')
  })

  it('reads a single row crop', () => {
    expect(extractSerial('> fa > — TU B ERT TNA ¥ SRR\n{ Production Order 13690706 ~~ - i', prefab)).toBe('13690706')
  })

  it('fixes typical O/I/S confusions inside numbers', () => {
    expect(extractSerial('Production Order 1369O7O6', prefab)).toBe('13690706')
    expect(extractSerial('Serial no.: 8396S2', shell)).toBe('839652')
  })

  it('without the anchor word takes the only number left', () => {
    expect(extractSerial('| IEMNUMBER | 29464707\n13690706 ~~', prefab)).toBe('13690706')
  })

  it('refuses ambiguous reads', () => {
    expect(extractSerial('13690706\n13690707', prefab)).toBeNull()
    expect(extractSerial('nothing here', prefab)).toBeNull()
  })

  it('reads the shell serial print', () => {
    expect(extractSerial('Serial no.: 839662', shell)).toBe('839662')
  })
})

describe('sharpen', () => {
  it('leaves flat areas alone and steepens edges', () => {
    const w = 20
    const h = 3
    const lum = new Uint8ClampedArray(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = x < 10 ? 60 : 180
    const out = sharpen(lum, w, h)
    expect(out[w + 2]).toBe(60)
    expect(out[w + 17]).toBe(180)
    expect(out[w + 9]).toBeLessThan(60) // dark side of the edge gets darker
    expect(out[w + 10]).toBeGreaterThan(180) // bright side brighter
  })
})

describe('scanImage (photo barcodes)', () => {
  const C39: Record<string, string> = {
    '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
    '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', '*': 'nwnnwnwnn',
  }
  /** Draws a Code 39 barcode into a luminance buffer. */
  function draw(lum: Uint8ClampedArray, w: number, text: string, x0: number, y0: number, h: number, nw: number) {
    let x = x0
    for (const ch of `*${text}*`) {
      ;[...C39[ch]].forEach((c, i) => {
        const bw = c === 'w' ? nw * 3 : nw
        if (i % 2 === 0) for (let y = y0; y < y0 + h; y++) lum.fill(0, y * w + x, y * w + x + bw)
        x += bw
      })
      x += nw
    }
  }
  const opts = { formats: scanConfig.formats, minLength: 4, sharpened: false, sideways: true, bandFraction: 1 / 12 }

  it('finds every code on a label, not only the first one', () => {
    const w = 1200
    const h = 900
    const lum = new Uint8ClampedArray(w * h).fill(230)
    draw(lum, w, '29464704', 60, 100, 120, 3) // material number, big
    draw(lum, w, '13682767', 60, 420, 50, 2) // prefab serial, small, below
    draw(lum, w, '5551', 760, 100, 120, 3) // another code in the same row
    const values = scanImage(lum, w, h, opts).map((c) => c.value).sort()
    expect(values).toEqual(['13682767', '29464704', '5551'])
  })

  it('finds a code stuck on sideways and maps its box back', () => {
    const w = 900
    const h = 300
    const flat = new Uint8ClampedArray(w * h).fill(230)
    draw(flat, w, '839662', 40, 100, 100, 3)
    const turned = rotate90(flat, w, h) // now 300 wide, 900 tall: code runs vertically
    const codes = scanImage(turned, h, w, opts)
    expect(codes.map((c) => c.value)).toEqual(['839662'])
    expect(codes[0].box.height).toBeGreaterThan(codes[0].box.width)
  })

  it('ignores reads shorter than minLength', () => {
    const w = 600
    const h = 200
    const lum = new Uint8ClampedArray(w * h).fill(230)
    draw(lum, w, '1', 40, 50, 100, 3)
    expect(scanImage(lum, w, h, opts)).toEqual([])
  })
})

describe('camera lenses', () => {
  const cam = (deviceId: string, label: string) => ({ kind: 'videoinput' as const, deviceId, label })

  it('keeps only rear cameras, in browser order', () => {
    const lenses = rearLenses([
      cam('a', 'camera2 1, facing front'),
      cam('b', 'camera2 0, facing back'),
      { kind: 'audioinput' as const, deviceId: 'm', label: 'mic' },
      cam('c', 'camera2 3, facing back'),
    ])
    expect(lenses.map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('falls back to every camera when labels say nothing about facing', () => {
    expect(rearLenses([cam('a', 'HD Webcam'), cam('b', 'USB Camera')])).toHaveLength(2)
  })

  it('zooms back to 1x without going below the lens minimum', () => {
    expect(zoomTarget(1, 10)).toBe(1)
    expect(zoomTarget(0.6, 10)).toBe(1)
    expect(zoomTarget(2, 10)).toBe(2)
  })
})

describe('suggestFromHistory', () => {
  const hit = (value: string, suggested = false) => ({
    value,
    method: 'barcode' as const,
    box: { x: 0, y: 0, width: 1, height: 1 },
    suggested,
  })

  it('suggests the code shaped like earlier prefabs, not the material number', () => {
    const out = suggestFromHistory([hit('29464710'), hit('13677741')], ['13682767', '13690706'])
    expect(out.find((h) => h.suggested)?.value).toBe('13677741')
  })

  it('stays quiet without history or when ambiguous', () => {
    expect(suggestFromHistory([hit('29464710'), hit('13677741')], []).some((h) => h.suggested)).toBe(false)
    expect(
      suggestFromHistory([hit('13677741'), hit('13677742')], ['13682767']).some((h) => h.suggested),
    ).toBe(false)
  })

  it('keeps a suggestion that came from the label text', () => {
    const out = suggestFromHistory([hit('29464707'), hit('13690706', true)], ['29400000'])
    expect(out.filter((h) => h.suggested).map((h) => h.value)).toEqual(['13690706'])
  })
})

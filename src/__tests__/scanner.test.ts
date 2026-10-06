import { describe, expect, it } from 'vitest'
import { checkRules, scanConfig, type ScanConfig } from '../config'
import { elementRectToVideo } from '../scanner/geometry'
import { pickCandidate } from '../scanner/pick'
import { extractSerial } from '../ocr/extract'
import { StabilityFilter } from '../scanner/stability'

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

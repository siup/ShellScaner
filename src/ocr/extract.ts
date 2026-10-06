import type { OcrRule } from '../config'

// Characters OCR typically confuses with digits on industrial labels.
const CONFUSABLE: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0',
  I: '1', l: '1', '|': '1', i: '1',
  S: '5', s: '5',
  B: '8',
  Z: '2', z: '2',
  G: '6',
}

/** Turns a token into digits if it is mostly digits already, otherwise null. */
export function asNumber(token: string): string | null {
  const t = token.replace(/^[^\w|]+|[^\w|]+$/g, '')
  if (!t) return null
  const digits = [...t].filter((c) => c >= '0' && c <= '9').length
  if (digits / t.length < 0.6) return null
  const mapped = [...t].map((c) => (c >= '0' && c <= '9' ? c : (CONFUSABLE[c] ?? '?'))).join('')
  return mapped.includes('?') ? null : mapped
}

function numbersIn(line: string, re: RegExp): string[] {
  return line
    .split(/[\s:;,]+/)
    .map(asNumber)
    .filter((n): n is string => n !== null && re.test(n))
}

/**
 * Picks the serial from OCR text. Returns null when nothing or more than one
 * different candidate is found, so an ambiguous read is never accepted.
 */
export function extractSerial(text: string, rule: OcrRule): string | null {
  const re = new RegExp(rule.pattern)
  const anchor = rule.anchor ? new RegExp(rule.anchor, 'i') : null
  const skip = rule.skip ? new RegExp(rule.skip, 'i') : null
  const lines = text.split(/\r?\n/).filter((l) => l.trim())

  const unique = (xs: string[]) => [...new Set(xs)]

  if (anchor) {
    const anchored = unique(lines.filter((l) => anchor.test(l)).flatMap((l) => numbersIn(l, re)))
    if (anchored.length === 1) return anchored[0]
    if (anchored.length > 1) return null
  }
  const rest = unique(lines.filter((l) => !(skip && skip.test(l))).flatMap((l) => numbersIn(l, re)))
  return rest.length === 1 ? rest[0] : null
}

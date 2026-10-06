import type { SerialKind } from './lib/types'

/**
 * Barcode formats the scanner looks for. Once the exact production format is
 * known, trim this list (e.g. ['code_128']) to make scanning faster and stricter.
 * Names follow the BarcodeDetector spec; they are mapped to ZXing internally.
 */
export type BarcodeFormatName =
  | 'code_128'
  | 'code_39'
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'itf'

export interface SerialRule {
  /** Shown to the user when the rule rejects a code. */
  message: string
  /** Value must match this regex (string form so it can come from JSON later). */
  pattern?: string
  /** Value must NOT match this regex, e.g. to skip the Material Number. */
  rejectPattern?: string
  /** Optional per-field format restriction. */
  formats?: BarcodeFormatName[]
}

export interface ScanConfig {
  formats: BarcodeFormatName[]
  /** How long the same code must be read continuously before it is accepted. */
  stableMs: number
  /** Minimum number of matching reads within stableMs. */
  minHits: number
  /** Delay after a good read before moving to the next step. */
  advanceDelayMs: number
  rules: Record<SerialKind, SerialRule[]>
}

export const scanConfig: ScanConfig = {
  formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'],
  stableMs: 400,
  minHits: 3,
  advanceDelayMs: 500,
  rules: {
    // Example for later, once the label layout is confirmed:
    // prefab: [{ rejectPattern: '^2946\\d{4}$', message: 'This looks like a Material Number' }],
    prefab: [],
    shell: [],
  },
}

/** Returns an error message if the value breaks a rule, otherwise null. */
export function checkRules(
  kind: SerialKind,
  value: string,
  format?: BarcodeFormatName,
  config: ScanConfig = scanConfig,
): string | null {
  for (const rule of config.rules[kind]) {
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) return rule.message
    if (rule.rejectPattern && new RegExp(rule.rejectPattern).test(value)) return rule.message
    if (format && rule.formats && !rule.formats.includes(format)) return rule.message
  }
  return null
}

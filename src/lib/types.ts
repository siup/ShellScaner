export type InputMethod = 'barcode' | 'manual' | 'ocr'
export type SetStatus = 'in_progress' | 'completed'
export type SerialKind = 'prefab' | 'shell'

export interface ShellItem {
  id: string
  position: number

  prefabSerial: string
  prefabInputMethod: InputMethod

  shellSerial: string
  shellInputMethod: InputMethod

  createdAt: string
  updatedAt: string
}

export interface ShellSet {
  id: string
  name: string
  expectedShells?: number
  status: SetStatus
  createdAt: string
  updatedAt: string
  completedAt?: string
  shells: ShellItem[]
}

export interface ScannedValue {
  value: string
  method: InputMethod
}

export interface DuplicateHit {
  kind: SerialKind
  value: string
  setId: string
  setName: string
  shellId: string
  position: number
}

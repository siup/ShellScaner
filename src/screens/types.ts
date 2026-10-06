import type { Store } from '../App'
import type { useNav } from '../nav'

export type Nav = ReturnType<typeof useNav>

export interface ScreenProps {
  store: Store
  nav: Nav
}

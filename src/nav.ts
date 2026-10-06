import { useCallback, useEffect, useRef, useState } from 'react'
import type { SerialKind } from './lib/types'

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'sets' }
  | { name: 'set'; id: string }
  | { name: 'scan'; id: string }
  | { name: 'rescan'; id: string; shellId: string; kind: SerialKind }
  | { name: 'export' }

/**
 * Tiny stack router on top of the History API, so the Android back
 * button/gesture moves between screens instead of closing the app.
 */
export function useNav() {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }])
  const stackRef = useRef(stack)

  const update = useCallback((next: Route[]) => {
    stackRef.current = next
    setStack(next)
  }, [])

  useEffect(() => {
    history.replaceState({ depth: 0 }, '')
    const onPop = (e: PopStateEvent) => {
      const depth = (e.state as { depth?: number } | null)?.depth ?? 0
      update(stackRef.current.slice(0, Math.max(1, depth + 1)))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [update])

  const push = useCallback(
    (r: Route) => {
      history.pushState({ depth: stackRef.current.length }, '')
      update([...stackRef.current, r])
    },
    [update],
  )

  /** Replace the current screen (no extra back step). */
  const replace = useCallback(
    (r: Route) => update([...stackRef.current.slice(0, -1), r]),
    [update],
  )

  const back = useCallback(() => history.back(), [])

  /** Go back to the given depth (0 = home). */
  const backTo = useCallback((depth: number) => {
    const steps = stackRef.current.length - 1 - depth
    if (steps > 0) history.go(-steps)
  }, [])

  return { route: stack[stack.length - 1], depth: stack.length - 1, push, replace, back, backTo }
}

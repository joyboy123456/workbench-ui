import { lazy, Suspense, type ComponentType } from 'react'

export function lazyComponent<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  const Component = lazy(() => load().then(component => ({ default: component })))
  return function LazyComponent(props: Props) {
    return <Suspense fallback={null}><Component {...props} /></Suspense>
  }
}

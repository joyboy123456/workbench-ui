'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CanvasItem } from '@/lib/v2/types'
import { generationDisplay, type GenerationDisplay } from '@/lib/v2/generation-progress'
import { Icon } from '../icons'

type Variant = 'A' | 'B' | 'C'
interface OutputState { item: CanvasItem; display: GenerationDisplay }
const Context = createContext<{ outputs: Map<string, OutputState>; variant: Variant }>({ outputs: new Map(), variant: 'A' })

/** A single clock and monotonic cache serves both the canvas and its chat steps. */
export function GenerationStateProvider({ items, children }: { items: CanvasItem[]; children: ReactNode }) {
  const query = useSearchParams()?.get('variant')
  const variant = process.env.NODE_ENV !== 'production' && (query === 'B' || query === 'C') ? query : 'A'
  const [now, setNow] = useState(() => Date.now())
  const previous = useRef(new Map<string, OutputState>())
  const active = items.some(item => item.status === 'running' && item.generationPhase !== 'unconfirmed')
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  const outputs = useMemo(() => new Map(items.map(item => [item.id, {
    item, display: generationDisplay(item, now, previous.current.get(item.id)?.display),
  }])), [items, now])
  useEffect(() => { previous.current = outputs }, [outputs])
  return <Context.Provider value={{ outputs, variant }}>{children}</Context.Provider>
}

export function useGenerationState(item: CanvasItem) {
  const { outputs, variant } = useContext(Context)
  return { display: outputs.get(item.id)?.display ?? generationDisplay(item, Date.now()), variant }
}

export function GenerationStep({ itemId, label }: { itemId: string; label: string }) {
  const { outputs } = useContext(Context)
  const output = outputs.get(itemId)
  const active = output?.item.status === 'running'
  const failed = output?.item.status === 'failed'
  return <div className={'sl generation-step' + (active ? ' active' : '') + (failed ? ' failed' : '')} data-output-id={itemId}>
    <Icon name={failed ? 'alert' : active || !output ? 'img' : 'check'} size={12} />
    <span className="sl-txt">{label}<small>{output?.display.label ?? '图片已移出画布'}{output?.display.estimated && active ? ' · 估算' : ''}</small></span>
    {active && <i className="pulse-dot" aria-hidden />}
  </div>
}

export function GenerationArtwork({ variant }: { variant: Variant }) {
  return <div className={`generation-art generation-art-${variant}`} aria-hidden>
    {variant === 'A' ? <><i className="generation-scan" /><div className="generation-ticks">{[0, 1, 2, 3, 4].map(i => <i key={i} />)}</div></>
      : variant === 'B' ? <div className="generation-orbit"><i /><i /><Icon name="img" size={22} /></div>
        : <div className="generation-tiles">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>}
  </div>
}

export function GenerationVariantPicker() {
  const { variant } = useContext(Context)
  if (process.env.NODE_ENV === 'production') return null
  return <div className="generation-variants" role="group" aria-label="生成动效方案">
    <span>生成动效</span>
    {(['A', 'B', 'C'] as const).map((value, index) => <button key={value} aria-pressed={variant === value} onClick={() => {
      const url = new URL(window.location.href)
      url.searchParams.set('variant', value)
      window.history.replaceState(null, '', url.pathname + url.search)
    }}>{value} · {['光隙', '呼吸场', '织片'][index]}</button>)}
  </div>
}

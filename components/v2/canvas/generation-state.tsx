'use client'
import React, { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { CanvasItem, ImageRef } from '@/lib/v2/types'
import { generationDisplay, type GenerationDisplay } from '@/lib/v2/generation-progress'
import { Icon } from '../icons'

interface OutputState { item: CanvasItem; display: GenerationDisplay }
const Context = createContext<{ outputs: Map<string, OutputState> }>({ outputs: new Map() })

/** Canvas and chat read the same lifecycle snapshot, without a display timer. */
export function GenerationStateProvider({ items, children }: { items: CanvasItem[]; children: ReactNode }) {
  const outputs = useMemo(() => new Map(items.map(item => [item.id, {
    item, display: generationDisplay(item),
  }])), [items])
  return <Context.Provider value={{ outputs }}>{children}</Context.Provider>
}

export function useGenerationState(item: CanvasItem) {
  const { outputs } = useContext(Context)
  return { display: outputs.get(item.id)?.display ?? generationDisplay(item) }
}

export function useChatResultOutput(resultId: string, itemId?: string): { output?: OutputState } {
  const { outputs } = useContext(Context)
  if (itemId) {
    const byItem = outputs.get(itemId)
    if (byItem) return { output: byItem }
  }
  for (const entry of outputs.values()) {
    if (entry.item.ref.id === resultId) return { output: entry }
  }
  return { output: undefined }
}

export function GenerationStep({ itemId, label }: { itemId: string; label: string }) {
  const { outputs } = useContext(Context)
  const output = outputs.get(itemId)
  const active = output?.item.status === 'running'
  const failed = output?.item.status === 'failed'
  return <div className={'sl generation-step' + (active ? ' active' : '') + (failed ? ' failed' : '')} data-output-id={itemId}>
    <Icon name={failed ? 'alert' : active || !output ? 'img' : 'check'} size={12} />
    <span className="sl-txt">{label}<small>{output?.display.label ?? '图片已移出画布'}</small></span>
    {active && <i className="pulse-dot" aria-hidden />}
  </div>
}

/** 同一批次只显示真实完成计数；缺失的画布节点不视作成功。 */
export function GenerationBatchStep({ itemIds, label }: { itemIds: string[]; label: string }) {
  const { outputs } = useContext(Context)
  const states = itemIds.map(id => outputs.get(id)?.item.status)
  const total = itemIds.length
  const done = states.filter(st => st === 'done').length
  const failed = states.filter(st => st === 'failed').length
  const active = states.some(st => st === 'running')
  const settled = done + failed === total
  const rawBase = label.replace(/\s*·\s*第\s*\d+\s*张$/, '')
  const base = /^图片\s*\d+$/.test(rawBase) ? '图片生成' : rawBase
  const status = active
    ? `已完成 ${done}/${total}`
    : failed
      ? `${done} 张完成 · ${failed} 张未完成`
      : done === total ? '已完成' : '状态待确认'
  return <div className={'sl generation-step' + (active ? ' active' : settled ? ' done' : '') + (failed && !active ? ' failed' : '')} data-output-ids={itemIds.join(' ')}>
    <Icon name={failed && !active ? 'alert' : 'img'} size={13} />
    <span className="sl-txt">{base} · 生成 {total} 张 · <span className="tnum">{status}</span></span>
    {active && <i className="pulse-dot" aria-hidden />}
  </div>
}

export const GEN_SMOKE_SRC = '/placeholder/v2-gen-smoke.mp4'

function genHash(id: string): number {
  // FNV-1a + murmur3 收尾混合：同批 id 只差末位字符时也要散开，避免多卡同相位
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16
  return h >>> 0
}

/** 多卡错相：按 id 哈希出 0–3.8s 的负延迟，写到 --delay；画布节点与对话占位共用。 */
export function genDelay(id: string): string {
  return `-${((genHash(id) % 3800) / 1000).toFixed(2)}s`
}

export function genSmokeVariant(id: string) {
  const h = genHash(id)
  const flipX = (h & 1) === 0 ? 1 : -1
  const flipY = (h & 2) === 0 ? 1 : -1
  const rate = [0.66, 0.72, 0.78, 0.70][(h >>> 2) & 3]
  const offsetSec = Number(((h % 3900) / 1000).toFixed(2))
  return { flipX, flipY, rate, offsetSec }
}

/** 来源图虚化底：编辑现有图片时作为底层，上叠物理流体烟雾层 .gen-fx。 */
export function GenerationSource({ image }: { image?: ImageRef }) {
  if (!image?.url) return null
  return <i className="gen-src" style={{ backgroundImage: `url(${image.thumbUrl ?? image.url})` }} aria-hidden />
}

/** 物理流体烟雾动效层：共享 60fps Navier-Stokes 无缝循环烟雾，按 id 错相与四向镜像避免同批多卡同相。 */
export function GenerationFx({ id, paused = false }: { id: string; paused?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { flipX, flipY, rate, offsetSec } = useMemo(() => genSmokeVariant(id), [id])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let seeked = false
    const applyOffset = () => {
      if (seeked || el.readyState < 1) return
      seeked = true
      try { el.currentTime = offsetSec } catch { /* ignore */ }
    }
    const sync = () => {
      el.defaultPlaybackRate = rate
      el.playbackRate = rate
      applyOffset()
      if (paused || mq?.matches) {
        el.pause()
      } else {
        void el.play().catch(() => {})
      }
    }
    el.addEventListener('loadedmetadata', sync)
    mq?.addEventListener?.('change', sync)
    sync()
    return () => {
      el.removeEventListener('loadedmetadata', sync)
      mq?.removeEventListener?.('change', sync)
    }
  }, [offsetSec, paused, rate])

  return (
    <i className="gen-fx" aria-hidden>
      <video
        ref={ref}
        className="gen-smoke"
        src={GEN_SMOKE_SRC}
        muted
        loop
        playsInline
        autoPlay={!paused}
        preload="auto"
        style={{ transform: `scale(${flipX}, ${flipY})` }}
      />
    </i>
  )
}

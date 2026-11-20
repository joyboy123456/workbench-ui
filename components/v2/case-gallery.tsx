'use client'
/**
 * 案例库（CASES2）：分类 tab + 工具筛选 + 按真实宽高的瀑布流 + 懒加载缩略图 + 滚动加载 + 案例详情。
 * 数据只走 useV2().listCasePage；卡片只加载缩略图，原图（详情大图）仅在详情打开时加载。
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useV2 } from '@/lib/v2/data-source'
import type { CaseCategory, CaseExample, CaseFacets } from '@/lib/v2/types'
import { Icon } from './icons'
import { SlidingTabs } from './ui'

export const CASE_CATEGORY_ORDER_PUBLIC: CaseCategory[] = ['model', 'main', 'detail', 'style', 'retouch', 'fabric']

export const CASE_CATEGORY_LABEL: Record<CaseCategory, string> = {
  model: '模特图',
  main: '主图',
  detail: '详情页',
  style: '款式',
  retouch: '修图',
  fabric: '图案面料',
}

const CATEGORY_ORDER: CaseCategory[] = ['model', 'main', 'detail', 'style', 'retouch', 'fabric']

type Tab = 'all' | CaseCategory

/** 卡片比例夹在 9:16 ~ 16:10 之间，避免超长图撑破瀑布流 */
function cardRatio(c: CaseExample): number {
  const { width, height } = c.image
  const r = width > 0 && height > 0 ? height / width : c.aspect === 'wide' ? 0.75 : c.aspect === 'square' ? 1 : 1.333
  return Math.max(0.62, Math.min(1.78, r))
}

function columnsFor(width: number, max: number): number {
  const n = width >= 1560 ? 6 : width >= 1260 ? 5 : width >= 980 ? 4 : width >= 640 ? 3 : 2
  return Math.max(1, Math.min(max, n))
}

/** 贪心分列：按顺序放进当前最矮的列；顺序相同则前缀布局不变，「加载更多」不会让已显示的卡片跳位 */
function masonry<T>(items: T[], cols: number, ratio: (item: T) => number): { item: T; index: number }[][] {
  const out = Array.from({ length: cols }, () => [] as { item: T; index: number }[])
  const heights = new Array<number>(cols).fill(0)
  items.forEach((item, index) => {
    let col = 0
    for (let k = 1; k < cols; k++) if (heights[k] < heights[col] - 0.001) col = k
    out[col].push({ item, index })
    heights[col] += ratio(item) + 0.14
  })
  return out
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

const SKELETON_RATIOS = [1.33, 1, 1.5, 0.75, 1.33, 1.2, 1, 1.5, 0.8, 1.33, 1.25, 1]

export interface CaseGalleryProps {
  /** 做同款（登录、建项目等由调用方处理） */
  onMakeSame: (c: CaseExample) => void
  /** 只看某个工具的案例（工具广场抽屉用），隐藏分类 tab 与工具筛选 */
  toolId?: string
  /** 区块标题；不给则不渲染标题行 */
  title?: string
  /** 标题行右侧附加内容 */
  extra?: ReactNode
  pageSize?: number
  maxColumns?: number
  /** 滚动容器（抽屉内滚动时传入）；默认视口 */
  scrollRoot?: React.RefObject<HTMLElement | null>
  /** 由外部控制分类（首页场景胶囊用）；给了就以它为准 */
  category?: 'all' | CaseCategory
  /** 隐藏标题行里的分类 tab 与工具胶囊（筛选由外部负责） */
  hideFilters?: boolean
}

export function CaseGallery({ onMakeSame, toolId: fixedToolId, title, extra, pageSize = 24, maxColumns = 6, scrollRoot, category: fixedCategory, hideFilters }: CaseGalleryProps) {
  const ds = useV2()
  const [tab, setTab] = useState<Tab>('all')
  const [tool, setTool] = useState<string | undefined>(undefined)
  const [items, setItems] = useState<CaseExample[]>([])
  const [total, setTotal] = useState(0)
  const [nextOffset, setNextOffset] = useState<number | null>(0)
  const [facets, setFacets] = useState<CaseFacets | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [detail, setDetail] = useState<number | null>(null)
  const gen = useRef(0)
  const busy = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const width = useWidth(wrapRef)
  const cols = columnsFor(width || 1200, maxColumns)

  const toolId = fixedToolId ?? tool
  const activeTab = fixedCategory ?? tab
  const category = activeTab === 'all' ? undefined : activeTab

  const fetchPage = useCallback(async (offset: number, g: number) => {
    const page = await ds.listCasePage({ limit: pageSize, offset, ...(category ? { category } : {}), ...(toolId ? { toolId } : {}) })
    if (g !== gen.current) return
    setItems((prev) => (offset === 0 ? page.cases : [...prev, ...page.cases.filter((c) => !prev.some((p) => p.id === c.id))]))
    setTotal(page.total)
    setNextOffset(page.nextOffset)
    setFacets(page.facets)
  }, [ds, pageSize, category, toolId])

  const reset = useCallback(() => {
    const g = ++gen.current
    busy.current = true
    setStatus('loading')
    setMoreError(false)
    setItems([])
    setNextOffset(0)
    fetchPage(0, g).then(
      () => { if (g === gen.current) setStatus('ready') },
      () => { if (g === gen.current) setStatus('error') },
    ).finally(() => { if (g === gen.current) busy.current = false })
  }, [fetchPage])

  useEffect(() => { reset() }, [reset])

  const loadMore = useCallback(() => {
    if (busy.current || nextOffset == null || status !== 'ready') return
    const g = gen.current
    busy.current = true
    setLoadingMore(true)
    setMoreError(false)
    fetchPage(nextOffset, g).catch(() => { if (g === gen.current) setMoreError(true) }).finally(() => {
      if (g === gen.current) { busy.current = false; setLoadingMore(false) }
    })
  }, [fetchPage, nextOffset, status])

  // 滚动到底自动加载；出错后停自动加载，改为按钮重试
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || nextOffset == null || status !== 'ready' || moreError) return
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore() }, { root: scrollRoot?.current ?? null, rootMargin: '0px 0px 640px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore, nextOffset, status, moreError, scrollRoot])

  const tabs = useMemo(() => {
    const counts = new Map((facets?.categories ?? []).map((c) => [c.id, c.count]))
    return [
      { id: 'all' as Tab, name: '全部' },
      ...CATEGORY_ORDER.filter((id) => (counts.get(id) ?? 0) > 0 || !facets).slice(0, facets ? 6 : 4).map((id) => ({ id: id as Tab, name: CASE_CATEGORY_LABEL[id] })),
    ]
  }, [facets])
  const allCount = useMemo(() => (facets?.categories ?? []).reduce((n, c) => n + c.count, 0), [facets])
  const toolChips = useMemo(() => (facets?.tools ?? []).slice(0, 14), [facets])

  const columns = useMemo(() => masonry(items, cols, cardRatio), [items, cols])
  const skeleton = useMemo(() => masonry(SKELETON_RATIOS.slice(0, Math.max(cols * 2, 6)), cols, (r) => r), [cols])

  return (
    <div className="cs-gallery" ref={wrapRef}>
      {!fixedToolId && !hideFilters && (
        <>
          {title && (
            <div className="hm-sec hm-sec-cases cs-head">
              <h2>{title}</h2>
              {allCount > 0 && <span className="cs-count tnum">{allCount} 个真实案例</span>}
              <SlidingTabs tabs={tabs} active={tab} onChange={(t) => { setTab(t); setTool(undefined) }} small />
              {extra}
            </div>
          )}
          {toolChips.length > 1 && (
            <div className="cs-chips" role="toolbar" aria-label="按工具筛选">
              <button type="button" className={'cs-chip' + (!tool ? ' on' : '')} onClick={() => setTool(undefined)}>全部工具</button>
              {toolChips.map((t) => (
                <button key={t.id} type="button" className={'cs-chip' + (tool === t.id ? ' on' : '')} onClick={() => setTool(tool === t.id ? undefined : t.id)}>
                  {t.name}<small className="tnum">{t.count}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {status === 'error' ? (
        <div className="cs-state">
          <Icon name="alert" size={18} />
          <span>案例加载失败，检查网络后重试</span>
          <button type="button" className="cs-btn" onClick={reset}><Icon name="retry" size={13} />重试</button>
        </div>
      ) : status === 'loading' ? (
        <div className="cs-grid" aria-busy="true">
          {skeleton.map((col, k) => (
            <div key={k} className="cs-col">
              {col.map(({ item: r, index }) => (
                <div key={index} className="cs-card skel-card"><div className="cs-ph skel" style={{ aspectRatio: `1 / ${r}` }} /><div className="cs-cap-skel" /></div>
              ))}
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="cs-state"><Icon name="img" size={18} /><span>这一类还没有案例，换个分类看看</span></div>
      ) : (
        <div className="cs-grid">
          {columns.map((col, k) => (
            <div key={k} className="cs-col">
              {col.map(({ item, index }) => (
                <CaseCard key={item.id} c={item} i={index} onOpen={() => setDetail(index)} onMakeSame={() => onMakeSame(item)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {status === 'ready' && items.length > 0 && (
        <div className="cs-foot" ref={sentinelRef}>
          {nextOffset != null ? (
            <button type="button" className="cs-btn" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? <><span className="cs-spin" aria-hidden />加载中</> : moreError ? <><Icon name="retry" size={13} />加载失败，重试</> : <>加载更多</>}
              <small className="tnum">{items.length} / {total}</small>
            </button>
          ) : (
            <span className="cs-end tnum">已显示全部 {total} 个案例</span>
          )}
        </div>
      )}

      {detail !== null && items[detail] && (
        <CaseDetail
          cases={items}
          index={detail}
          onIndexChange={(i) => { setDetail(i); if (i >= items.length - 3) loadMore() }}
          onClose={() => setDetail(null)}
          onMakeSame={(c) => { setDetail(null); onMakeSame(c) }}
        />
      )}
    </div>
  )
}

function CaseCard({ c, i, onOpen, onMakeSame }: { c: CaseExample; i: number; onOpen: () => void; onMakeSame: () => void }) {
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading')
  return (
    <div className="cs-card" style={{ '--i': i % 24 } as CSSProperties}>
      <button type="button" className="cs-hit" onClick={onOpen} aria-label={`查看案例：${c.title}`}>
        <span className={'cs-ph' + (state === 'loading' ? ' skel' : '')} style={{ aspectRatio: `1 / ${cardRatio(c)}` }}>
          {state !== 'err' ? (
            <img
              src={c.image.thumbUrl ?? c.image.url}
              alt={c.title}
              loading="lazy"
              decoding="async"
              width={c.image.width}
              height={c.image.height}
              className={state === 'ok' ? 'ok' : ''}
              onLoad={() => setState('ok')}
              onError={() => setState('err')}
            />
          ) : (
            <span className="cs-broken"><Icon name="img" size={18} /></span>
          )}
          <span className="cs-shade" aria-hidden />
          <span className="cs-meta">
            <b>{c.title}</b>
            {c.toolName && <small>{c.toolName}</small>}
          </span>
        </span>
      </button>
      <button type="button" className="cs-same" onClick={onMakeSame}>
        <Icon name="wand" size={12} />做同款
      </button>
    </div>
  )
}

/** 案例详情：大图、参考图、所需素材提示、所用能力、做同款（不暴露内部长提示词与模型配比）。←/→ 切换，Esc 关闭。 */
export function CaseDetail({ cases, index, onIndexChange, onClose, onMakeSame }: {
  cases: CaseExample[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
  onMakeSame: (c: CaseExample) => void
}) {
  const c = cases[index]
  const [loaded, setLoaded] = useState<string | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setHost(document.querySelector<HTMLElement>('.v2') ?? document.body) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && index < cases.length - 1) onIndexChange(index + 1)
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [index, cases.length, onClose, onIndexChange])
  useEffect(() => { panelRef.current?.focus() }, [])

  if (!c || !host) return null
  const meta = [c.meta?.aspectRatio, c.meta?.resolution?.toUpperCase()].filter(Boolean).join(' · ')
  const hints = c.inputHint?.length ? c.inputHint : ['服装商品图']

  return createPortal(
    <div className="cs-dlg-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cs-dlg" role="dialog" aria-modal="true" aria-label={c.title} tabIndex={-1} ref={panelRef}>
        <div className="cs-dlg-stage">
          {loaded !== c.id && <span className="cs-dlg-load"><span className="cs-spin" aria-hidden /></span>}
          <img key={c.id} src={c.image.url} alt={c.title} className={loaded === c.id ? 'ok' : ''} onLoad={() => setLoaded(c.id)} style={{ backgroundImage: c.image.thumbUrl ? `url(${c.image.thumbUrl})` : undefined }} />
          {index > 0 && <button type="button" className="cs-nav l" onClick={() => onIndexChange(index - 1)} aria-label="上一个"><Icon name="left" size={16} /></button>}
          {index < cases.length - 1 && <button type="button" className="cs-nav r" onClick={() => onIndexChange(index + 1)} aria-label="下一个"><Icon name="right" size={16} /></button>}
        </div>
        <aside className="cs-dlg-side">
          <button type="button" className="cs-x ibtn" onClick={onClose} aria-label="关闭"><Icon name="x" size={14} /></button>
          <div className="cs-tags">
            {c.category && <span className="cs-tag">{CASE_CATEGORY_LABEL[c.category]}</span>}
            {meta && <span className="cs-tag dim tnum">{meta}</span>}
          </div>
          <h3>{c.title}</h3>
          {c.toolName && <div className="cs-tool"><Icon name="zap" size={13} />{c.toolName}</div>}

          {!!c.references?.length && (
            <section className="cs-sec">
              <h4>参考图 <small className="tnum">{c.references.length}</small></h4>
              <div className="cs-refs">
                {c.references.slice(0, 6).map((r) => (
                  <figure key={r.id}>
                    <img src={r.thumbUrl ?? r.url} alt={r.label ?? '参考图'} loading="lazy" />
                    {r.label && <figcaption>{r.label}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="cs-sec">
            <h4>做同款准备</h4>
            <p className="cs-prompt open">上传你的{hints.join('、')}，Agent 将自动沿用该案例的构图、光影与版式完成创作。</p>
          </section>

          <div className="cs-dlg-ft">
            <button type="button" className="cs-primary" onClick={() => onMakeSame(c)}><Icon name="wand" size={14} />做同款</button>
            <small>进入画布 Agent 对话，一键复刻同款效果</small>
          </div>
          <div className="cs-dlg-pos tnum">{index + 1} / {cases.length}</div>
        </aside>
      </div>
    </div>,
    host,
  )
}

/** 首页精选轮播：4–6 张高质量竖图，交叉淡入 + 缓慢推镜，右下缩略拼贴可切换 */
/** 首页「探索」里的推荐条（对齐 Lovart 首页：左侧标题 + 右侧一排小卡） */
export function FeaturedStrip({ title, subtitle, href, onOpen }: { title: string; subtitle: string; href: string; onOpen: (cases: CaseExample[], index: number) => void }) {
  const ds = useV2()
  const [list, setList] = useState<CaseExample[] | null>(null)
  useEffect(() => {
    let alive = true
    ds.listFeaturedCases().then((l) => { if (alive) setList(l.slice(0, 6)) }, () => { if (alive) setList([]) })
    return () => { alive = false }
  }, [ds])
  if (list && list.length === 0) return null
  return (
    <div className="lv-strip">
      <div className="lv-strip-tx">
        <span className="lv-strip-eyebrow">LOOKBOOK · 上新企划</span>
        <b>{title}</b>
        <a href={href}>{subtitle}<Icon name="right" size={11} /></a>
      </div>
      <div className="lv-strip-cards">
        {(list ?? Array.from({ length: 6 }, () => null)).map((c, i) => c ? (
          <button key={c.id} type="button" className="lv-strip-card" onClick={() => onOpen(list ?? [], i)}>
            <span className="lv-strip-th"><img src={c.image.thumbUrl ?? c.image.url} alt="" loading="lazy" /></span>
            <span className="lv-strip-n">{c.title}</span>
          </button>
        ) : <span key={i} className="lv-strip-card"><span className="lv-strip-th skel" /></span>)}
      </div>
    </div>
  )
}

export function FeaturedCases({ onOpen, onMakeSame }: { onOpen: (cases: CaseExample[], index: number) => void; onMakeSame: (c: CaseExample) => void }) {
  const ds = useV2()
  const [list, setList] = useState<CaseExample[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  /** 只给当前与下一张设 src，其余精选图按需加载 */
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, 1]))

  useEffect(() => {
    let alive = true
    ds.listFeaturedCases().then((l) => { if (alive) setList(l.slice(0, 6)) }, () => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [ds])
  useEffect(() => {
    if (!list || list.length < 2 || paused) return
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % list.length), 5200)
    return () => window.clearTimeout(t)
  }, [list, idx, paused])

  useEffect(() => {
    if (!list) return
    setSeen((prev) => (prev.has(idx) && prev.has((idx + 1) % list.length) ? prev : new Set([...prev, idx, (idx + 1) % list.length])))
  }, [idx, list])

  if (failed || (list && list.length === 0)) return <div className="hm-banner empty"><span>精选案例暂不可用</span></div>
  if (!list) return <div className="hm-banner cs-feat skel" aria-busy="true" />
  const c = list[idx % list.length]
  const others = list.map((x, i) => ({ x, i })).filter(({ i }) => i !== idx).slice(0, 3)

  return (
    <div className="hm-banner cs-feat" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <button type="button" className="cs-feat-hit" onClick={() => onOpen(list, idx)} aria-label={`查看精选案例：${c.title}`}>
        {list.map((x, i) => (
          seen.has(i) ? <img key={x.id} src={x.image.url} alt="" className={i === idx ? 'on' : ''} decoding="async" /> : null
        ))}
      </button>
      <span className="cs-feat-shade" aria-hidden />
      <div className="cs-feat-tx">
        <span className="cs-feat-kicker"><Icon name="sparkles" size={11} />精选案例{c.toolName && !c.title.includes(c.toolName) ? ` · ${c.toolName}` : ''}</span>
        <b>{c.title}</b>
        <button type="button" className="cs-primary sm" onClick={() => onMakeSame(c)}><Icon name="wand" size={12} />做同款</button>
      </div>
      <div className="cs-feat-thumbs">
        {others.map(({ x, i }) => (
          <button key={x.id} type="button" onClick={() => setIdx(i)} aria-label={`切换到：${x.title}`}>
            <img src={x.image.thumbUrl ?? x.image.url} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      <div className="cs-feat-bars" role="tablist" aria-label="切换精选案例">
        {list.map((x, i) => (
          <button key={x.id} type="button" role="tab" aria-selected={i === idx} aria-label={x.title} className={i === idx ? 'on' + (paused ? ' paused' : '') : i < idx ? 'done' : ''} onClick={() => setIdx(i)}><i /></button>
        ))}
      </div>
    </div>
  )
}

'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { TOOL_CATEGORIES } from '@/lib/v2/mock'
import type { CaseExample, ChatAttachment, ToolCatalogItem, ToolCategoryId, ToolCover } from '@/lib/v2/types'
import { CaseGallery } from './case-gallery'
import { ToolLaunchModal } from './tool-launch-modal'
import { PENDING_KEY } from '@/lib/v2/pending-message'
import { Icon } from './icons'
import { Shell } from './shell'
import { CardSkeleton, SlidingTabs } from './ui'
import { useV2Auth } from './auth'
import { createAndOpenProject, singleFlight } from '@/lib/v2/entry-actions'

type Tab = 'all' | 'featured' | ToolCategoryId
const TABS: { id: Tab; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'featured', name: '精选' },
  ...TOOL_CATEGORIES,
]

/** AI 工具广场：工具 = 提示词模板 + 固定流程。点卡片进入画布，自动打开该工具参数面板，再上传来源图片 */
export function ToolsPage() {
  const sp = useSearchParams()
  const { data: tools, loading } = useLoad((d) => d.listToolCatalog())
  const [tab, setTab] = useState<Tab>((sp?.get('cat') as Tab) || 'all')
  const [q, setQ] = useState('')
  const [toolId, setToolId] = useState(sp?.get('tool')?.trim() ?? '')
  const [activeTool, setActiveTool] = useState<ToolCatalogItem | null>(null)
  const [casesOf, setCasesOf] = useState<ToolCatalogItem | null>(null)
  const makeSame = useMakeSameCase()

  useEffect(() => {
    setToolId(sp?.get('tool')?.trim() ?? '')
    const nextCat = sp?.get('cat')?.trim() as Tab | undefined
    if (nextCat && TABS.some((item) => item.id === nextCat)) {
      setTab(nextCat)
      setQ('')
    } else if (!nextCat && !sp?.get('tool')) {
      setTab('all')
    }
  }, [sp])

  const list = useMemo(() => {
    const k = q.trim()
    return (tools ?? []).filter((t) => !k || t.name.includes(k) || t.desc.includes(k) || t.inputs.some((i) => i.includes(k)))
  }, [tools, q])

  const sections = useMemo(() => {
    if (q.trim()) return [{ id: 'search', name: `搜索「${q.trim()}」`, items: list }]
    if (toolId) {
      const matched = list.filter((t) => t.id === toolId)
      if (matched.length) return [{ id: 'tool', name: `指定工具 · ${matched[0].name}`, items: matched }]
    }
    if (tab === 'featured') return [{ id: 'featured', name: '精选', items: list.filter((t) => t.featured) }]
    if (tab !== 'all') return [{ id: tab, name: TOOL_CATEGORIES.find((c) => c.id === tab)?.name ?? '', items: list.filter((t) => t.category === tab) }]
    // 对齐 Lovart Skills：「全部」是一张平铺网格，精选在前
    return [{ id: 'all', name: '', items: [...list.filter((t) => t.featured), ...list.filter((t) => !t.featured)] }]
  }, [list, tab, q, toolId])

  return (
    <Shell>
      <div className="tl-wrap">
        <header className="tl-head">
          <h1>AI 工具</h1>
        </header>

        <div className="tl-bar">
          <SlidingTabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setQ(''); setToolId('') }} />
          <label className="tl-search">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setToolId('') }} placeholder="搜工具，如 抠图、换衣、线稿" />
            {q && <button className="ibtn" onClick={() => setQ('')} aria-label="清空"><Icon name="x" size={12} /></button>}
          </label>
        </div>

        {loading && !tools ? (
          <div className="tl-grid" style={{ marginTop: 28 }}><CardSkeleton count={10} /></div>
        ) : (
          sections.map((s) => (
            <section key={s.id} className="tl-sec">
              {s.name && (
                <div className="tl-sec-h">
                  <span>{s.name}</span>
                  <small className="tnum">{s.items.length}</small>
                </div>
              )}
              {s.items.length === 0 ? (
                <div className="tl-empty">没有匹配的工具，换个词试试，或者直接在首页对话里说你想做什么</div>
              ) : (
                <div className="tl-grid">
                  {s.items.map((t, i) => (
                    <div key={s.id + t.id} className="tl-item">
                      <ToolCard t={t} i={i} busy={false} onOpen={() => setActiveTool(t)} />
                      {!!t.caseCount && (
                        <button type="button" className="tl-cases" onClick={() => setCasesOf(t)}>
                          <Icon name="img" size={11} />{t.caseCount} 个案例
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
      {activeTool && <ToolLaunchModal tool={activeTool} onClose={() => setActiveTool(null)} />}
      {casesOf && <ToolCasesDrawer tool={casesOf} onClose={() => setCasesOf(null)} onMakeSame={(c) => { setCasesOf(null); void makeSame(c) }} />}

    </Shell>
  )
}

function ToolCard({ t, i, busy, onOpen }: { t: ToolCatalogItem; i: number; busy?: boolean; onOpen: () => void }) {
  return (
    <button className={'tl-card' + (t.status !== 'ready' ? ' dim' : '')} style={{ '--i': i } as CSSProperties} disabled={busy || t.status !== 'ready'} onClick={onOpen}>
      <div className="tl-cov">
        <Cover c={t.cover} />
        {t.status === 'config' && <span className="tl-badge">需配置</span>}
        {t.status === 'soon' && <span className="tl-badge">即将上线</span>}
        <span className="tl-go">{busy ? "打开中…" : <><Icon name="upload" size={11} />打开工具</>}</span>
      </div>
      <div className="tl-t">{t.name}</div>
      <div className="tl-d">{t.desc}</div>
    </button>
  )
}

/** 封面示意。interactive=true 时 split 可拖动分割线 */
function Cover({ c, interactive }: { c: ToolCover; interactive?: boolean }) {
  const [pos, setPos] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const drag = (e: RPointerEvent) => {
    if (!interactive || !ref.current) return
    if (e.type === 'pointermove' && e.buttons !== 1) return
    const r = ref.current.getBoundingClientRect()
    setPos(Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100)))
  }
  const imgs = [c.before, c.after, ...(c.extra ?? [])]

  if (c.fx === 'grid') {
    return <div className="cv cv-grid">{imgs.slice(0, 4).map((u, k) => <img key={k} src={u} alt="" />)}</div>
  }
  if (c.fx === 'stack') {
    return (
      <div className="cv cv-stack">
        {imgs.slice(0, 3).map((u, k) => <img key={k} src={u} alt="" style={{ '--k': k } as CSSProperties} />)}
      </div>
    )
  }
  if (c.fx === 'text') {
    return (
      <div className="cv cv-text">
        <img src={c.before} alt="" />
        <div className="cv-lines"><i /><i /><i /><i style={{ width: '46%' }} /></div>
      </div>
    )
  }
  if (c.fx === 'swatch') {
    return (
      <div className="cv cv-swatch">
        {['0deg', '140deg', '220deg', '300deg'].map((h, k) => <img key={k} src={c.before} alt="" style={{ filter: `hue-rotate(${h}) saturate(${k ? 1.4 : 1})` }} />)}
      </div>
    )
  }
  if (c.fx === 'tile') {
    return (
      <div className="cv cv-tile">
        <img src={c.before} alt="" />
        <div className="cv-pat" style={{ backgroundImage: `url(${c.before})` }} />
      </div>
    )
  }
  // 同一张图左右两半做效果，或两张图做前后对比
  return (
    <div
      ref={ref}
      className={'cv cv-split fx-' + c.fx + (interactive ? ' live' : '')}
      style={{ '--pos': pos + '%' } as CSSProperties}
      onPointerDown={drag}
      onPointerMove={drag}
    >
      <img className="b" src={c.before} alt="" />
      <div className="a"><img src={c.after} alt="" />{c.fx === 'logo' && <span className="cv-logo">LOGO</span>}</div>
      {c.fx === 'mark' && <span className="cv-mark">© SAMPLE · SAMPLE · SAMPLE</span>}
      <span className="cv-line"><b><Icon name="left" size={9} /><Icon name="right" size={9} /></b></span>
      {interactive && (<><span className="cv-tag l">原图</span><span className="cv-tag r">效果</span></>)}
    </div>
  )
}

export function useStartTool() {
  const ds = useV2()
  const router = useRouter()
  const { requireAuth } = useV2Auth()
  const [busy, setBusy] = useState<string | null>(null)
  const lock = useRef(singleFlight())
  const navigating = useRef(false)
  const start = (t: ToolCatalogItem) => {
    if (navigating.current || t.status !== 'ready') return
    return lock.current(async () => {
      setBusy(t.id)
      try {
        await requireAuth(async () => {
          await createAndOpenProject(() => ds.createProject({ name: t.name }), href => router.push(href), t.id)
          navigating.current = true
        })
      } finally { if (!navigating.current) setBusy(null) }
    })
  }
  return { start, busy }
}

/** 做同款：登录后新建项目并带入脱敏短词与 caseId，引导用户上传自身商品图后走 Agent 主循环（不暴露原始长 Prompt）。 */
export function useMakeSameCase() {
  const ds = useV2()
  const router = useRouter()
  const { requireAuth } = useV2Auth()
  return (c: CaseExample) => requireAuth(async () => {
    const p = await ds.createProject({ name: c.title })
    sessionStorage.setItem(PENDING_KEY(p.id), JSON.stringify({
      text: c.keyword,
      mode: 'agent',
      attachments: [] as ChatAttachment[],
      caseId: c.id,
      prefillOnly: true,
      ...(c.inputHint?.length ? { inputHint: c.inputHint } : {}),
    }))
    router.push(`/v2/canvas/${p.id}?view=split`)
  })
}

/** 工具案例抽屉：该工具的全部真实案例（瀑布流 + 详情 + 做同款） */
function ToolCasesDrawer({ tool, onClose, onMakeSame }: { tool: ToolCatalogItem; onClose: () => void; onMakeSame: (c: CaseExample) => void }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setHost(document.querySelector<HTMLElement>('.v2') ?? document.body) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.cs-dlg')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!host) return null
  return createPortal(
    <div className="tl-cases-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tl-cases-sheet" role="dialog" aria-modal="true" aria-label={`${tool.name} 案例`}>
        <header>
          <div>
            <b>{tool.name}</b>
            <small>{tool.caseCount} 个真实案例 · {tool.desc}</small>
          </div>
          <button type="button" className="ibtn" onClick={onClose} aria-label="关闭"><Icon name="x" size={14} /></button>
        </header>
        <div className="tl-cases-body" ref={bodyRef}>
          <CaseGallery toolId={tool.id} onMakeSame={onMakeSame} maxColumns={4} pageSize={20} scrollRoot={bodyRef} />
        </div>
      </div>
    </div>,
    host,
  )
}

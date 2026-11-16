'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { TOOL_CATEGORIES } from '@/lib/v2/mock'
import type { ChatAttachment, ToolCatalogItem, ToolCategoryId, ToolCover } from '@/lib/v2/types'
import { PENDING_KEY } from './home-page'
import { Icon } from './icons'
import { Shell } from './shell'
import { CardSkeleton, SlidingTabs, pickFiles } from './ui'
import { useV2Auth } from './auth'

type Tab = 'all' | 'featured' | ToolCategoryId
const TABS: { id: Tab; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'featured', name: '精选' },
  ...TOOL_CATEGORIES,
]

/** AI 工具广场：工具 = 提示词模板 + 固定流程。点卡片直接选图进画布，自动打开该工具参数面板 */
export function ToolsPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const { data: tools, loading } = useLoad((d) => d.listToolCatalog())
  const [tab, setTab] = useState<Tab>((sp?.get('cat') as Tab) || 'all')
  const [q, setQ] = useState('')
  const { start, busy } = useStartTool()



  const list = useMemo(() => {
    const k = q.trim()
    return (tools ?? []).filter((t) => !k || t.name.includes(k) || t.desc.includes(k) || t.inputs.some((i) => i.includes(k)))
  }, [tools, q])

  const sections = useMemo(() => {
    if (q.trim()) return [{ id: 'search', name: `搜索「${q.trim()}」`, items: list }]
    if (tab === 'featured') return [{ id: 'featured', name: '精选', items: list.filter((t) => t.featured) }]
    if (tab !== 'all') return [{ id: tab, name: TOOL_CATEGORIES.find((c) => c.id === tab)?.name ?? '', items: list.filter((t) => t.category === tab) }]
    return [
      { id: 'featured', name: '精选', items: list.filter((t) => t.featured) },
      ...TOOL_CATEGORIES.map((c) => ({ id: c.id, name: c.name, items: list.filter((t) => t.category === c.id) })),
    ]
  }, [list, tab, q])

  return (
    <Shell>
      <div className="tl-wrap">
        <header className="tl-head">
          <h1>AI 工具</h1>
          <p>{tools ? `${tools.length} 个工具` : '工具'}，每个都是调好的提示词模板和固定流程。点一个，传图，直接进画布出图</p>
        </header>

        <div className="tl-bar">
          <SlidingTabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setQ('') }} />
          <label className="tl-search">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜工具，如 抠图、换衣、线稿" />
            {q && <button className="ibtn" onClick={() => setQ('')} aria-label="清空"><Icon name="x" size={12} /></button>}
          </label>
        </div>

        {loading && !tools ? (
          <div className="tl-grid" style={{ marginTop: 28 }}><CardSkeleton count={10} /></div>
        ) : (
          sections.map((s) => (
            <section key={s.id} className="tl-sec">
              <div className="tl-sec-h">
                <span>{s.name}</span>
                <small className="tnum">{s.items.length}</small>
              </div>
              {s.items.length === 0 ? (
                <div className="tl-empty">没有匹配的工具，换个词试试，或者直接在首页对话里说你想做什么</div>
              ) : (
                <div className="tl-grid">
                  {s.items.map((t, i) => <ToolCard key={s.id + t.id} t={t} i={i} busy={busy === t.id} onOpen={() => start(t)} />)}
                </div>
              )}
            </section>
          ))
        )}
        <div className="tl-foot">封面、积分、工具文案为占位，接线后换成每个工具的真实前后案例</div>
      </div>

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
        <span className="tl-go">{busy ? "打开中…" : <><Icon name="upload" size={11} />传图开始</>}</span>
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
  const start = async (t: ToolCatalogItem) => {
    if (busy || t.status !== 'ready') return
    return requireAuth(async () => {
      setBusy(t.id)
      try {
        const files = await pickFiles()
        const imgs = files.filter((f) => f.type.startsWith('image/'))
        if (!imgs.length) return
        const attachments = await Promise.all(imgs.map((f, k) => new Promise<ChatAttachment>((res) => {
          const url = URL.createObjectURL(f)
          const im = new Image()
          im.onload = () => res({ kind: 'upload', id: `up${Date.now()}${k}`, label: f.name, image: { id: url, url, width: im.naturalWidth, height: im.naturalHeight } })
          im.onerror = () => res({ kind: 'upload', id: `up${Date.now()}${k}`, label: f.name, image: { id: url, url, width: 800, height: 1000 } })
          im.src = url
        })))
        const p = await ds.createProject({ name: t.name })
        sessionStorage.setItem(PENDING_KEY(p.id), JSON.stringify({ text: `/${t.name} `, mode: 'agent', attachments, toolId: t.id }))
        router.push(`/v2/canvas/${p.id}?view=split`)
      } finally { setBusy(null) }
    })
  }
  return { start, busy }
}

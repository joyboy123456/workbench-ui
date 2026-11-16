'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { GENERATION_KINDS } from '@/lib/v2/generation-history'
import type { AgentMode, CaseExample, ChatAttachment, Generation, ToolCatalogItem } from '@/lib/v2/types'
import { Composer, type ComposerSubmission } from './composer'
import { Icon } from './icons'
import { Shell } from './shell'
import { SlidingTabs, relTime } from './ui'
import { useV2Auth } from './auth'
import { useStartTool } from './tools-page'

export const PENDING_KEY = (projectId: string) => `v2:pending:${projectId}`

type Entry = 'chat' | 'canvas'
const ENTRY_TABS: { id: Entry; name: string }[] = [
  { id: 'chat', name: '对话生成' },
  { id: 'canvas', name: '自由画布' },
]

type GenTab = 'all' | 'model' | 'main' | 'detail' | 'fav'
const GEN_TABS: { id: GenTab; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'model', name: '模特图' },
  { id: 'main', name: '商品图' },
  { id: 'detail', name: '详情页' },
  { id: 'fav', name: '收藏' },
]
const STATUS_LABEL: Record<Generation['status'], string> = { done: '已完成', running: '生成中', failed: '失败' }

/** 首页场景卡：精选在前，再补齐可用工具，固定 8 张 */
const pickScenes = (all: ToolCatalogItem[]) => {
  const ready = all.filter((t) => t.status === 'ready')
  return [...ready.filter((t) => t.featured), ...ready.filter((t) => !t.featured)].slice(0, 8)
}

const stamp = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86400000)
  if (diff === 0) return `今天 ${hm}`
  if (diff === 1) return `昨天 ${hm}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日 ${hm}`
}

export function HomePage() {
  const ds = useV2()
  const router = useRouter()
  const { user, requireAuth } = useV2Auth()
  const [atts, setAtts] = useState<ChatAttachment[]>([])
  const [entry, setEntry] = useState<Entry>('chat')
  const [genTab, setGenTab] = useState<GenTab>('all')
  const { data: projects, loading: loadingProjects } = useLoad((d) => d.listProjects(), [user?.id], !!user)
  const { data: catalog, loading: loadingCatalog } = useLoad((d) => d.listToolCatalog())
  const { data: cases } = useLoad((d) => d.listCases())
  const { data: gens, loading: loadingGens } = useLoad(
    (d) => d.listGenerations({
      limit: 8,
      sort: 'newest',
      ...(genTab === 'fav' ? { favorite: true } : genTab === 'all' ? {} : { kind: genTab }),
    }),
    [user?.id, genTab],
    !!user,
  )
  const { start: startTool, busy: toolBusy } = useStartTool()

  const view = entry === 'canvas' ? 'split' : 'chat'
  const strip = (projects ?? []).filter((p) => p.cover).slice(0, 3)
  const scenes = useMemo(() => pickScenes(catalog ?? []), [catalog])
  const projectName = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  const startProject = async (text: string, mode: AgentMode, attachments = atts, submission?: ComposerSubmission) => {
    const productIds = attachments.filter((a) => a.kind === 'product').map((a) => a.id)
    const cleanTitle = text.replace(/^\/[^\s]+\s*/, '').trim().slice(0, 16) || text.trim().slice(0, 16) || undefined
    const p = await ds.createProject({ name: cleanTitle, productIds })
    sessionStorage.setItem(PENDING_KEY(p.id), JSON.stringify({ text, mode, attachments, submission }))
    router.push(`/v2/canvas/${p.id}?view=${view}`)
  }
  const start = (text: string, mode: AgentMode, attachments = atts, submission?: ComposerSubmission) =>
    requireAuth(() => startProject(text, mode, attachments, submission))
  const createEmpty = () => requireAuth(async () => {
    const p = await ds.createProject({})
    router.push(`/v2/canvas/${p.id}?view=${view}`)
  })
  const startCase = (c: CaseExample) =>
    start(c.prompt ?? `参考这个案例做同款：${c.title}`, 'agent', [{ kind: 'material', id: c.id, label: c.title, image: c.image }])

  return (
    <Shell>
      <section className="hm-hero">
        <h1>今天给哪件商品出图？</h1>
        <p className="hm-sub">从一件商品开始，完成整套电商视觉</p>
        <SlidingTabs tabs={ENTRY_TABS} active={entry} onChange={setEntry} style={{ margin: '0 auto' }} />
      </section>

      <div className="hm-strip">
        <button type="button" className="hm-new" onClick={createEmpty}>
          <span className="hm-new-ic"><Icon name="plus" size={18} /></span>
          <span>{entry === 'canvas' ? '新建空白画布' : '新建项目'}</span>
        </button>
        {loadingProjects && !projects
          ? [0, 1, 2].map((i) => <div key={i} className="hm-strip-cell skel" />)
          : [0, 1, 2].map((i) => {
              const p = strip[i]
              if (!p) return <div key={i} className="hm-strip-cell empty" aria-hidden />
              return (
                <Link key={p.id} href={`/v2/canvas/${p.id}?view=split`} className="hm-strip-cell" title={p.name}>
                  <img src={p.cover!.thumbUrl ?? p.cover!.url} alt="" />
                  <span className="hm-strip-cap">{p.name}</span>
                </Link>
              )
            })}
      </div>

      <div className="hm-composer">
        <Composer
          attachments={atts}
          onAttachmentsChange={setAtts}
          onSend={(t, m, submission) => start(t, m, atts, submission)}
          placeholder="描述你想要的画面，或选择下方场景开始"
          autoFocus
        />
      </div>

      <div className="hm-scenes">
        <CaseBanner cases={cases ?? []} onPick={startCase} />
        <div className="hm-scene-grid">
          {loadingCatalog && !catalog
            ? Array.from({ length: 8 }, (_, i) => <div key={i} className="hm-scene skel" />)
            : Array.from({ length: 8 }, (_, i) => {
                const t = scenes[i]
                if (!t) return <div key={i} className="hm-scene empty" aria-hidden />
                return (
                  <button
                    type="button"
                    key={t.id}
                    className="hm-scene"
                    style={{ '--i': i } as CSSProperties}
                    disabled={!!toolBusy}
                    onClick={() => startTool(t)}
                  >
                    <span className="hm-scene-th"><img src={t.cover.after} alt="" /></span>
                    <span className="hm-scene-tx">
                      <b>{t.name}</b>
                      <small>{t.desc}</small>
                    </span>
                    <Icon name="right" size={12} />
                  </button>
                )
              })}
        </div>
      </div>

      <div className="hm-sec">
        <h2>最近生成</h2>
        <SlidingTabs tabs={GEN_TABS} active={genTab} onChange={setGenTab} small />
        <Link className="hm-more" href="/v2/assets?tab=history" onClick={(e) => { if (!user) { e.preventDefault(); void requireAuth(() => router.push('/v2/assets?tab=history')) } }}>
          查看全部 <Icon name="right" size={11} />
        </Link>
      </div>
      <div className="hm-gens">
        {!user ? (
          Array.from({ length: 4 }, (_, i) => <div key={i} className="hm-gen empty"><div className="hm-gen-ph" /></div>)
        ) : loadingGens && !gens ? (
          Array.from({ length: 4 }, (_, i) => <div key={i} className="hm-gen"><div className="hm-gen-ph skel" /></div>)
        ) : (gens ?? []).length === 0 ? (
          <div className="hm-gens-empty">{genTab === 'fav' ? '还没有收藏的图' : '这一类还没有生成记录'}</div>
        ) : (
          (gens ?? []).map((g, i) => (
            <Link key={g.id} href={`/v2/canvas/${g.projectId}?view=split`} className="hm-gen" style={{ '--i': i } as CSSProperties}>
              <div className="hm-gen-ph"><img src={g.image.thumbUrl ?? g.image.url} alt="" /></div>
              <div className="hm-gen-t">{projectName.get(g.projectId) ?? '未命名项目'} · {GENERATION_KINDS[g.kind]}</div>
              <div className="hm-gen-m" title={relTime(g.createdAt)}>
                <Icon name="hist" size={11} />{stamp(g.createdAt)} · <span className={'st-' + g.status}>{STATUS_LABEL[g.status]}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </Shell>
  )
}

/** 左侧大图：轮播做同款案例，点击即做同款 */
function CaseBanner({ cases, onPick }: { cases: CaseExample[]; onPick: (c: CaseExample) => void }) {
  const list = cases.slice(0, 4)
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (list.length < 2) return
    const t = window.setInterval(() => setIdx((i) => (i + 1) % list.length), 5000)
    return () => window.clearInterval(t)
  }, [list.length])
  const c = list[idx % Math.max(list.length, 1)]
  if (!c) return <div className="hm-banner empty"><span>做同款案例加载中</span></div>
  return (
    <div className="hm-banner">
      <button type="button" className="hm-banner-hit" onClick={() => onPick(c)} aria-label={`做同款：${c.title}`}>
        <img key={c.id} src={c.image.url} alt="" />
        <span className="hm-banner-tx">
          <b>{c.title}</b>
          <small>一键做同款，换成你的商品</small>
        </span>
      </button>
      {list.length > 1 && (
        <div className="hm-dots" role="tablist" aria-label="切换案例">
          {list.map((x, i) => (
            <button key={x.id} type="button" role="tab" aria-selected={i === idx} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} aria-label={x.title} />
          ))}
        </div>
      )}
    </div>
  )
}

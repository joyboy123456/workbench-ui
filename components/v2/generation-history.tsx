'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { Generation } from '@/lib/v2/types'
import { GENERATION_KINDS, groupGenerationDays } from '@/lib/v2/generation-history'
import { Icon } from './icons'
import { CardSkeleton, EmptyState, useToast } from './ui'

const PAGE_SIZE = 36

export function HistoryTab({ search, onClearSearch }: { search: string; onClearSearch: () => void }) {
  const ds = useV2()
  const toast = useToast()
  const [toolId, setToolId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const projects = useLoad(d => d.listProjects())
  const tools = useLoad(d => d.listTools())
  const history = useLoad(d => d.listGenerationPage({ toolId: toolId || undefined, projectId: projectId || undefined, favorite, sort, search, offset, limit: PAGE_SIZE }), [toolId, projectId, favorite, sort, search, offset])
  const records = history.data?.generations ?? []
  const total = history.data?.total ?? 0
  const groups = groupGenerationDays(records)
  useEffect(() => { setOffset(0); setSelected([]) }, [toolId, projectId, favorite, sort, search])
  useEffect(() => {
    if (history.loading || !history.data) return
    const visible = new Set(history.data.generations.map(g => g.id))
    setSelected(ids => ids.every(id => visible.has(id)) ? ids : ids.filter(id => visible.has(id)))
    if (offset >= history.data.total && offset > 0) setOffset(Math.max(0, Math.ceil(history.data.total / PAGE_SIZE) - 1) * PAGE_SIZE)
  }, [history.data, history.loading, offset])
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id])
  const act = async (fn: () => Promise<void>, success: string) => {
    if (busy) return
    setBusy(true)
    try { await fn(); toast(success); history.reload() }
    catch (error) { toast(error instanceof Error ? error.message : '操作未完成，请重试') }
    finally { setBusy(false) }
  }
  const download = (ids: string[]) => act(async () => {
    const url = URL.createObjectURL(await ds.downloadGenerations(ids))
    const a = document.createElement('a'); a.href = url; a.download = `生成记录-${new Date().toISOString().slice(0, 10)}.zip`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, '下载文件已准备好')
  const save = () => act(async () => {
    const results = await Promise.allSettled(selected.map(id => ds.saveAsMaterial(id)))
    const failed = selected.filter((_, i) => results[i].status === 'rejected')
    setSelected(failed)
    if (failed.length) throw new Error(`已保存 ${results.length - failed.length} 张，${failed.length} 张失败，可重试剩余选择`)
  }, '已存入素材库')
  const name = (g: Generation) => projects.data?.find(p => p.id === g.projectId)?.name ?? '来源项目'
  const toolName = (g: Generation) => tools.data?.find(t => t.id === g.toolId?.split(':')[0])?.name ?? GENERATION_KINDS[g.kind]
  const filtered = Boolean(toolId || projectId || favorite || search)

  return <section className="history" aria-label="生成记录">
    <div className="history-heading"><div><h2>每一次创作，都在这里</h2><p>跨项目找回作品，收藏灵感，接着创作。</p></div><Link className="btn pri" href="/v2"><Icon name="plus" size={15} />开始创作</Link></div>
    <div className="history-filters">
      <label>工具<select value={toolId} onChange={e => setToolId(e.target.value)}><option value="">全部工具</option>{(tools.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>项目<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">全部项目</option>{(projects.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button className={'btn' + (favorite ? ' active' : '')} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}><Icon name="star" size={15} />只看收藏</button>
      <span className="sp" />
      <label>排序<select value={sort} onChange={e => setSort(e.target.value === 'oldest' ? 'oldest' : 'newest')}><option value="newest">最新优先</option><option value="oldest">最早优先</option></select></label>
    </div>
    {(projects.error || tools.error) && <div className="history-error" role="alert"><p>部分筛选选项读取失败，仍可浏览生成记录。</p><button className="btn" onClick={() => { projects.reload(); tools.reload() }}>重新读取筛选</button></div>}
    <div className="history-batch" aria-label="批量操作">
      <label><input type="checkbox" aria-label="选择本页全部" checked={records.length > 0 && records.every(g => selected.includes(g.id))} disabled={history.loading || !records.length || busy} onChange={e => setSelected(e.target.checked ? records.map(g => g.id) : [])} />{selected.length ? `已选择 ${selected.length} 张` : `共 ${total} 张作品`}</label>
      <span className="sp" />
      <button className="btn" disabled={!selected.length || busy || history.loading} onClick={() => void download(selected)}><Icon name="dl" size={15} />批量下载</button>
      <button className="btn" disabled={!selected.length || busy || history.loading} onClick={() => void save()}><Icon name="asset" size={15} />存为素材</button>
      <button className="btn" disabled={!selected.length || busy || history.loading} onClick={() => setDeleting(true)}><Icon name="trash" size={15} />删除</button>
      {selected.length > 0 && <button className="btn" disabled={busy} onClick={() => setSelected([])}>取消选择</button>}
    </div>
    <div aria-live="polite" className="history-status">{busy ? '正在处理，请稍候…' : history.loading ? '正在读取生成记录…' : ''}</div>
    {history.error ? <div className="history-error" role="alert"><p>{history.error}</p><button className="btn" onClick={history.reload}>重新加载</button></div> : history.loading ? <div className="history-grid"><CardSkeleton count={6} ratio34 /></div> : groups.map(group => <section key={group.date} className="history-day" aria-label={group.label}>
      <div className="dg"><h3>{group.label}</h3><small>{group.records.length} 张 · {new Set(group.records.map(g => g.projectId)).size} 个项目</small></div>
      <div className="history-grid">{group.records.map(g => <article key={g.id} className={'history-card' + (selected.includes(g.id) ? ' selected' : '')}>
        <button className="history-image" aria-label={`查看${toolName(g)}：${name(g)}`} onClick={() => setPreview(g.id)}><img src={g.image.thumbUrl ?? g.image.url} alt={`${toolName(g)}作品`} loading="lazy" /><span className="history-kind">{toolName(g)}</span></button>
        <div className="history-card-actions">
          <button title={selected.includes(g.id) ? '取消选择' : '选择'} aria-label={selected.includes(g.id) ? '取消选择作品' : '选择作品'} aria-pressed={selected.includes(g.id)} className={selected.includes(g.id) ? 'active' : ''} disabled={busy} onClick={() => toggle(g.id)}><Icon name="check" size={16} /></button>
          <span className="sp" />
          <button title={g.favorite ? '取消收藏' : '收藏'} aria-label={g.favorite ? '取消收藏作品' : '收藏作品'} aria-pressed={Boolean(g.favorite)} className={g.favorite ? 'active' : ''} disabled={busy} onClick={() => void act(() => ds.setGenerationFavorite([g.id], !g.favorite), g.favorite ? '已取消收藏' : '已收藏')}><Icon name="star" size={16} /></button>
          <button title="下载" aria-label="下载作品" disabled={busy} onClick={() => void download([g.id])}><Icon name="dl" size={16} /></button>
        </div>
        <div className="history-card-caption"><span title={name(g)}>{name(g)}</span><small>{new Date(g.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></div>
      </article>)}</div>
    </section>)}
    {!history.loading && !history.error && !records.length && <>
      <EmptyState icon="hist" title={filtered ? '没有符合条件的作品' : '还没有生成记录'} subtitle={filtered ? '换一个工具、项目或关键词，继续寻找。' : '在画布里完成一次创作，作品会按日期保存在这里。'} />
      <div className="history-empty-action">{filtered ? <button className="btn" onClick={() => { setToolId(''); setProjectId(''); setFavorite(false); setOffset(0); onClearSearch() }}>清除筛选</button> : <Link className="btn pri" href="/v2">去创作第一张图<Icon name="right" size={15} /></Link>}</div>
    </>}
    <nav className="history-pagination" aria-label="生成记录分页"><span>{total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} / ${total}` : '0 张作品'}</span><button className="btn" disabled={offset === 0 || history.loading || busy} onClick={() => { setOffset(Math.max(0, offset - PAGE_SIZE)); setSelected([]) }}>上一页</button><button className="btn" disabled={offset + PAGE_SIZE >= total || history.loading || busy} onClick={() => { setOffset(offset + PAGE_SIZE); setSelected([]) }}>下一页</button></nav>
    {preview && <GenerationPreview id={preview} navigation={records} onNavigate={setPreview} projectName={name} toolName={toolName} onClose={() => setPreview(null)} onFavorite={() => history.reload()} />}
    {deleting && <HistoryDialog label="删除生成记录" onClose={() => setDeleting(false)} className="history-confirm"><h2>删除 {selected.length} 条记录？</h2><p>记录将从生成历史中移除。画布中的图片和已保存的素材仍然保留。</p><div className="history-confirm-actions"><button className="btn" disabled={busy} onClick={() => setDeleting(false)}>取消</button><button className="btn pri" disabled={busy} onClick={() => void act(async () => { await ds.deleteGenerations(selected); setSelected([]); setDeleting(false); if (selected.length === records.length && offset) setOffset(Math.max(0, offset - PAGE_SIZE)) }, '已移出生成记录')}>确认删除</button></div></HistoryDialog>}
  </section>
}

function HistoryDialog({ label, onClose, className, children }: { label: string; onClose: () => void; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} className={className} aria-label={label} onCancel={onClose}>{children}</dialog>
}

function GenerationPreview({ id, navigation, onNavigate, projectName, toolName, onClose, onFavorite }: { id: string; navigation: Generation[]; onNavigate: (id: string) => void; projectName: (g: Generation) => string; toolName: (g: Generation) => string; onClose: () => void; onFavorite: () => void }) {
  const ds = useV2()
  const detail = useLoad(d => d.getGeneration(id), [id])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const g = detail.data?.generation
  const loading = detail.loading || (!detail.error && Boolean(g && g.id !== id))
  const siblings = detail.data?.siblings ?? []
  const sequence = siblings.length > 1 ? siblings : navigation
  const index = sequence.findIndex(g => g.id === id)
  const move = useCallback((delta: number) => {
    const next = sequence[index + delta]
    if (!busy && !loading && next) { setMessage(''); onNavigate(next.id) }
  }, [sequence, index, busy, loading, onNavigate])
  useEffect(() => {
    // A navigation button can unmount while the next image loads. Keep arrows working during the dialog's lifetime.
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]')) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        move(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])
  const operation = async (fn: () => Promise<void>, success: string) => {
    setBusy(true)
    try { await fn(); setMessage(success) } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败，请重试') } finally { setBusy(false) }
  }
  return <HistoryDialog label="生成详情" onClose={onClose} className="history-preview">
    <div className="history-preview-inner">
      <div className="history-preview-top"><span>生成详情</span><span className="sp" /><small>← / → 切换 · Esc 关闭</small><button className="btn" aria-label="关闭生成详情" onClick={onClose}><Icon name="x" size={18} /></button></div>
      {loading ? <div className="history-preview-loading" role="status">正在读取作品详情…</div> : detail.error || !g ? <div className="history-preview-loading" role="alert">{detail.error ?? '记录已不可用'}<button className="btn" onClick={detail.reload}>重试</button></div> : <>
        <div className="history-stage"><div className="history-main-image"><button className="history-prev" aria-label="上一张" disabled={index <= 0 || busy} onClick={() => move(-1)}><Icon name="left" size={22} /></button><img src={g.image.url} alt={g.prompt || `${toolName(g)}生成作品`} /><button className="history-next" aria-label="下一张" disabled={index < 0 || index === sequence.length - 1 || busy} onClick={() => move(1)}><Icon name="right" size={22} /></button></div>
          <div className="history-filmstrip" aria-label="同组作品">{siblings.map((sibling, position) => <button key={sibling.id} aria-label={`查看同组作品 ${position + 1}`} aria-pressed={sibling.id === id} disabled={busy} onClick={() => { setMessage(''); onNavigate(sibling.id) }}><img src={sibling.image.thumbUrl ?? sibling.image.url} alt="" /></button>)}</div>
        </div>
        <aside className="history-inspector"><div className="history-detail-heading"><h2>{toolName(g)}</h2><button className={'btn' + (g.favorite ? ' active' : '')} aria-label={g.favorite ? '取消收藏此作品' : '收藏此作品'} aria-pressed={Boolean(g.favorite)} disabled={busy} onClick={() => void operation(async () => { await ds.setGenerationFavorite([g.id], !g.favorite); detail.reload(); onFavorite() }, g.favorite ? '已取消收藏' : '已收藏')}><Icon name="star" size={16} /></button></div><p className="muted">{new Date(g.createdAt).toLocaleString('zh-CN')}</p>
          <div className="history-prompt-heading"><h3>提示词</h3><button className="btn" disabled={!g.prompt || busy} onClick={() => void operation(() => navigator.clipboard.writeText(g.prompt ?? ''), '提示词已复制')}><Icon name="copy" size={14} />复制</button></div><p className="history-prompt">{g.prompt || '这条历史没有记录提示词'}</p>
          <dl className="history-params"><div><dt>模型</dt><dd>{g.modelName || '未记录'}</dd></div><div><dt>比例</dt><dd>{g.ratio || `${g.image.width}:${g.image.height}（原图）`}</dd></div><div><dt>分辨率</dt><dd>{g.resolution || '未记录'}<small>{g.image.width} × {g.image.height} px</small></dd></div><div><dt>生成张数</dt><dd>{g.outputCount ? `${g.outputCount} 张` : '未记录'}</dd></div></dl>
          <h3>来源项目</h3><Link className="history-source" href={`/v2/canvas/${encodeURIComponent(g.projectId)}?view=split&generation=${encodeURIComponent(g.id)}`}><Icon name="canvas" size={17} /><span>{projectName(g)}</span><Icon name="right" size={15} /></Link>
          <p className="history-feedback" role="status">{message}</p>
          <Link className="btn pri history-reuse" href={`/v2/canvas/${encodeURIComponent(g.projectId)}?view=split&reuse=${encodeURIComponent(g.id)}`}><Icon name="wand" size={16} />做同款</Link><small className="muted">带回已记录参数，确认后再生成</small>
        </aside>
      </>}
    </div>
  </HistoryDialog>
}

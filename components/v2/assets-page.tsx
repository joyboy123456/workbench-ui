'use client'
import { useV2Auth } from './auth'
import { AccountMenu } from './account-menu'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { GenerationKind } from '@/lib/v2/types'
import { Icon } from './icons'
import { HistoryTab } from './generation-history'
import { Shell } from './shell'
import { CardSkeleton, EmptyState, Modal, SlidingTabs, Thumb, pickFiles, relTime, useToast } from './ui'

export const ASSET_TABS = [
  { id: 'materials', name: '素材' },
  { id: 'products', name: '商品' },
  { id: 'models', name: '模特' },
  { id: 'brand', name: '品牌' },
  { id: 'history', name: '生成记录' },
] as const
type Tab = (typeof ASSET_TABS)[number]['id']

export const KIND_LABEL: Record<GenerationKind, string> = { main: '主图', detail: '详情页', model: '模特图', banner: 'Banner', video: '视频', edit: '编辑' }

export function AssetsPage() {
  const { user, loading } = useV2Auth()
  if (loading) return <Shell><p role="status">正在恢复账号…</p></Shell>
  if (!user) return <Shell><p>登录后查看你的资产和生成记录。</p><AccountMenu /></Shell>
  return <AssetsContent key={user.id} />
}

function AssetsContent() {
  const sp = useSearchParams()
  const router = useRouter()
  const tab = (ASSET_TABS.find((t) => t.id === sp?.get('tab'))?.id ?? 'materials') as Tab
  const [q, setQ] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [productsVersion, setProductsVersion] = useState(0)
  return (
    <Shell>
      <div className="mh">
        <h1>素材库</h1><span className="sp" />
        <label className="search"><Icon name="search" size={14} /><input aria-label="搜索资产" maxLength={tab === 'history' ? 120 : undefined} placeholder={tab === 'history' ? '搜索提示词、作品类型' : '搜索商品、模特、素材'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {tab === 'products' && <button className="btn pri" onClick={() => setUploadOpen(true)}><Icon name="plus" size={15} />上传商品</button>}
      </div>
      <SlidingTabs
        tabs={ASSET_TABS}
        active={tab}
        style={{ marginTop: 18 }}
        onChange={(id) => router.replace(`/v2/assets?tab=${id}`)}
      />
      {tab === 'products' && <ProductsTab version={productsVersion} q={q} onUpload={() => setUploadOpen(true)} />}
      {tab === 'models' && <ModelsTab q={q} />}
      {tab === 'brand' && <BrandTab />}
      {tab === 'materials' && <MaterialsTab q={q} />}
      {tab === 'history' && <HistoryTab search={q} onClearSearch={() => setQ('')} />}
      {uploadOpen && <UploadProductModal onClose={() => setUploadOpen(false)} onDone={() => { setProductsVersion(value => value + 1) }} />}
    </Shell>
  )
}

function ProductsTab({ q, onUpload, version }: { q: string; onUpload: () => void; version: number }) {
  const ds = useV2()
  const [cat, setCat] = useState<string | undefined>()
  const cats = useLoad((d) => d.listCategories(), [version])
  const { data: products, loading } = useLoad((d) => d.listProducts({ categoryId: cat, search: q || undefined }), [cat, q, version])
  const total = (cats.data ?? []).reduce((s, c) => s + c.count, 0)
  const addCat = async () => { const name = window.prompt('新类目名称'); if (name?.trim()) { await ds.createCategory(name.trim()); cats.reload() } }
  return (
    <>
      <div className="chips" style={{ padding: '14px 0 4px' }}>
        <button className={'chip' + (!cat ? ' on' : '')} onClick={() => setCat(undefined)}>全部 {total}</button>
        {(cats.data ?? []).map((c) => <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name} {c.count}</button>)}
        <button className="chip" onClick={addCat}>＋ 新类目</button>
      </div>
      <div className="pgd">
        <button className="pc add" style={{ '--i': 0 } as CSSProperties} onClick={onUpload}><div className="ph2"><Icon name="plus" size={22} />上传商品<small>拖入或粘贴，多角度一起传</small></div></button>
        {loading && !products ? (
          <CardSkeleton count={6} />
        ) : (
          (products ?? []).map((p, idx) => (
            <Link key={p.id} href={`/v2/assets/products/${p.id}`} className="pc" style={{ '--i': idx + 1 } as CSSProperties}>
              <div style={{ position: 'relative' }}>
                <Thumb
                  image={p.images[0]}
                  label={`${cats.data?.find((c) => c.id === p.categoryId)?.name ?? ''} · 占位`}
                  overlay={
                    <div className="pc-ov">
                      <span className="pc-ov-pill">查看商品 <Icon name="right" size={11} /></span>
                    </div>
                  }
                />
                <span className="tag">{cats.data?.find((c) => c.id === p.categoryId)?.name}</span>
              </div>
              <div className="t">{p.name}</div>
              <div className="m">{p.generatedCount ? `${p.generatedCount} 张` + (p.projectIds.length ? ` · ${p.projectIds.length} 个项目` : '') : '未使用'}</div>
            </Link>
          ))
        )}
      </div>
      {!loading && products && products.length === 0 && (
        <EmptyState icon="asset" title="没有找到匹配的商品" subtitle="试试换个关键词或切换其他类目" />
      )}
    </>
  )
}

function ModelsTab({ q }: { q: string }) {
  const ds = useV2()
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  const [src, setSrc] = useState<'all' | 'custom' | 'preset'>('all')
  const { data, loading, reload } = useLoad((d) => d.listModels())
  const create = async () => {
    if (uploading) return
    const [file] = await pickFiles('image/*', false)
    if (!file) return
    setUploading(true)
    try { await ds.uploadModel(file); setSrc('custom'); reload(); toast('已添加店铺模特') }
    catch (error) { toast(error instanceof Error ? error.message : '添加失败，请重试') }
    finally { setUploading(false) }
  }
  const list = (data ?? []).filter((m) => (src === 'all' || m.source === src) && (!q || m.name.includes(q)))
  return (
    <>
      <div className="chips" style={{ padding: '14px 0 4px' }}>
        {([['all', '全部'], ['custom', '店铺模特'], ['preset', '平台模特']] as const).map(([k, n]) => <button key={k} className={'chip' + (src === k ? ' on' : '')} onClick={() => setSrc(k)}>{n}</button>)}
      </div>
      <div className="pgd">
        <button type="button" className="pc add" disabled={uploading} onClick={() => void create()} style={{ '--i': 0 } as CSSProperties}><div className="ph2 r34"><Icon name="plus" size={22} />{uploading ? '上传中…' : '新建模特'}<small>上传模特正脸或全身照</small></div></button>
        {loading && !data ? (
          <CardSkeleton count={6} ratio34 />
        ) : (
          list.map((m, idx) => (
            <div key={m.id} className="pc" style={{ '--i': idx + 1 } as CSSProperties}>
              <div style={{ position: 'relative' }}><div className="ph2 r34 cov"><img src={m.cover.url} alt="" /></div><span className="tag">{m.source === 'custom' ? '店铺' : '平台'}</span></div>
              <div className="t">{m.name}</div>
              <div className="m">{m.tags.join(' · ')}</div>
            </div>
          ))
        )}
      </div>
      {!loading && data && list.length === 0 && (
        <EmptyState icon="model" title="没有找到匹配的模特" subtitle="可以新建店铺专属模特或清除筛选条件" />
      )}
    </>
  )
}

function BrandTab() {
  const { data } = useLoad((d) => d.listBrandKits())
  return (
    <>
      {(data ?? []).map((b) => (
        <div key={b.id} className="brand-card">
          <div>
            <h3>名称</h3><div style={{ fontSize: 15, marginBottom: 18 }}>{b.name}</div>
            <h3>品牌色</h3><div className="sw">{b.colors.map((c) => <i key={c} style={{ background: c }} title={c} />)}</div>
            <h3 style={{ marginTop: 18 }}>字体</h3><div>{b.fonts.join('、')}</div>
            <h3 style={{ marginTop: 18 }}>设计规范</h3><div className="muted" style={{ fontSize: 13 }}>{b.guidance}</div>
          </div>
          <div>
            <h3>Logo</h3><div className="ph0" style={{ height: 80, borderRadius: 10 }}>上传 Logo</div>
            <h3 style={{ marginTop: 18 }}>参考图</h3>
            <div className="hrow">{b.references.map((r) => <img key={r.id} src={r.url} alt="" style={{ height: 110 }} />)}</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>生成详情页、Banner 时自动套用这里的配色、字体和风格。</p>
          </div>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 16 }}><Icon name="plus" size={14} />新建品牌</button>
    </>
  )
}

function MaterialsTab({ q }: { q: string }) {
  const ds = useV2()
  const toast = useToast()
  const [scope, setScope] = useState<'all' | 'uncategorized' | 'trash' | string>('all')
  const [version, setVersion] = useState(0)
  const categories = useLoad(d => d.listMaterialCategories(), [version])
  const query = scope === 'trash' ? { trash: true, search: q || undefined }
    : scope === 'uncategorized' ? { uncategorized: true, search: q || undefined }
      : scope === 'all' ? { search: q || undefined } : { categoryId: scope, search: q || undefined }
  const { data, loading, reload } = useLoad(d => d.listMaterials(query), [scope, q, version])
  const refresh = () => { setVersion(value => value + 1); reload() }
  const upload = async () => {
    const files = await pickFiles()
    if (!files.length) return
    try {
      for (const file of files.slice(0, 8)) await ds.uploadMaterial(file, !['all', 'uncategorized', 'trash'].includes(scope) ? scope : undefined)
      refresh(); toast(`已上传 ${Math.min(files.length, 8)} 张素材`)
    } catch (error) { toast(error instanceof Error ? error.message : '上传失败') }
  }
  const addCategory = async () => {
    const name = window.prompt('新分类名称')?.trim()
    if (!name) return
    try { const category = await ds.createMaterialCategory(name); setScope(category.id); refresh(); toast('分类已创建') }
    catch (error) { toast(error instanceof Error ? error.message : '创建失败') }
  }
  const renameCategory = async (id: string, current: string) => {
    const name = window.prompt('重命名分类', current)?.trim()
    if (!name || name === current) return
    try { await ds.renameMaterialCategory(id, name); refresh(); toast('分类已重命名') }
    catch (error) { toast(error instanceof Error ? error.message : '重命名失败') }
  }
  const removeCategory = async (id: string) => {
    if (!window.confirm('删除分类？分类中的素材会移到“未分类”。')) return
    try { await ds.deleteMaterialCategory(id); if (scope === id) setScope('all'); refresh(); toast('分类已删除，素材已移到未分类') }
    catch (error) { toast(error instanceof Error ? error.message : '删除失败') }
  }
  const move = async (id: string, current?: string) => {
    const choices = ['未分类', ...(categories.data ?? []).map(category => category.name)]
    const answer = window.prompt(`移动到分类：\n${choices.join(' / ')}`, current ? categories.data?.find(category => category.id === current)?.name : '未分类')?.trim()
    if (answer === undefined) return
    const categoryId = answer === '' || answer === '未分类' ? undefined : categories.data?.find(category => category.name === answer)?.id
    if (answer && answer !== '未分类' && !categoryId) { toast('没有这个分类'); return }
    try { await ds.moveMaterial(id, categoryId); refresh(); toast('素材已移动') }
    catch (error) { toast(error instanceof Error ? error.message : '移动失败') }
  }
  const trash = async (id: string) => { try { await ds.deleteMaterial(id); refresh(); toast('已移入回收站') } catch (error) { toast(error instanceof Error ? error.message : '删除失败') } }
  const restore = async (id: string) => { try { await ds.restoreMaterial(id); refresh(); toast('素材已恢复') } catch (error) { toast(error instanceof Error ? error.message : '恢复失败') } }
  const destroy = async (id: string) => {
    if (!window.confirm('彻底删除后无法恢复，继续吗？')) return
    try { await ds.deleteMaterial(id, true); refresh(); toast('素材已彻底删除') } catch (error) { toast(error instanceof Error ? error.message : '删除失败') }
  }
  const label = { upload: '上传', saved: '来自生成', clip: '网页收藏' }
  return (
    <div className="v2-material-library">
      <aside className="v2-material-sidebar" aria-label="素材分类">
        <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}><Icon name="grid" size={15} />全部</button>
        <button type="button" className={scope === 'uncategorized' ? 'on' : ''} onClick={() => setScope('uncategorized')}><Icon name="asset" size={15} />未分类</button>
        <div className="v2-material-cat-title"><span>我的分类</span><button type="button" aria-label="新增素材分类" onClick={() => void addCategory()}><Icon name="plus" size={14} /></button></div>
        {(categories.data ?? []).map(category => <div className={'v2-material-cat' + (scope === category.id ? ' on' : '')} key={category.id}>
          <button type="button" className="v2-material-cat-main" onClick={() => setScope(category.id)}><Icon name="asset" size={15} /><span>{category.name}</span><small>{category.count}</small></button>
          <button type="button" aria-label={`重命名分类 ${category.name}`} onClick={() => void renameCategory(category.id, category.name)}><Icon name="type" size={13} /></button>
          <button type="button" aria-label={`删除分类 ${category.name}`} onClick={() => void removeCategory(category.id)}><Icon name="trash" size={13} /></button>
        </div>)}
        <button type="button" className={'v2-material-trash' + (scope === 'trash' ? ' on' : '')} onClick={() => setScope('trash')}><Icon name="trash" size={15} />回收站</button>
      </aside>
      <section className="v2-material-content">
        <div className="v2-material-toolbar">
          <b>{scope === 'all' ? '全部素材' : scope === 'uncategorized' ? '未分类' : scope === 'trash' ? '回收站' : categories.data?.find(category => category.id === scope)?.name ?? '素材'}</b>
          <span className="sp" />
          {scope !== 'trash' && <button type="button" className="btn pri" onClick={() => void upload()}><Icon name="upload" size={14} />上传素材</button>}
        </div>
        <div className="pgd lv-pgd v2-material-grid">
          {loading && !data ? <CardSkeleton count={6} ratio34 /> : (data ?? []).map((m, idx) => <article key={m.id} className="pc v2-material-card" style={{ '--i': idx } as CSSProperties}>
            <div className="ph2 r34 cov"><img src={m.image.thumbUrl ?? m.image.url} alt="" /><span className="tag">{label[m.origin]}</span>
              <div className="v2-material-actions">{scope === 'trash' ? <>
                <button type="button" onClick={() => void restore(m.id)}>恢复</button><button type="button" className="danger" onClick={() => void destroy(m.id)}>彻底删除</button>
              </> : <><button type="button" onClick={() => void move(m.id, m.categoryId)}>移动分类</button><button type="button" className="danger" onClick={() => void trash(m.id)}>删除</button></>}</div>
            </div>
            <div className="t">{m.name}</div><div className="m">{relTime(m.createdAt)}</div>
          </article>)}
        </div>
        {!loading && data && data.length === 0 && <EmptyState icon={scope === 'trash' ? 'trash' : 'img'} title={q ? '没有找到匹配的素材' : scope === 'trash' ? '回收站为空' : '这里还没有素材'} subtitle={q ? '试试其他名称' : scope === 'trash' ? '删除的素材会在这里保留' : '上传场景、道具或参考图开始整理'} />}
      </section>
    </div>
  )
}

export function UploadProductModal({ onClose, onDone }: { onClose: () => void; onDone?: (id: string) => void }) {
  const ds = useV2()
  const toast = useToast()
  const router = useRouter()
  const { data: cats } = useLoad((d) => d.listCategories())
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [cat, setCat] = useState('')
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!cat && cats?.[0]) setCat(cats[0].id)
  }, [cat, cats])
  const submit = async () => {
    if (submitting.current || !files.length || !cat) return
    submitting.current = true
    setBusy(true)
    try {
      const p = await ds.uploadProduct(files, { name, categoryId: cat })
      onDone?.(p.id)
      onClose()
      toast('商品已上传')
      if (!onDone) router.push(`/v2/assets/products/${p.id}`)
    } catch (error) {
      toast(error instanceof Error ? error.message : '商品上传失败，请重试')
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <Modal title="上传商品" onClose={() => { if (!submitting.current) onClose() }} footer={<><button className="btn" disabled={busy} onClick={onClose}>取消</button><button className="btn pri" disabled={busy || !files.length || !cat} onClick={submit}>{busy ? '上传中…' : '完成'}</button></>}>
      <div className="drop" onClick={async () => setFiles(await pickFiles())} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles(Array.from(e.dataTransfer.files)) }}>
        <Icon name="upload" size={22} />{files.length ? `已选 ${files.length} 张` : '点击或拖入商品图'}<small className="muted">正面、背面、细节多角度一起传，出图更准</small>
      </div>
      <label className="field">商品名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="不填则用文件名" /></label>
      <div className="field">类目</div>
      <div className="chips" style={{ marginTop: 6 }}>
        {(cats ?? []).map((c) => <button key={c.id} className={'chip sm' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
      </div>
      {cats && cats.length === 0 && <small className="muted">请先关闭窗口，在商品页新建一个类目。</small>}
    </Modal>
  )
}

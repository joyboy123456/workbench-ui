'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { GenerationKind } from '@/lib/v2/types'
import { Icon } from './icons'
import { HistoryTab } from './generation-history'
import { Shell } from './shell'
import { CardSkeleton, EmptyState, Modal, SlidingTabs, Thumb, pickFiles, relTime, useToast } from './ui'

export const ASSET_TABS = [
  { id: 'products', name: '商品' },
  { id: 'models', name: '模特' },
  { id: 'brand', name: '品牌' },
  { id: 'materials', name: '素材' },
  { id: 'history', name: '生成记录' },
] as const
type Tab = (typeof ASSET_TABS)[number]['id']

export const KIND_LABEL: Record<GenerationKind, string> = { main: '主图', detail: '详情页', model: '模特图', banner: 'Banner', video: '视频', edit: '编辑' }

export function AssetsPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const tab = (ASSET_TABS.find((t) => t.id === sp?.get('tab'))?.id ?? 'products') as Tab
  const [q, setQ] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  return (
    <Shell>
      <div className="mh">
        <h1>资产</h1><span className="sp" />
        <label className="search"><Icon name="search" size={14} /><input aria-label="搜索资产" maxLength={tab === 'history' ? 120 : undefined} placeholder={tab === 'history' ? '搜索提示词、作品类型' : '搜索商品、模特、素材'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {tab === 'products' && <button className="btn pri" onClick={() => setUploadOpen(true)}><Icon name="plus" size={15} />上传商品</button>}
      </div>
      <SlidingTabs
        tabs={ASSET_TABS}
        active={tab}
        style={{ marginTop: 18 }}
        onChange={(id) => router.replace(`/v2/assets?tab=${id}`)}
      />
      {tab === 'products' && <ProductsTab q={q} onUpload={() => setUploadOpen(true)} />}
      {tab === 'models' && <ModelsTab q={q} />}
      {tab === 'brand' && <BrandTab />}
      {tab === 'materials' && <MaterialsTab q={q} />}
      {tab === 'history' && <HistoryTab search={q} onClearSearch={() => setQ('')} />}
      {uploadOpen && <UploadProductModal onClose={() => setUploadOpen(false)} />}
    </Shell>
  )
}

function ProductsTab({ q, onUpload }: { q: string; onUpload: () => void }) {
  const ds = useV2()
  const [cat, setCat] = useState<string | undefined>()
  const cats = useLoad((d) => d.listCategories())
  const { data: products, loading } = useLoad((d) => d.listProducts({ categoryId: cat, search: q || undefined }), [cat, q])
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
  const [src, setSrc] = useState<'all' | 'custom' | 'preset'>('all')
  const { data, loading } = useLoad((d) => d.listModels())
  const list = (data ?? []).filter((m) => (src === 'all' || m.source === src) && (!q || m.name.includes(q)))
  return (
    <>
      <div className="chips" style={{ padding: '14px 0 4px' }}>
        {([['all', '全部'], ['custom', '店铺模特'], ['preset', '平台模特']] as const).map(([k, n]) => <button key={k} className={'chip' + (src === k ? ' on' : '')} onClick={() => setSrc(k)}>{n}</button>)}
      </div>
      <div className="pgd">
        <button className="pc add" style={{ '--i': 0 } as CSSProperties}><div className="ph2 r34"><Icon name="plus" size={22} />新建模特<small>上传 3–5 张正脸和全身照</small></div></button>
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
  const { data, loading, reload } = useLoad((d) => d.listMaterials())
  const list = (data ?? []).filter((m) => !q || m.name.includes(q))
  const upload = async () => { for (const f of await pickFiles()) await ds.uploadMaterial(f); reload(); toast('已上传到素材') }
  const label = { upload: '上传', saved: '来自生成', clip: '网页收藏' }
  return (
    <>
      <div className="pgd">
        <button className="pc add" style={{ '--i': 0 } as CSSProperties} onClick={upload}><div className="ph2 r34"><Icon name="upload" size={22} />上传素材<small>场景、道具、参考图</small></div></button>
        {loading && !data ? (
          <CardSkeleton count={4} ratio34 />
        ) : (
          list.map((m, idx) => (
            <div key={m.id} className="pc" style={{ '--i': idx + 1 } as CSSProperties}>
              <div style={{ position: 'relative' }}><div className="ph2 r34 cov"><img src={m.image.url} alt="" /></div><span className="tag">{label[m.origin]}</span></div>
              <div className="t">{m.name}</div><div className="m">{relTime(m.createdAt)}</div>
            </div>
          ))
        )}
      </div>
      {!loading && data && list.length === 0 && (
        <EmptyState icon="img" title="没有找到匹配的素材" subtitle="支持上传场景、道具或从画布将好图存为素材" />
      )}
    </>
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
  useEffect(() => {
    if (!cat && cats?.[0]) setCat(cats[0].id)
  }, [cat, cats])
  const submit = async () => {
    const p = await ds.uploadProduct(files, { name, categoryId: cat })
    toast('商品已上传'); onClose()
    if (onDone) onDone(p.id); else router.push(`/v2/assets/products/${p.id}`)
  }
  return (
    <Modal title="上传商品" onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn pri" disabled={!files.length || !cat} onClick={submit}>完成</button></>}>
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

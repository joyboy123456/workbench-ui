'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { ChatAttachment, ImageRef } from '@/lib/v2/types'
import { UploadProductModal } from '../assets-page'
import { Icon } from '../icons'
import { EmptyState, SlidingTabs, pickFiles, useToast } from '../ui'

type Tab = 'products' | 'models' | 'brand' | 'materials' | 'project'
const TABS: { id: Tab; name: string }[] = [
  { id: 'products', name: '商品' }, { id: 'models', name: '模特' }, { id: 'brand', name: '品牌' }, { id: 'materials', name: '素材' }, { id: 'project', name: '本项目' },
]

interface Tile { key: string; label: string; image?: ImageRef; att?: ChatAttachment; cover?: boolean }

export interface AssetDrawerProps {
  projectId: string
  closing?: boolean
  onClose: () => void
  onAddToChat: (atts: ChatAttachment[]) => void
  onPlace: (atts: ChatAttachment[]) => void
}

/** 画布里的资产抽屉：拖到画布 / 加到对话 */
export function AssetDrawer({ projectId, closing, onClose, onAddToChat, onPlace }: AssetDrawerProps) {
  const ds = useV2()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('products')
  const [cat, setCat] = useState<string | undefined>()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Record<string, ChatAttachment>>({})
  const [uploadOpen, setUploadOpen] = useState(false)

  const cats = useLoad((d) => d.listCategories())
  const data = useLoad(async (d) => {
    if (tab === 'products') return (await d.listProducts({ categoryId: cat, search: q || undefined })).map<Tile>((p) => ({ key: p.id, label: p.name, image: p.images[0], att: p.images[0] && { kind: 'product', id: p.id, label: p.name, image: p.images[0] } }))
    if (tab === 'models') return (await d.listModels()).map<Tile>((m) => ({ key: m.id, label: m.name, image: m.cover, cover: true, att: { kind: 'model', id: m.id, label: m.name, image: m.cover } }))
    if (tab === 'brand') return (await d.listBrandKits()).flatMap<Tile>((b) => b.references.map((r) => ({ key: b.id + r.id, label: b.name, image: r, cover: true, att: { kind: 'material', id: b.id + r.id, label: b.name, image: r } })))
    if (tab === 'materials') return (await d.listMaterials()).map<Tile>((m) => ({ key: m.id, label: m.name, image: m.image, cover: true, att: { kind: 'material', id: m.id, label: m.name, image: m.image } }))
    return (await d.listGenerations({ projectId })).map<Tile>((g) => ({ key: g.id, label: '生成', image: g.image, cover: true, att: { kind: 'material', id: g.id, label: '生成', image: g.image } }))
  }, [tab, cat, q, projectId])

  const tiles = useMemo(() => (data.data ?? []).filter((t) => !q || t.label.includes(q)), [data.data, q])
  const pickedList = Object.values(picked)
  const toggle = (t: Tile) => t.att && setPicked((p) => { const n = { ...p }; if (n[t.key]) delete n[t.key]; else n[t.key] = t.att!; return n })

  const upload = async () => {
    if (tab === 'products') { setUploadOpen(true); return }
    for (const f of await pickFiles()) await ds.uploadMaterial(f)
    setTab('materials'); data.reload(); toast('已上传到素材')
  }

  return (
    <div className={'drw' + (closing ? ' closing' : '')} aria-label="资产">
      <div className="dh">
        <b>资产</b>
        <div className="x"><button className="ibtn" aria-label="关闭" onClick={onClose}><Icon name="x" /></button></div>
      </div>
      <SlidingTabs
        tabs={TABS}
        active={tab}
        small
        onChange={(id) => { setTab(id); setPicked({}) }}
      />
      <label className="search"><Icon name="search" size={14} /><input placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {tab === 'products' && (
        <div className="chips">
          <button className={'chip sm' + (!cat ? ' on' : '')} onClick={() => setCat(undefined)}>全部</button>
          {(cats.data ?? []).map((c) => <button key={c.id} className={'chip sm' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      )}
      <div className="ag">
        {data.loading && !data.data ? (
          Array.from({ length: 6 }, (_, k) => (
            <div key={k} className="at2" aria-hidden>
              <div className="ph2 shimmer" />
              <div className="skel-line sm" />
            </div>
          ))
        ) : (
          tiles.map((t, idx) => (
            <div
              key={t.key}
              className="at2"
              style={{ '--i': idx } as CSSProperties}
              draggable={!!t.att}
              onDragStart={(e) => { if (t.att) { e.dataTransfer.setData('application/x-v2-asset', JSON.stringify(t.att)); e.dataTransfer.effectAllowed = 'copy' } }}
            >
              {t.image?.url
                ? <div className={'ph2' + (t.cover ? ' cov' : '')}><img src={t.image.thumbUrl ?? t.image.url} alt="" draggable={false} /></div>
                : <div className="ph2 ph0">占位</div>}
              {t.att && (
                <div className="hv2">
                  <button onClick={() => t.att && onAddToChat([t.att])}>加到对话</button>
                  <button className="g" onClick={() => t.att && onPlace([t.att])}>放到画布</button>
                </div>
              )}
              {t.att && (picked[t.key]
                ? <b className="ck" onClick={() => toggle(t)}><Icon name="check" size={11} /></b>
                : <b className="ck0" onClick={() => toggle(t)} />)}
              <div className="nm">{t.label}</div>
            </div>
          ))
        )}
        {!data.loading && tiles.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <EmptyState icon="asset" title="这里还没有内容" subtitle="可点击下方按钮上传或切换其他资产分类" />
          </div>
        )}
      </div>
      <div className="dft">
        <button className="btn" onClick={upload}><Icon name="plus" size={13} />上传</button>
        <span className="sp" />
        {pickedList.length > 0 && <span>已选 {pickedList.length}</span>}
        <button className="btn pri" disabled={!pickedList.length} onClick={() => { onAddToChat(pickedList); setPicked({}) }}>加到对话</button>
      </div>
      {uploadOpen && <UploadProductModal onClose={() => setUploadOpen(false)} onDone={() => data.reload()} />}
    </div>
  )
}

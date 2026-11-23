'use client'
import { Link } from '@/lib/navigation'
import { useRouter } from '@/lib/navigation'
import { useState } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { KIND_LABEL } from './assets-page'
import { Icon } from './icons'
import { EmptyState, relTime } from './ui'

export function ProductPage({ id }: { id: string }) {
  const ds = useV2()
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const { data: p, loading } = useLoad((d) => d.getProduct(id), [id])
  const { data: cats } = useLoad((d) => d.listCategories())
  const { data: projects } = useLoad((d) => d.listProjects())
  const { data: gens } = useLoad((d) => d.listGenerations({ productId: id }), [id])
  if (loading) {
    return (
      <>
        <div className="mh">
          <div className="ibtn shimmer" />
          <div className="skel-line" style={{ width: 180, height: 22, marginTop: 0 }} />
        </div>
        <div className="pd">
          <div className="big shimmer" />
          <div>
            <div className="skel-line" style={{ width: '45%', height: 16 }} />
            <div className="skel-line" style={{ width: '60%', height: 16, marginTop: 14 }} />
            <div className="shimmer" style={{ height: 96, borderRadius: 10, marginTop: 24 }} />
          </div>
        </div>
      </>
    )
  }
  if (!p) {
    return (
      <>
        <EmptyState
          icon="asset"
          title="商品不存在"
          subtitle="该商品可能已被移除或链接有误"
          action={<Link href="/v2/assets?tab=products" className="btn pri">返回商品库</Link>}
        />
      </>
    )
  }
  const used = (projects ?? []).filter((x) => p.projectIds.includes(x.id))
  const start = async () => { const pj = await ds.createProject({ name: p.name, productIds: [p.id] }); router.push(`/v2/canvas/${pj.id}`) }
  const img = p.images[idx]
  return (
    <>
      <div className="mh">
        <Link href="/v2/assets?tab=products" className="ibtn" aria-label="返回"><Icon name="left" /></Link>
        <h1>{p.name}</h1><span className="sp" />
        <button className="btn pri" onClick={start}><Icon name="create" size={14} />用它新建项目</button>
      </div>
      <div className="pd">
        <div>
          <div className={'big' + (img ? '' : ' ph0')}>{img ? <img key={img.id} src={img.url} alt="" /> : '占位'}</div>
          <div className="thumbs">
            {p.images.map((im, i) => <button key={im.id} onClick={() => setIdx(i)} style={i === idx ? { outline: '1.5px solid var(--acc)' } : undefined}><img src={im.url} alt="" /></button>)}
            <button className="add" aria-label="添加角度"><Icon name="plus" /></button>
          </div>
        </div>
        <div>
          <dl>
            <dt>类目</dt><dd>{cats?.find((c) => c.id === p.categoryId)?.name}</dd>
            <dt>商品图</dt><dd>{p.images.length} 张</dd>
            <dt>已生成</dt><dd>{p.generatedCount} 张</dd>
            <dt>用在</dt><dd>{used.length ? used.map((u, i) => <span key={u.id}>{i > 0 && '、'}<Link prefetch={false} href={`/v2/canvas/${u.id}?view=split`} style={{ color: 'var(--acc)' }}>{u.name}</Link></span>) : '还没有项目'}</dd>
            <dt>更新</dt><dd>{relTime(p.updatedAt)}</dd>
          </dl>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>卖点与参数（Agent 写文案、做详情页时会用）</div>
          <textarea defaultValue={p.notes} placeholder="材质、尺寸、核心卖点、适用人群……" />
          <div className="dg">这个商品的生成<small>{gens?.length ?? 0} 张</small></div>
          <div className="hrow">
            {(gens ?? []).slice(0, 12).map((g) => (
              <div key={g.id} className="hi" style={{ height: 150 }}>
                <img src={g.image.url} alt="" /><span className="tag">{KIND_LABEL[g.kind]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

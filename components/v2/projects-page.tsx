'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import { Icon } from './icons'
import { Shell } from './shell'
import { CardSkeleton, EmptyState, relTime } from './ui'

export function ProjectsPage() {
  const ds = useV2()
  const router = useRouter()
  const [q, setQ] = useState('')
  const { data: projects, loading } = useLoad((d) => d.listProjects())
  const { data: products } = useLoad((d) => d.listProducts())
  const list = (projects ?? []).filter((p) => !q || p.name.includes(q))
  const create = async () => { const p = await ds.createProject({}); router.push(`/v2/canvas/${p.id}?view=chat`) }
  return (
    <Shell>
      <div className="mh">
        <h1>项目</h1><span className="sp" />
        <label className="search"><Icon name="search" size={14} /><input placeholder="搜索项目" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="pgd">
        <button className="pc add" style={{ '--i': 0 } as CSSProperties} onClick={create}><div className="ph2 r34"><Icon name="plus" size={22} />新建项目</div></button>
        {loading && !projects ? (
          <CardSkeleton count={4} ratio34 />
        ) : (
          list.map((p, idx) => {
            const names = p.productIds.map((id) => products?.find((x) => x.id === id)?.name).filter(Boolean)
            return (
              <Link key={p.id} href={`/v2/canvas/${p.id}?view=split`} className="pc" style={{ '--i': idx + 1 } as CSSProperties}>
                <div className="ph2 r34 cov" style={{ background: '#202020' }}>
                  {p.cover ? <img src={p.cover.url} alt="" /> : <span className="muted" style={{ fontSize: 12 }}>空画布</span>}
                  <div className="pc-ov">
                    <span className="pc-ov-pill">进入画布 <Icon name="right" size={11} /></span>
                  </div>
                </div>
                <div className="t">{p.name}</div>
                <div className="m">{names.length ? names.join('、') : '未关联商品'} · {relTime(p.updatedAt)}</div>
              </Link>
            )
          })
        )}
      </div>
      {!loading && list.length === 0 && (
        <EmptyState
          icon="canvas"
          title="没有找到项目"
          subtitle="试试其他搜索词，或直接新建一个空白画布项目"
          action={<button className="btn pri" onClick={create}><Icon name="plus" size={14} />新建项目</button>}
        />
      )}
    </Shell>
  )
}

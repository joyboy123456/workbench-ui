'use client'
import Link from 'next/link'
import React, { useState, type CSSProperties } from 'react'
import { useLoad } from '@/lib/v2/data-source'
import { Icon } from './icons'
import { Shell } from './shell'
import { useCreateProject } from './use-create-project'
import { CardSkeleton, EmptyState, relTime } from './ui'

export function ProjectsPage() {
  const { create, creating } = useCreateProject()
  const [search, setSearch] = useState('')
  const { data: projects, loading } = useLoad((d) => d.listProjects())
  const { data: products } = useLoad((d) => d.listProducts())
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const list = (projects ?? []).filter(project => !normalizedSearch || project.name.toLocaleLowerCase().includes(normalizedSearch))
  return (
    <Shell>
      <div className="mh lv-ph">
        <h1>项目</h1><span className="sp" />
        <label className="search"><Icon name="search" size={14} /><input aria-label="搜索项目" placeholder="搜索项目名称" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
      <div className="pgd lv-pgd">
        <button className="pc add" style={{ '--i': 0 } as CSSProperties} disabled={creating} onClick={create}><div className="ph2"><Icon name="plus" size={20} /></div><div className="t">新建项目</div></button>
        {loading && !projects ? (
          <CardSkeleton count={4} />
        ) : (
          list.map((p, idx) => {
            const names = p.productIds.map((id) => products?.find((x) => x.id === id)?.name).filter(Boolean)
            return (
              <Link key={p.id} href={`/v2/canvas/${p.id}?view=split`} className="pc" style={{ '--i': idx + 1 } as CSSProperties}>
                <div className="ph2 cov">
                  {p.cover ? <img src={p.cover.url} alt="" /> : <span className="muted" style={{ fontSize: 12 }}>空画布</span>}
                </div>
                <div className="t">{p.name}</div>
                <div className="m">更新于 {relTime(p.updatedAt)}{names.length ? ` · ${names.join('、')}` : ''}</div>
              </Link>
            )
          })
        )}
      </div>
      {!loading && list.length === 0 && (
        <EmptyState
          icon="canvas"
          title={search ? '没有找到匹配的项目' : '还没有项目'}
          subtitle={search ? '试试其他项目名称' : '新建一个空白画布项目开始创作'}
          action={!search ? <button className="btn pri" disabled={creating} onClick={create}><Icon name="plus" size={14} />新建项目</button> : undefined}
        />
      )}
    </Shell>
  )
}

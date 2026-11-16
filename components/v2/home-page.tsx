'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { AgentMode, ChatAttachment } from '@/lib/v2/types'
import { Composer, type ComposerSubmission } from './composer'
import { Icon } from './icons'
import { Shell } from './shell'
import { CardSkeleton, Thumb, relTime } from './ui'
import { useV2Auth } from './auth'


export const PENDING_KEY = (projectId: string) => `v2:pending:${projectId}`

export function HomePage() {
  const ds = useV2()
  const router = useRouter()
  const { user, requireAuth } = useV2Auth()
  const [atts, setAtts] = useState<ChatAttachment[]>([])
  const { data: projects, loading: loadingProjects } = useLoad((d) => d.listProjects(), [user?.id], !!user)
  const { data: tools } = useLoad((d) => d.listTools())
  const { data: cases, loading: loadingCases } = useLoad((d) => d.listCases())
  const recent = (projects ?? []).slice(0, 6)

  const startProject = async (text: string, mode: AgentMode, attachments = atts, submission?: ComposerSubmission) => {
    const productIds = attachments.filter((a) => a.kind === 'product').map((a) => a.id)
    const cleanTitle = text.replace(/^\/[^\s]+\s*/, '').trim().slice(0, 16) || text.trim().slice(0, 16) || undefined
    const p = await ds.createProject({ name: cleanTitle, productIds })
    sessionStorage.setItem(PENDING_KEY(p.id), JSON.stringify({ text, mode, attachments, submission }))
    router.push(`/v2/canvas/${p.id}?view=chat`)
  }
  const start = (text: string, mode: AgentMode, attachments = atts, submission?: ComposerSubmission) => requireAuth(() => startProject(text, mode, attachments, submission))

  const protectedLink = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!user) { event.preventDefault(); void requireAuth(() => router.push(href)) }
  }

  return (
    <Shell>
      <section className="hero">
        <h1>今天要给哪个商品出图？</h1>
        <p className="hero-sub">上传商品图或引用资产，快速生成电商主图、详情页与模特图</p>
        <Composer
          attachments={atts}
          onAttachmentsChange={setAtts}
          onSend={(t, m, submission) => startProject(t, m, atts, submission)}
          placeholder="上传商品图或用 @ 引用，说说要主图、详情页还是模特图"
          autoFocus
        />
        <div className="toolrow">
          {(tools ?? []).filter((t) => t.surfaces.includes('home')).map((t) => (
            <button key={t.id} className="btn" onClick={() => start(`/${t.name} `, 'agent')}><Icon name={t.icon} size={14} />{t.name}</button>
          ))}
        </div>
      </section>

      <div className="sec-h">最近项目<Link href="/v2/projects" onClick={e => protectedLink(e, '/v2/projects')}>全部项目</Link></div>
      <div className="pgd">
        {loadingProjects && !projects ? (
          <CardSkeleton count={4} />
        ) : (
          <>
            {recent.map((p, i) => (
              <Link key={p.id} href={`/v2/canvas/${p.id}?view=split`} className="pc" style={{ '--i': i } as CSSProperties}>
                <Thumb
                  image={p.cover}
                  label="空项目"
                  cover
                  overlay={
                    <div className="pc-ov">
                      <span className="pc-ov-pill">进入画布 <Icon name="right" size={11} /></span>
                    </div>
                  }
                />
                <div className="t">{p.name}</div>
                <div className="m">更新于 {relTime(p.updatedAt)}</div>
              </Link>
            ))}
            {/* 项目不足一行时补一张「新建项目」卡，避免首页大片留空 */}
            {recent.length < 4 && (
              <button
                className="pc add"
                style={{ '--i': recent.length } as CSSProperties}
                onClick={() => requireAuth(async () => { const p = await ds.createProject({}); router.push(`/v2/canvas/${p.id}?view=chat`) })}
              >
                <div className="ph2"><Icon name="plus" size={20} /></div>
                <div className="t">新建项目</div>
                <div className="m">{user ? '上传商品开始出图' : '登录后创建，保留每次创作'}</div>
              </button>
            )}
          </>
        )}
      </div>

      <div className="sec-h">做同款</div>
      <div className="pgd">
        {loadingCases && !cases ? (
          <CardSkeleton count={6} ratio34 />
        ) : (
          (cases ?? []).map((c, i) => (
            <button
              type="button"
              key={c.id}
              className="pc"
              style={{ '--i': i } as CSSProperties}
              onClick={() => start(c.prompt ?? `参考这个案例做同款：${c.title}`, 'agent', [{ kind: 'material', id: c.id, label: c.title, image: c.image }])}
            >
              <div className="ph2 r34 cov">
                <img src={c.image.thumbUrl ?? c.image.url} alt="" />
                <div className="pc-ov">
                  <span className="pc-ov-pill"><Icon name="create" size={11} />做同款</span>
                </div>
              </div>
              <div className="t">{c.title}</div>
              <div className="m">点击做同款</div>
            </button>
          ))
        )}
        {cases && cases.length === 0 && <CardSkeleton count={6} ratio34 />}
      </div>
    </Shell>
  )
}

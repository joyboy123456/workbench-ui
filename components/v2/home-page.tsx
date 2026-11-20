'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLoad, useV2 } from '@/lib/v2/data-source'
import type { AgentMode, CaseExample, ChatAttachment, ToolCatalogItem } from '@/lib/v2/types'
import { composerAttachments } from '@/lib/v2/composer-input'
import { PENDING_KEY } from '@/lib/v2/pending-message'
import { composerModeKey } from '@/lib/v2/agent-mode'
import { Composer, type ComposerSubmission } from './composer'
import { Icon } from './icons'
import { Shell } from './shell'
import { useToast } from './ui'
import { useV2Auth } from './auth'
import { ToolLaunchModal } from './tool-launch-modal'
import { CASE_CATEGORY_LABEL, CASE_CATEGORY_ORDER_PUBLIC, CaseGallery } from './case-gallery'
import type { CaseCategory } from '@/lib/v2/types'
import { HOME_TOOL_ORDER, HOME_TOOL_PREVIEWS } from '@/lib/v2/home-tool-previews'

const pickScenes = (all: ToolCatalogItem[]) => {
  const ready = all.filter(tool => tool.status === 'ready')
  const readyById = new Map(ready.map(tool => [tool.id, tool]))
  const showcase = HOME_TOOL_ORDER.flatMap(id => {
    const tool = readyById.get(id)
    return tool ? [tool] : []
  })
  const other = ready.filter(tool => !HOME_TOOL_PREVIEWS[tool.id])
  return [...showcase, ...other.filter(tool => tool.featured), ...other.filter(tool => !tool.featured)].slice(0, HOME_TOOL_ORDER.length)
}

interface HeroSceneChip {
  id: string
  label: string
  icon: string
  prompts: { text: string; tag: string; mode?: AgentMode }[]
}

const HERO_SCENE_CHIPS: HeroSceneChip[] = [
  {
    id: 'ecom',
    label: '电商',
    icon: 'bag',
    prompts: [
      { text: '用我的商品原图制作一套亚马逊 Listing 商品图，包含白底主图、英文卖点图和使用场景图，各一张。', tag: '亚马逊商品套图', mode: 'agent' },
      { text: '基于商品原图严格保留版型与细节，生成一组高转化自然光模特主图', tag: 'AI商品主图' },
      { text: '固定当前服装与模特，衍生正面、侧面、走姿与近景等 8 张多机位套图', tag: '主图裂变' },
      { text: '把商品卖点拆解成首屏视觉、面料微距与穿搭场景的统一风格套图', tag: '详情套图' },
    ],
  },
  {
    id: 'social',
    label: '社交媒体',
    icon: 'social',
    prompts: [
      { text: '生成一组适合小红书首图的 3:4 春日街拍穿搭种草图，氛围松弛自然', tag: '穿搭种草' },
      { text: '围绕同款单品打造通勤、周末咖啡馆、度假三套不同场景的系列海报', tag: '系列海报' },
      { text: '提取商品核心质感，设计一张视觉干净、构图吸睛的新品上新封面图', tag: '上新封面' },
    ],
  },
  {
    id: 'brand',
    label: '品牌',
    icon: 'brand',
    prompts: [
      { text: '以极简高级影棚柔光拍摄一组画册级 Lookbook 服装品牌形象大片', tag: '品牌大片' },
      { text: '将品牌图案或标志自然融合到商品材质光影中，输出真实感样机效果图', tag: '虚拟样机' },
      { text: '统一整组商品图的色调与光影冷暖倾向，保持店铺视觉调性高度一致', tag: '色调统一' },
    ],
  },
  {
    id: 'creative',
    label: '创意',
    icon: 'palette',
    prompts: [
      { text: '基于原款服装保留版型基因，探索 4 个不同面料花型与流行配色方案', tag: '配色改款' },
      { text: '把这件服装转换成线条干净、结构准确的白底平面生产款式线稿图', tag: '款式线稿' },
      { text: '融合两款参考服装的领型与廓形亮点，输出一组新季款式设计灵感图', tag: '多款混合' },
    ],
  },
  {
    id: 'detail',
    label: '详情页',
    icon: 'globe',
    prompts: [
      { text: '从商品主图规划并生成 6 屏版式统一、卖点清晰的完整电商详情页', tag: 'AI详情页' },
      { text: '生成白底平铺、3D 立体悬浮与领口袖口面料微距三联特写套图', tag: '细节特写' },
      { text: '参考高转化详情页版式结构，替换成当前商品生成同款排版成图', tag: '智能仿版' },
    ],
  },
]

export function HomePage() {
  const ds = useV2()
  const router = useRouter()
  const toast = useToast()
  const [caseCat, setCaseCat] = useState<'all' | CaseCategory>('all')
  const { user, requireAuth } = useV2Auth()
  const [atts, setAtts] = useState<ChatAttachment[]>([])
  const [heroDraft, setHeroDraft] = useState<{ text: string; seq: number; mode?: AgentMode } | null>(null)
  const heroComposer = useRef<HTMLDivElement>(null)
  const [showQuickComposer, setShowQuickComposer] = useState(false)
  useEffect(() => {
    const target = heroComposer.current
    const root = target?.closest('.main')
    if (!target || !root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setShowQuickComposer(entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0))
    }, { root })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  const [activeScene, setActiveScene] = useState<string | null>(null)
  const { data: catalog, loading: loadingCatalog } = useLoad((d) => d.listToolCatalog())
  const [activeTool, setActiveTool] = useState<ToolCatalogItem | null>(null)

  const scenes = useMemo(() => pickScenes(catalog ?? []), [catalog])
  const selectedScene = HERO_SCENE_CHIPS.find((item) => item.id === activeScene) ?? null
  const openingProject = useRef(false)
  const creationAttempt = useRef<{ input: string; messageId: string; createdAt: string } | null>(null)
  const [opening, setOpening] = useState(false)
  const startProject = async (
    text: string,
    mode: AgentMode,
    attachments = atts,
    submission?: ComposerSubmission,
    extra?: { caseId?: string; prefillOnly?: boolean; inputHint?: string[]; projectName?: string },
  ) => {
    if (openingProject.current) return false
    openingProject.current = true
    setOpening(true)
    try {
      const input = JSON.stringify([user?.id, text, mode, attachments, submission, extra])
      if (creationAttempt.current?.input !== input) {
        creationAttempt.current = { input, messageId: crypto.randomUUID(), createdAt: new Date().toISOString() }
      }
      const { messageId, createdAt } = creationAttempt.current
      const productIds = attachments.filter(a => a.kind === 'product').map(a => a.id)
      const firstMessage = extra?.prefillOnly ? undefined : {
        id: messageId, role: 'user' as const, text, mode, generation: submission?.generation,
        createdAt,
        attachments: attachments.flatMap(a => {
          const { id, url, thumbUrl, width, height } = a.image
          // Blob previews live only in this tab. The chat transport registers them before POST.
          if (!/^(https?:\/\/|\/(?!\/))/.test(url)) return []
          return [{ ...a, image: { id, url, width, height, thumbUrl } }]
        }),
      }
      const draft = JSON.stringify({ messageId, text, mode, attachments, submission, ...extra })
      const p = await ds.createProject({ ...(extra?.projectName ? { name: extra.projectName } : {}), productIds, firstMessage })
      try {
        sessionStorage.setItem(PENDING_KEY(p.id), draft)
      } catch {
        if (!extra?.prefillOnly && !submission?.tool) {
          // Storage can be unavailable in a private tab. The project already contains the first message.
          const sent = await ds.sendMessage(p.id, { clientMessageId: messageId, text, mode, attachments,
            caseId: extra?.caseId ?? submission?.caseId, generation: submission?.generation }, () => {})
          if (sent === false) toast('消息已保存，请进入项目核实发送结果。')
        } else toast('浏览器未能保存工具草稿，请在项目中重新选择工具。')
      }
      try {
        const account = user ?? await ds.getSession()
        localStorage.setItem(composerModeKey(account?.id, p.id), JSON.stringify(mode))
        localStorage.setItem(composerModeKey(account?.id), JSON.stringify(mode))
      } catch { /* The pending message also carries the selected mode. */ }
      router.push(`/v2/canvas/${p.id}?view=chat`)
    } catch (error) {
      openingProject.current = false
      setOpening(false)
      throw error
    }
  }
  const start = (
    text: string,
    mode: AgentMode,
    attachments = atts,
    submission?: ComposerSubmission,
    extra?: { caseId?: string; prefillOnly?: boolean; inputHint?: string[]; projectName?: string },
  ) =>
    requireAuth(() => startProject(text, mode, attachments, submission, extra))
  const startCase = (c: CaseExample) => {
    const mode = c.video ? 'video' : 'agent'
    if (atts.length > 0) {
      void start(c.keyword, mode, composerAttachments(mode, atts), undefined, { caseId: c.id, projectName: c.title })
      return
    }
    void start(c.keyword, mode, [], undefined, {
      caseId: c.id,
      prefillOnly: true,
      inputHint: c.inputHint,
      projectName: c.title,
    })
  }

  return (
    <Shell>
      <div className="lv-home">
        <section className="lv-hero">
          <h1>今天给哪件商品出图？</h1>
          <div className="hm-composer" ref={heroComposer}>
            <Composer
              hero
              busy={opening}
              floating={showQuickComposer}
              draft={heroDraft}
              attachments={atts}
              onAttachmentsChange={setAtts}
              onSend={(t, m, submission) => startProject(t, m, composerAttachments(m, atts, submission.firstFrame), submission)}
              placeholder="上传商品图，描述想要的画面"
              autoFocus
            />
          </div>
          <div className="lv-chips" role="toolbar" aria-label="快捷场景">
            {HERO_SCENE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={'lv-chip' + (activeScene === chip.id ? ' on' : '')}
                aria-expanded={activeScene === chip.id}
                onClick={() => setActiveScene((prev) => (prev === chip.id ? null : chip.id))}
              >
                <Icon name={chip.icon} size={14} />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
          {selectedScene && (
            <div className="lv-scene-panel" role="region" aria-label={`${selectedScene.label}创作灵感`}>
              <div className="lv-scene-panel-hd">
                <span><Icon name={selectedScene.icon} size={14} />{selectedScene.label}推荐指令</span>
                <button type="button" className="ibtn" aria-label="关闭推荐指令" onClick={() => setActiveScene(null)}>
                  <Icon name="x" size={13} />
                </button>
              </div>
              <div className="lv-scene-rows">
                {selectedScene.prompts.map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    className="lv-scene-row"
                    onClick={() => {
                      setHeroDraft((prev) => ({ text: item.text, seq: (prev?.seq ?? 0) + 1, mode: item.mode }))
                      setActiveScene(null)
                    }}
                  >
                    <span className="lv-scene-txt">{item.text}</span>
                    <em className="lv-scene-tag">{item.tag}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="lv-block">
          <div className="lv-sec-h">
            <span>工具</span>
            <Link className="lv-more" href="/v2/tools">更多工具 <Icon name="right" size={11} /></Link>
          </div>
          <div className="lv-tool-row">
            {loadingCatalog && !catalog
              ? Array.from({ length: HOME_TOOL_ORDER.length }, (_, i) => <div key={i} className="lv-tool"><span className="lv-tool-th skel" /></div>)
              : scenes.map((t, i) => {
                  const preview = HOME_TOOL_PREVIEWS[t.id]
                  const title = preview?.title ?? t.name
                  return (
                    <button
                      type="button"
                      key={t.id}
                      className="lv-tool"
                      style={{ '--i': i } as CSSProperties}
                      disabled={t.status !== 'ready'}
                      aria-label={title}
                      aria-description={preview?.description}
                      onClick={() => setActiveTool(t)}
                    >
                      {preview ? (
                        <span className="lv-tool-th lv-tool-preview" data-layout={preview.layout} aria-hidden="true">
                          {preview.panels.map(({ src, label, position, fit }) => (
                            <span className="lv-tool-panel" key={src}>
                              <img src={src} alt="" decoding="async" style={{ objectPosition: position, objectFit: fit }} />
                              {label && <span className="lv-tool-caption">{label}</span>}
                            </span>
                          ))}
                          <span className="lv-tool-cue" />
                        </span>
                      ) : (
                        <span className="lv-tool-th"><img src={t.cover.after} alt="" decoding="async" /></span>
                      )}
                      <span className="lv-tool-n">{title}</span>
                    </button>
                  )
                })}
          </div>
        </section>

        <section className="lv-block">
          <div className="lv-sec-h"><span>案例</span></div>
          <div className="lv-scenebar" role="toolbar" aria-label="案例分类">
            {(['all', ...CASE_CATEGORY_ORDER_PUBLIC] as ('all' | CaseCategory)[]).map((c) => (
              <button key={c} type="button" className={caseCat === c ? 'on' : ''} onClick={() => setCaseCat(c)}>{c === 'all' ? '为你推荐' : CASE_CATEGORY_LABEL[c]}</button>
            ))}
          </div>
          <div className="hm-cases-wrap" id="cases">
            <CaseGallery onMakeSame={startCase} category={caseCat} hideFilters />
          </div>
        </section>
      </div>
          {activeTool && <ToolLaunchModal tool={activeTool} onClose={() => setActiveTool(null)} />}
    </Shell>
  )
}

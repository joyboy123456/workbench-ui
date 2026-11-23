'use client'
/**
 * V2 界面通过 useV2() 访问数据。前端演示由 mock.ts 实现此接口。
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { V2SessionSource } from './session'
import type { ComposerGeneration, ComposerOptions } from './composer-options'
import type {
  Account, ActiveTask, AgentMode, CaseExample, CasePage, CaseQuery, ToolCatalogItem, AssistantMessage, BrandKit, CanvasItem, ChatAttachment, ChatMessage,
  ComposerReferences, FashionModel, Generation, GenerationKind, UserMessage, ImageRef, Material, MaterialCategory, Product, ProductCategory, Project, PromptPreset, ToolDef, ToolParams,
} from './types'

export interface ProductQuery { categoryId?: string; search?: string }
export interface MaterialQuery { categoryId?: string; uncategorized?: boolean; search?: string; trash?: boolean }
export interface GenerationQuery { kind?: GenerationKind; projectId?: string; productId?: string; toolId?: string; favorite?: boolean; sort?: 'newest' | 'oldest'; search?: string; limit?: number; offset?: number }

/** Agent / 工具运行时推给前端的事件流（接线时可由 SSE / WebSocket 转换而来） */
export type AgentEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'message-update'; id: string; patch: Partial<AssistantMessage> }
  | { type: 'item-add'; item: CanvasItem }
  | { type: 'item-update'; id: string; patch: Partial<CanvasItem> }
  | { type: 'error'; message: string; receiptRejected?: boolean }
  | { type: 'done' }

export interface SendInput {
  clientMessageId?: string
  threadId?: string
  text: string
  attachments: ChatAttachment[]
  mode: AgentMode
  caseId?: string
  generation?: ComposerGeneration
  contents?: import('./structured-input').StructuredContentBlock[]
  extra?: import('./structured-input').AgentMessageExtra
}

export interface V2DataSource extends V2SessionSource {
  getAccount(): Promise<Account>
  getComposerOptions(): Promise<ComposerOptions>
  getComposerReferences(): Promise<ComposerReferences>
  listTools(): Promise<ToolDef[]>
  /** 首页「做同款」案例，返回 8–12 条即可；空数组时首页显示占位卡，不隐藏这一栏 */
  listCases(): Promise<CaseExample[]>
  /** 案例库分页：按分类 / 工具筛选，带分类与工具计数 */
  listCasePage(q?: CaseQuery): Promise<CasePage>
  /** 首页精选轮播（4–6 张竖图） */
  listFeaturedCases(): Promise<CaseExample[]>
  /** AI 工具广场：全部工具（id = clothing-tool-catalog.json 的 id） */
  listToolCatalog(): Promise<ToolCatalogItem[]>

  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<{ project: Project; items: CanvasItem[]; messages: ChatMessage[] } | null>
  createProject(input: { name?: string; productIds?: string[]; firstMessage?: UserMessage }): Promise<Project>
  renameProject(id: string, name: string): Promise<void>
  deleteProject(id: string): Promise<void>
  setProjectCover(projectId: string, itemId: string): Promise<Project>
  saveCanvasMaterial(projectId: string, itemId: string): Promise<Material>
  saveCanvas(projectId: string, items: CanvasItem[], messages?: ChatMessage[]): Promise<void>
  patchCurtain?(projectId: string, patch: import('./project-schema').CurtainPatch): Promise<void>
  saveMessages?(projectId: string, messages: ChatMessage[]): Promise<void>
  /** 经现有媒体鉴权读取字节，供本地编辑、合并及原图下载。 */
  readCanvasImage(image: ImageRef): Promise<Blob>

  listCategories(): Promise<ProductCategory[]>
  createCategory(name: string): Promise<ProductCategory>
  listProducts(q?: ProductQuery): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  uploadProduct(files: File[], meta: { name?: string; categoryId: string }): Promise<Product>

  listModels(): Promise<FashionModel[]>
  uploadModel(file: File): Promise<void>
  listBrandKits(): Promise<BrandKit[]>
  listMaterialCategories(): Promise<MaterialCategory[]>
  createMaterialCategory(name: string): Promise<MaterialCategory>
  renameMaterialCategory(id: string, name: string): Promise<MaterialCategory>
  deleteMaterialCategory(id: string): Promise<void>
  listMaterials(q?: MaterialQuery): Promise<Material[]>
  uploadMaterial(file: File, categoryId?: string): Promise<Material>
  moveMaterial(id: string, categoryId?: string): Promise<Material>
  deleteMaterial(id: string, permanent?: boolean): Promise<void>
  restoreMaterial(id: string): Promise<Material>
  /** 生成结果手动存为素材（不自动入库） */
  saveAsMaterial(generationId: string): Promise<Material>

  listPromptPresets(): Promise<PromptPreset[]>
  createPromptPreset(input: { name: string; content: string }): Promise<PromptPreset>
  updatePromptPreset(id: string, input: { name: string; content: string }): Promise<PromptPreset>
  deletePromptPreset(id: string): Promise<void>
  optimizePrompt(text: string): Promise<{ prompt: string }>

  /** 跨项目的生成记录，按时间倒序 */
  listGenerations(q?: GenerationQuery): Promise<Generation[]>
  listGenerationPage(q?: GenerationQuery): Promise<import('./generation-history').GenerationPage>
  getGeneration(id: string): Promise<import('./generation-history').GenerationDetail | null>
  setGenerationFavorite(ids: string[], favorite: boolean): Promise<void>
  deleteGenerations(ids: string[]): Promise<void>
  downloadGenerations(ids: string[]): Promise<Blob>

  /** API-only capabilities; absent in mock mode. Unmount aborts observation, never generation. */
  watchAgent?(projectId: string, onEvent: (e: AgentEvent) => void, onState: (state: import('./agent-chat-contract').AgentChatState) => void, signal: AbortSignal): Promise<void>
  retryAgentOutput?(projectId: string, target: import('@/lib/agent/retry').AgentRetryTarget): Promise<void>
  respondClarification?(projectId: string, command: import('@/lib/agent/clarification').ClarificationCommand): Promise<void>
  reviewImagePlan?(projectId: string, command: import('@/lib/agent-pi/image-plan').PiImagePlanCommand, onEvent?: (e: AgentEvent) => void): Promise<void>
  stopMessage?(projectId: string): Promise<{ inFlightSlotCount: number }>
  skipQueue?(projectId: string, payload?: { threadId?: string; actionId?: string; stepId?: string; toolCallIds?: string[]; generatorTaskIds?: string[] }): Promise<void>
  restoreCashier?(projectId: string, payload?: { threadId?: string; restoreInfos?: Record<string, unknown> }): Promise<void>
  /** 只读核实原任务；不创建新轮次或重放 POST。 */
  refreshAgent?(projectId: string): Promise<void>
  uploadChatAttachment?(file: File): Promise<ChatAttachment>

  sendMessage(projectId: string, input: SendInput, onEvent: (e: AgentEvent) => void, signal?: AbortSignal, beforePost?: () => void): Promise<void | false>
  runTool(projectId: string, toolId: string, itemIds: string[], onEvent: (e: AgentEvent) => void, params?: ToolParams): Promise<void>
  getToolPricing?(): Promise<{ billingEnabled: boolean; perOutput: number }>
  /** API-only task recovery; cleanup stops polling when the canvas unmounts. */
  watchToolRuns?(projectId: string, onEvent: (e: AgentEvent) => void): () => void
  retryToolRun?(projectId: string, runId: string, onEvent: (e: AgentEvent) => void): Promise<void>
  /** 视频任务重试：受理后由对话通道快照继续投影，不需要事件流。 */
  retryVideoTask?(projectId: string, id: string): Promise<void>
  /** 任务托盘：获取及订阅正在运行的生成任务 */
  listActiveTasks?(): Promise<ActiveTask[]>
  subscribeTasks?(listener: (tasks: ActiveTask[]) => void): () => void
}

const Ctx = createContext<V2DataSource | null>(null)

export function V2Provider({ source, children }: { source: V2DataSource; children: ReactNode }) {
  return <Ctx.Provider value={source}>{children}</Ctx.Provider>
}

export function useV2(): V2DataSource {
  const v = useContext(Ctx)
  if (!v) throw new Error('useV2 must be used inside <V2Provider>')
  return v
}

/** 小型异步加载 hook：deps 变化时重新取数 */
export function useLoad<T>(fn: (ds: V2DataSource) => Promise<T>, deps: unknown[] = [], enabled = true) {
  const ds = useV2()
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) { setState({ loading: false }); return }
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fn(ds).then(
      (data) => alive && setState({ data, loading: false }),
      (e: unknown) => alive && setState({ loading: false, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => { alive = false }
  }, [ds, tick, enabled, ...deps])
  return useMemo(() => ({ ...state, reload: () => setTick((t) => t + 1) }), [state])
}

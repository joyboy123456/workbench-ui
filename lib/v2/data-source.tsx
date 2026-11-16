'use client'
/**
 * V2 前端唯一的数据入口。页面和组件只通过 useV2() 拿数据，不直接 fetch。
 * 本仓库只有 mock 实现（lib/v2/mock.ts）；接口保持与主仓库一致，便于把改好的界面合回去。
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { V2SessionSource } from './session'
import type { ComposerGeneration, ComposerOptions } from './composer-options'
import type {
  Account, AgentMode, CaseExample, ToolCatalogItem, AssistantMessage, BrandKit, CanvasItem, ChatAttachment, ChatMessage,
  ComposerReferences, FashionModel, Generation, GenerationKind, Material, Product, ProductCategory, Project, ToolDef, ToolParams,
} from './types'

export interface ProductQuery { categoryId?: string; search?: string }
export interface GenerationQuery { kind?: GenerationKind; projectId?: string; productId?: string; toolId?: string; favorite?: boolean; sort?: 'newest' | 'oldest'; search?: string; limit?: number; offset?: number }

/** Agent / 工具运行时推给前端的事件流（接线时可由 SSE / WebSocket 转换而来） */
export type AgentEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'message-update'; id: string; patch: Partial<AssistantMessage> }
  | { type: 'item-add'; item: CanvasItem }
  | { type: 'item-update'; id: string; patch: Partial<CanvasItem> }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface SendInput { text: string; attachments: ChatAttachment[]; mode: AgentMode; generation?: ComposerGeneration }

export interface V2DataSource extends V2SessionSource {
  getAccount(): Promise<Account>
  getComposerOptions(): Promise<ComposerOptions>
  getComposerReferences(): Promise<ComposerReferences>
  listTools(): Promise<ToolDef[]>
  /** 首页「做同款」案例，返回 8–12 条即可；空数组时首页显示占位卡，不隐藏这一栏 */
  listCases(): Promise<CaseExample[]>
  /** AI 工具广场：全部工具（id = clothing-tool-catalog.json 的 id） */
  listToolCatalog(): Promise<ToolCatalogItem[]>

  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<{ project: Project; items: CanvasItem[]; messages: ChatMessage[] } | null>
  createProject(input: { name?: string; productIds?: string[] }): Promise<Project>
  renameProject(id: string, name: string): Promise<void>
  setProjectCover(projectId: string, itemId: string): Promise<Project>
  saveCanvasMaterial(projectId: string, itemId: string): Promise<Material>
  saveCanvas(projectId: string, items: CanvasItem[], messages?: ChatMessage[]): Promise<void>

  listCategories(): Promise<ProductCategory[]>
  createCategory(name: string): Promise<ProductCategory>
  listProducts(q?: ProductQuery): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  uploadProduct(files: File[], meta: { name?: string; categoryId: string }): Promise<Product>

  listModels(): Promise<FashionModel[]>
  listBrandKits(): Promise<BrandKit[]>
  listMaterials(): Promise<Material[]>
  uploadMaterial(file: File): Promise<Material>
  /** 生成结果手动存为素材（不自动入库） */
  saveAsMaterial(generationId: string): Promise<Material>

  /** 跨项目的生成记录，按时间倒序 */
  listGenerations(q?: GenerationQuery): Promise<Generation[]>
  listGenerationPage(q?: GenerationQuery): Promise<import('./generation-history').GenerationPage>
  getGeneration(id: string): Promise<import('./generation-history').GenerationDetail | null>
  setGenerationFavorite(ids: string[], favorite: boolean): Promise<void>
  deleteGenerations(ids: string[]): Promise<void>
  downloadGenerations(ids: string[]): Promise<Blob>

  /** API-only capabilities; absent in mock mode. Unmount aborts observation, never generation. */
  watchAgent?(projectId: string, onEvent: (e: AgentEvent) => void, onState: (state: import('./agent-chat-contract').AgentChatState) => void, signal: AbortSignal): Promise<void>
  stopMessage?(projectId: string): Promise<{ inFlightSlotCount: number }>
  uploadChatAttachment?(file: File): Promise<ChatAttachment>

  sendMessage(projectId: string, input: SendInput, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void>
  runTool(projectId: string, toolId: string, itemIds: string[], onEvent: (e: AgentEvent) => void, params?: ToolParams): Promise<void>
  getToolPricing?(): Promise<{ billingEnabled: boolean; perOutput: number }>
  /** API-only task recovery; cleanup stops polling when the canvas unmounts. */
  watchToolRuns?(projectId: string, onEvent: (e: AgentEvent) => void): () => void
  retryToolRun?(projectId: string, runId: string, onEvent: (e: AgentEvent) => void): Promise<void>
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

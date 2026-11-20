import { toolPresentation } from '@/lib/agent-beta/tool-view'
import { deliveryFailureReason, publicAgentText } from '@/lib/agent/public-progress'
import { imageDimensions, imageRatio } from './image-metadata'
import { placeResults } from './arrange'
import { yibaiCaseImageUrl } from '../yibai-case-image'
import type { AgentBetaMessage, AgentBetaMessageStatus, AgentBetaNode, AgentBetaSession } from '@/lib/agent-beta/types'
import type { AgentRunEvent } from '@/lib/agent/run-timeline'
import { isPiActionSettled, piActionNeedsRefresh } from '@/lib/agent-pi/types'
import type { AgentEvent } from './data-source'
import type { AssistantMessage, AssistantStep, CanvasItem, ChatMessage, ImageRef } from './types'
import { chatFailure, emptyAgentImage, type AgentChatSnapshot, type AgentChatSubmission, type AgentChatLifecycle } from './agent-chat-contract'
import { generationTarget, toolDurationMs } from './generation-progress'

const imageOf = (node: AgentBetaNode): ImageRef => {
  const cdn = node.url.startsWith('https://image.yibaiaigc.com/')
  return { id: node.assetId, url: cdn ? yibaiCaseImageUrl(node.url, 'detail') : node.url,
    ...(cdn ? { thumbUrl: yibaiCaseImageUrl(node.url) } : {}), width: node.width, height: node.height }
}
const outcomeLabels = { completed: '处理完成', blocked: '需要补充信息', stopped: '已停止后续生成', failed: '本轮处理失败' }

/** Only call with an authenticated, C8-hydrated session. Events cannot supply images. */
export function projectAgentChat(session: AgentBetaSession, submissions: AgentChatSubmission[], receipts: AgentBetaMessageStatus[], events: AgentRunEvent[] = [], canvas: CanvasItem[] = [], options: { closedDeliveries?: Record<string, { message: string; deliveredAssetIds: string[] }>; billingNotice?: string } = {}): AgentChatSnapshot {
  const items: CanvasItem[] = []
  const byRun = new Map<string, AssistantMessage['results']>()
  const slotSteps = new Map<string, AssistantStep[]>()
  const coveredAssets = new Set<string>()
  const slotRuns = new Set<string>()
  const orphanRunId = `agent-results-${session.id}`
  const inputFor = (message?: AgentBetaMessage) => session.nodes.find(node => message?.referenceNodeIds.includes(node.id))
  const parentsFor = (message?: AgentBetaMessage) => {
    const index = session.messages.findIndex(candidate => candidate.id === message?.id)
    const submission = submissions.find(candidate => candidate.clientMessageId === session.messages[index - 1]?.id)
    return [...new Set((submission?.appliedReferences ?? submission?.attachments ?? []).flatMap(attachment => {
      if (attachment.kind === 'canvas') return [attachment.id]
      const item = canvas.find(item => item.image.id === attachment.image.id)
      return item ? [item.id] : []
    }))]
  }
  const add = (runId: string, id: string, status: 'running' | 'done' | 'failed', node?: AgentBetaNode, lifecycle: Partial<CanvasItem> = {}, slotLabel?: string) => {
    const message = session.messages.find(candidate => candidate.id === runId)
    const closed = options.closedDeliveries?.[runId]
    if (closed && (!node || !closed.deliveredAssetIds.includes(node.assetId))) {
      status = 'failed'; node = undefined; lifecycle = { ...lifecycle, errorMessage: closed.message }
    }
    const input = inputFor(message)
    const image = node ? imageOf(node) : emptyAgentImage
    const targetSize = generationTarget(input ?? emptyAgentImage, '', { ratio: message?.plan?.settings.imageRatio })
    if (node) coveredAssets.add(node.assetId)
    const parents = parentsFor(message)
    items.push({ id, ref: { type: 'generation', id: node?.assetId ?? id }, image, status, createdAt: message?.createdAt,
      x: items.length * 164, y: 0, w: Math.max(1, Math.round(Math.min(targetSize.width, 1100) * 150 / 1100)),
      targetSize, startedAt: message?.createdAt ?? session.createdAt, estimatedDurationMs: toolDurationMs(),
      generationPhase: 'generating', ...lifecycle,
      ...(status === 'failed' ? { errorMessage: publicAgentText(lifecycle.retryAllowed && (message?.generationStopped || message?.turnOutcome === 'stopped') ? '任务已停止，只能核实原结果。' : lifecycle.errorMessage ?? '结果未能交付，请联系管理员核对原任务；不会自动重复生成。'), retryAllowed: lifecycle.retryAllowed === true && !closed && !message?.generationStopped && message?.turnOutcome !== 'stopped' } : {}),
      ...(input && status === 'running' ? { placeholder: imageOf(input) } : {}),
      parentId: parents[0], parentIds: parents, toolRunId: runId,
    })
    byRun.set(runId, [...(byRun.get(runId) ?? []), { id: node?.assetId ?? id, itemId: id, status, generationPhase: items.at(-1)?.generationPhase, ...(node ? { image } : {}) }])
    slotSteps.set(runId, [...(slotSteps.get(runId) ?? []), { icon: 'image', label: slotLabel ?? `图片 ${(byRun.get(runId)?.length ?? 1)}`, itemId: id }])
  }

  for (const slot of session.photoSlots ?? []) {
    const runId = session.photoBatchSummaries?.find(batch => batch.batchId === slot.batchId)?.runId
      ?? events.find(event => event.slot?.batchId === slot.batchId)?.runId ?? orphanRunId
    slotRuns.add(runId)
    const node = slot.state === 'admitted' ? session.nodes.find(candidate => candidate.id === slot.imageRef.nodeId
      && candidate.assetId === slot.imageRef.assetId && candidate.taskId === slot.imageRef.taskId) : undefined
    const running = slot.state === 'generating' || slot.state === 'verifying'
      || slot.state === 'failed' && slot.reason.canManualReshoot === false && slot.automaticRetriesUsed < slot.automaticRetryLimit && !slot.batchStopped && ['provider_failed', 'provider_text_rejected', 'download_final_failure'].includes(slot.reason.code)
    add(runId, `agent-slot-${slot.batchId}-${slot.slotId}`, node ? 'done' : running ? 'running' : 'failed', node, {
      agentOrigin: { runId, taskId: slot.batchId, slotId: slot.slotId, slotIndex: slot.slotIndex, attemptNumber: slot.attemptNumber },
      ...(slot.state === 'failed' && slot.reason.canManualReshoot && !slot.batchStopped && ['provider_failed', 'provider_text_rejected', 'download_final_failure'].includes(slot.reason.code)
        ? { retryAllowed: true, agentRetry: { kind: 'phase1', runId, taskId: slot.batchId, slotId: slot.slotId, expectedAttemptNumber: slot.attemptNumber } } : {}),
      generationPhase: slot.state === 'verifying' ? 'processing' : slot.state === 'generating' && slot.queuePosition !== undefined ? 'queued' : 'generating',
      ...('reason' in slot ? { errorMessage: slot.reason.nextStep } : {}),
    })
    if ('reason' in slot) slotSteps.set(runId, [...(slotSteps.get(runId) ?? []), { icon: 'image', label: `第 ${slot.slotIndex} 张：${slot.reason.nextStep}` }])
  }

  for (const message of session.messages.filter(message => message.role === 'assistant')) {
    if (slotRuns.has(message.id) || message.retryOf) continue
    if (message.plan?.task && message.plan.outputSlots?.length) {
      for (const slot of message.plan.outputSlots) {
        const taskId = message.plan.task.taskId
        const node = slot.assetId ? session.nodes.find(node => node.taskId === taskId && node.assetId === slot.assetId) : undefined
        add(message.id, `agent-output-${message.id}-${message.plan.id}-${slot.slotIndex - 1}`, node ? 'done' : ['running', 'verifying', 'admitted'].includes(slot.state) ? 'running' : 'failed', node, {
          agentOrigin: { runId: message.id, taskId, slotId: slot.slotId, slotIndex: slot.slotIndex, attemptNumber: slot.attemptNumber },
          generationPhase: slot.state === 'verifying' || slot.state === 'admitted' && !node ? 'processing' : 'generating',
          ...(!node ? { errorMessage: slot.state === 'unknown' ? '结果无法核实，只能查询原任务。' : slot.retryable ? '本位生成明确失败，可按原冻结请求重试。' : '本位未能交付，请核实原任务。' } : {}),
          ...(slot.retryable ? { retryAllowed: true, agentRetry: { kind: 'image', runId: message.id, taskId, slotId: slot.slotId, expectedAttemptNumber: slot.attemptNumber } } : {}),
        })
      }
      continue
    }
    if (message.piRun) {
      for (const action of message.piRun.actions) {
        const nodes = action.taskId ? session.nodes.filter(node => node.taskId === action.taskId && !coveredAssets.has(node.assetId)) : []
        for (let index = 0; index < Math.max(action.expectedResultCount, nodes.length); index++) {
          const node = action.slotIds ? nodes.find(node => node.assetId === action.slotIds?.[index]) : nodes[index]
          add(message.id, `agent-output-${message.id}-${action.actionId}-${index}`, node ? 'done' : piActionNeedsRefresh(action) ? 'running' : 'failed', node, {
            generationPhase: ['submitting', 'pending'].includes(action.state) ? 'queued' : action.admission === 'pending' && isPiActionSettled(action.state) ? 'processing' : 'generating',
            progress: action.progress,
            ...(action.state === 'unknown' ? { errorMessage: '结果无法核实，请查询原任务，勿重复生成。' } : {}),
          }, `${action.label} · 第 ${index + 1} 张`)
        }
      }
    } else if (message.plan && (message.plan.task || ['verifying', 'pending', 'quarantined'].includes(message.plan.resultAdmission?.state ?? ''))) {
      const task = message.plan.task
      const nodes = task ? session.nodes.filter(node => node.taskId === task.taskId && !coveredAssets.has(node.assetId)) : []
      // Phase1 slots already describe this plan; do not add another placeholder.
      if ((byRun.get(message.id)?.length ?? 0) > 0 && !nodes.length) continue
      const failed = ['failed', 'cancelled'].includes(task?.status ?? '') || message.plan.resultAdmission?.state === 'quarantined'
      const running = !failed && (['pending', 'running'].includes(task?.status ?? '') || ['pending', 'verifying'].includes(message.plan.resultAdmission?.state ?? ''))
      for (let index = 0; index < Math.max(message.plan.preview?.estimatedResultCount ?? 1, nodes.length); index++) {
        add(message.id, `agent-output-${message.id}-${message.plan.id}-${index}`, nodes[index] ? 'done' : running ? 'running' : 'failed', nodes[index], {
          generationPhase: task?.status === 'pending' ? 'queued' : message.plan.resultAdmission?.state === 'verifying' || ['success', 'partial'].includes(task?.status ?? '') ? 'processing' : 'generating',
          progress: task?.progress, ...(failed ? { errorMessage: task?.status === 'cancelled' ? '任务已取消，未能交付图片。' : deliveryFailureReason(task?.message) } : {}),
        })
      }
    }
  }

  const restore = (attachments: AgentChatSubmission['attachments']) => attachments.flatMap(({ kind, id, label, image }) => {
    const node = session.nodes.find(candidate => candidate.assetId === image.id)
    return node ? [{ kind, id, label, image: imageOf(node) }] : []
  })
  const messageReferences = (submission?: AgentChatSubmission) => ({
    attachments: restore(submission?.attachments ?? []),
    ...(submission?.appliedReferences && { appliedReferences: restore(submission.appliedReferences) }),
  })
  const messages: ChatMessage[] = session.messages.map(message => {
    if (message.role === 'user') {
      const original = submissions.find(record => record.clientMessageId === message.id)
      return { id: message.id, role: 'user', ...(message.clarificationResponse ? { clarificationResponse: message.clarificationResponse } : {}), text: original?.followUp?.text ?? original?.confirmationMessageText ?? original?.retryMessageText ?? original?.text ?? message.content, createdAt: message.createdAt,
        ...(original ? { mode: original.mode, generation: original.generation } : {}),
        ...messageReferences(original) }
    }
    const steps: AssistantStep[] = []
    if (message.retryOf) {
      const original = items.find(item => item.agentOrigin?.taskId === message.retryOf!.taskId && item.agentOrigin?.slotId === message.retryOf!.slotId)
      if (original) steps.push({ icon: 'image', label: `原任务第 ${original.agentOrigin!.slotIndex} 张 · 第 ${message.retryOf.expectedAttemptNumber + 1} 次尝试`, itemId: original.id })
    }
    const results = byRun.get(message.id) ?? []
    const done = results.filter(result => result.status === 'done').length
    const running = results.some(result => result.status === 'running')
    const terminal = results.length > 0 && !running
    const allDone = terminal && done === results.length
    const latest = events.filter(event => event.runId === message.id && event.name !== 'turn.heartbeat').at(-1)
    const settled = receipts.some(receipt => receipt.state === 'settled' && receipt.runId === message.id)
    const traces = message.toolTrace ?? message.plan?.toolTrace ?? []
    if (message.piSkillsRead?.length) {
      steps.push({ icon: 'doc', label: '技能文件读取完成', status: 'done', collapsible: true, detail: `已加载技能：${message.piSkillsRead.join('、')}` })
    }
    if (!terminal) {
      if (latest && !message.turnOutcome && !settled) steps.push({ label: latest.phase === 'perception' ? '正在分析参考图' : '正在理解需求', icon: 'think', status: 'running' })
      for (const trace of traces) {
        // Submission diagnostics are superseded by current delivery facts.
        if (trace.target === 'gateway' || trace.toolName.endsWith('.create')) continue
        steps.push({ icon: 'think', label: toolPresentation(trace.toolName).label, status: trace.status === 'completed' ? 'done' : 'failed', collapsible: true,
          detail: trace.status === 'completed' ? '已完成这一步检查。' : '这一步未能完成，请检查参考图或补充需求。' })
      }
    }
    const analysis = message.referenceAnalysis ?? events.findLast(event => event.runId === message.id && event.name === 'perception.completed' && event.summary.startsWith('商品锁定：'))?.summary
    if (analysis) steps.push({ icon: 'image', label: '已分析参考图', status: 'done', collapsible: true, detail: publicAgentText(analysis) })
    if (message.runtime === 'pi-agent-v1' && !running && !terminal && !message.failure && (settled || Boolean(message.piImagePlan) || Boolean(message.turnOutcome))
      && !steps.some(step => step.icon === 'think' && !step.itemId)) {
      steps.push({ icon: 'think', label: '思考完成', status: 'done' })
    }
    if (running) steps.push({ icon: 'image', label: items.some(item => item.toolRunId === message.id && item.status === 'running' && item.generationPhase === 'processing')
      ? '正在核实图片结果，不会重复生成' : `正在生成 ${results.length} 张图${items.some(item => item.toolRunId === message.id && item.generationPhase === 'queued') ? ' · 排队中' : ''}`, status: 'running' })
    steps.push(...(slotSteps.get(message.id) ?? []))
    if (terminal) steps.push({ icon: 'think', label: allDone ? '已完成' : done ? `已交付 ${done} 张，${results.length - done} 张未能交付` : '图片未能交付', status: allDone ? 'done' : 'failed' })
    else if (message.turnOutcome && !running && !message.piImagePlan && !steps.some(step => step.icon === 'think' && step.status === 'done')) {
      steps.push({ icon: 'think', label: outcomeLabels[message.turnOutcome] })
    }
    const plan = message.piImagePlan
    const references = plan?.referenceNodeIds.flatMap(nodeId => {
      const node = session.nodes.find(value => value.id === nodeId)
      const binding = plan.specialist?.bindings.find(item => item.nodeId === nodeId)
      if (binding && binding.assetId !== node?.assetId) return []
      return node ? [{ assetId: node.assetId, label: node.name.slice(0, 300), ...(binding ? { role: binding.role, roleLabel: binding.label } : {}), image: { id: node.assetId, url: node.url, width: node.width, height: node.height } }] : []
    }) ?? []
    const imagePlan = plan ? { runId: message.id, revision: plan.revision, status: plan.status, title: plan.title, prompt: plan.prompt,
      ...(plan.specialist ? { specialist: { toolId: plan.specialist.toolId, options: plan.specialist.options, roles: plan.specialist.roles, parametersLabel: plan.specialist.parametersLabel } } : {}),
      generation: plan.specialist?.generation ?? { modelId: plan.settings.model, ratio: plan.settings.imageRatio, resolution: plan.settings.resolution, count: plan.settings.resultCount ?? 1 },
      references, unavailableReferenceCount: plan.referenceNodeIds.length - references.length } : undefined
    const questions = message.clarification ? [] : message.questions?.filter(question => !message.content.includes(question)) ?? []
    const index = session.messages.findIndex(candidate => candidate.id === message.id)
    const request = submissions.find(record => record.clientMessageId === session.messages[index - 1]?.id)
    const delivered = results.flatMap(result => result.status === 'done' && result.image ? [result.image] : [])
    const specs = [...new Set(delivered.map(image => `${imageRatio(image)} · ${imageDimensions(image)} 像素`))]
    const requested = request?.text || session.messages[index - 1]?.content
    const deliveryMeta = delivered.length ? {
      spec: specs.join('；'),
      highlights: [requested ? `本版按此要求生成：${publicAgentText(requested).slice(0, 300)}` : '按本轮确认的方案生成。',
        ...(message.referenceAnalysis ? ['提示词已加入商品锁定描述，保留未要求修改的款式、面料质感、图案位置和颜色。'] : [])],
      risks: ['请对照原图确认版型比例、面料纹理、图案和文字细节；生成完成不代表已通过人工视觉验收。'],
      suggestions: ['背景更简洁，保持商品不变', '调整光线与阴影，保持颜色准确', '调整构图与留白，保持商品比例'],
    } : {}
    const failures = [...new Set(items.filter(item => item.toolRunId === message.id && item.status === 'failed').map(item => item.errorMessage).filter(Boolean))]
    const retryItem = message.retryOf ? items.find(item => item.agentOrigin?.taskId === message.retryOf!.taskId && item.agentOrigin?.slotId === message.retryOf!.slotId) : undefined
    const retryAttempt = message.retryOf ? message.retryOf.expectedAttemptNumber + 1 : undefined
    const retryContent = retryItem?.agentOrigin && retryAttempt && retryItem.agentOrigin.attemptNumber === retryAttempt
      ? retryItem.status === 'done' ? `原任务第 ${retryItem.agentOrigin.slotIndex} 张已通过重试交付（第 ${retryAttempt} 次尝试）。`
        : retryItem.status === 'failed' ? `原任务第 ${retryItem.agentOrigin.slotIndex} 张本次重试未能交付（第 ${retryAttempt} 次尝试），请核实原任务。` : undefined
      : retryItem?.agentOrigin && retryAttempt && retryItem.agentOrigin.attemptNumber > retryAttempt
        ? `本次重试为第 ${retryAttempt} 次尝试，原位已有后续尝试；请查看原任务。` : undefined
    const content = retryContent ?? (allDone ? `已提交的图片现已核实并交付。\n规格：${specs.join('；')}`
      : terminal ? [done ? `已交付 ${done} 张，另有 ${results.length - done} 张未能交付。` : '本次图片未能交付。', ...(specs.length ? [`已交付规格：${specs.join('；')}`] : []), ...failures, options.billingNotice].filter(Boolean).join('\n')
      : running ? '正在处理已提交的图片，请稍候；不会重复生成。' : settled && !message.turnOutcome && /^正在(?:创作|理解需求|处理)[.。…]*$/.test(message.content)
        ? '本轮已结束，尚无可展示的回复。' : publicAgentText(message.content))
    const failure = allDone && message.failure?.category === 'acceptance_unknown' ? undefined : message.failure
    return { id: message.id, role: 'assistant', ...(failure && { failure }), ...(message.retryable && !results.length ? { retryable: true } : {}), body: [content,
        ...questions.map(publicAgentText)].filter(Boolean).join('\n\n'),
      createdAt: message.createdAt, steps, results, ...(message.runtime === 'pi-agent-v1' ? { canInspectRun: true } : {}), ...(imagePlan ? { imagePlan } : {}),
      meta: { ...deliveryMeta, modelName: message.plan?.preview?.resolvedModelId ?? message.plan?.settings.model,
        outputCount: results.length || undefined,
        ...(request?.referencePlan ? { referencePlan: request.referencePlan } : {}),
        ...(request?.droppedReferenceIds?.length ? { droppedReferenceIds: request.droppedReferenceIds } : {}) } }

  })
  for (const message of session.messages) if (message.clarification) {
    const question = message.clarification
    const index = messages.findIndex(value => value.id === message.id)
    messages.splice(index + 1, 0, { id: `ask-${question.runId}`, role: 'ask', createdAt: message.createdAt,
      clarification: question, question: question.questions[0].spec.question, options: [],
      ...(question.state === 'answered' ? { answered: { selectedKey: 'structured', answerText: '已提交结构化答复' } } : {}),
      ...(question.state === 'abandoned' || question.state === 'expired' ? { skipped: true } : {}),
      ...(!question.runtimeSupported ? { reason: '此运行时暂不支持结构化续答，请跳过后发送新的完整需求。' } : {}),
    })
  }
  if (byRun.has(orphanRunId)) messages.push({ id: orphanRunId, role: 'assistant', createdAt: session.createdAt,
    steps: slotSteps.get(orphanRunId) ?? [], results: byRun.get(orphanRunId) ?? [] })
  for (const submission of submissions) {
    if (!messages.some(message => message.id === submission.clientMessageId)) {
      messages.push({ id: submission.clientMessageId, role: 'user', text: submission.followUp?.text ?? submission.confirmationMessageText ?? submission.retryMessageText ?? submission.text, mode: submission.mode, generation: submission.generation, ...messageReferences(submission), createdAt: submission.createdAt })
      if (submission.followUp?.reply) messages.push({ role: 'assistant', id: `followup-${submission.clientMessageId}`, createdAt: submission.createdAt,
        body: submission.followUp.reply, steps: [], results: [] })
      if (submission.error) messages.push(chatFailure(`agent-error-${submission.clientMessageId}`, submission.error, submission.createdAt, submission.failure))
    }
  }
  if (submissions.some(record => record.followUp?.reply)) messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const accepted = receipts.findLast(receipt => receipt.state === 'accepted'
    && (!byRun.has(receipt.runId) || byRun.get(receipt.runId)?.some(result => result.status === 'running')))
  const activeRunId = accepted && accepted.state !== 'not_found' ? accepted.runId : undefined
  const latest = session.messages.findLast(message => message.role === 'assistant')
  const receipt = receipts.findLast(value => value.state !== 'not_found' && value.runId === latest?.id) ?? receipts.at(-1)
  const pending = items.filter(item => item.status === 'running')
  const done = items.filter(item => item.status === 'done').length
  const lifecycle: AgentChatLifecycle = {
    receipt: receipt?.state ?? 'none',
    turn: latest?.generationStopped ? 'stopped' : latest?.clarification?.state === 'abandoned' || latest?.clarification?.state === 'expired' ? 'idle' : latest?.interrupted ? 'interrupted' : activeRunId ? 'running'
      : latest?.piImagePlan && latest.piImagePlan.status !== 'draft' ? 'completed'
        : latest?.turnOutcome === 'blocked' ? 'waiting_input' : latest?.turnOutcome ?? 'idle',
    delivery: pending.length ? pending.some(item => item.generationPhase === 'processing') ? 'verifying' : 'delivery_pending'
      : !items.length ? 'none' : done === items.length ? 'delivered' : done ? 'partial' : 'withheld',
  }
  return { sessionId: session.id, messages, items: placeResults(canvas, items), receipts, lifecycle,
    active: Boolean(activeRunId) || items.some(item => item.status === 'running'),
    ...(activeRunId ? { activeRunId } : {}), }
}

/** Replay-safe mapping: IDs remain fixed from placeholder through completion. */
export function agentSnapshotEvents(previous: AgentChatSnapshot | undefined, next: AgentChatSnapshot): AgentEvent[] {
  const events: AgentEvent[] = []
  for (const message of next.messages) {
    const before = previous?.messages.find(candidate => candidate.id === message.id)
    const clearedFailure = before?.role === 'assistant' && before.failure && message.role === 'assistant' && !message.failure
    if (!before || clearedFailure || before.role !== 'assistant' && JSON.stringify(before) !== JSON.stringify(message)) events.push({ type: 'message', message })
    else if (message.role === 'assistant' && JSON.stringify(before) !== JSON.stringify(message)) events.push({ type: 'message-update', id: message.id, patch: message })
  }
  for (const message of previous?.messages ?? []) if (message.role === 'assistant' && !next.messages.some(candidate => candidate.id === message.id)) {
    events.push({ type: 'message-update', id: message.id, patch: { results: [], steps: [], body: '结果状态已更新。' } })
  }
  for (const item of next.items) {
    const before = previous?.items.find(candidate => candidate.id === item.id)
    if (!before) events.push({ type: 'item-add', item })
    else if (JSON.stringify(before) !== JSON.stringify(item)) {
      // Snapshot coordinates are defaults, never overwrite a user's layout on refresh.
      events.push({ type: 'item-update', id: item.id, patch: { image: item.image, ref: item.ref, status: item.status, placeholder: item.placeholder,
        parentId: item.parentId, parentIds: item.parentIds, toolRunId: item.toolRunId, createdAt: item.createdAt,
        targetSize: item.targetSize, generationPhase: item.generationPhase, progress: item.progress,
        estimatedDurationMs: item.estimatedDurationMs, startedAt: item.startedAt, errorMessage: item.errorMessage, retryAllowed: item.retryAllowed, agentRetry: item.agentRetry, agentOrigin: item.agentOrigin,
        ...(item.mediaType ? { mediaType: item.mediaType } : {}), ...(item.video ? { video: item.video } : {}) } })
    }
  }
  for (const item of previous?.items ?? []) if (!next.items.some(candidate => candidate.id === item.id)) {
    events.push({ type: 'item-update', id: item.id, patch: { status: 'failed', image: emptyAgentImage, placeholder: undefined } })
  }
  if (previous?.active && !next.active) events.push({ type: 'done' })
  return events
}

import { z } from 'zod'

const id = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/)
export const clarificationQuestionSpecSchema = z.object({
  field: id,
  question: z.string().trim().min(1).max(1000),
  selection: z.enum(['single', 'multiple', 'text']),
  options: z.array(z.object({ id, label: z.string().trim().min(1).max(200) }).strict()).max(4),
  allowCustom: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.options.map(option => option.id)).size !== value.options.length
    || value.selection === 'text' && value.options.length > 0
    || value.selection !== 'text' && value.options.length < 2
    || value.selection === 'text' && !value.allowCustom) ctx.addIssue({ code: 'custom', message: '问题选项无效' })
})
export type ClarificationQuestionSpec = z.infer<typeof clarificationQuestionSpecSchema>
export const clarificationQuestionSchema = z.object({
  questionId: id, spec: clarificationQuestionSpecSchema,
}).strict()
export const clarificationAnswerSchema = z.object({
  questionId: id, selectedOptionIds: z.array(id).max(4), customText: z.string().trim().max(2000),
}).strict()
export type ClarificationAnswer = z.infer<typeof clarificationAnswerSchema>
const target = { runId: id, revision: z.number().int().positive() }
export const clarificationResponseSchema = z.object({ ...target, answers: z.array(clarificationAnswerSchema).min(1).max(8) }).strict()
export type ClarificationResponse = z.infer<typeof clarificationResponseSchema>
export const clarificationCommandSchema = z.discriminatedUnion('action', [
  clarificationResponseSchema.extend({ action: z.literal('answer') }),
  z.object({ ...target, action: z.literal('abandon') }).strict(),
])
export type ClarificationCommand = z.infer<typeof clarificationCommandSchema>
export const clarificationSchema = z.object({
  ...target, state: z.enum(['pending', 'answered', 'abandoned', 'expired']),
  questions: z.array(clarificationQuestionSchema).min(1).max(8),
  referenceNodeIds: z.array(id).max(10),
  runtimeSupported: z.boolean(),
  response: clarificationResponseSchema.optional(),
  continuationMessageId: id.optional(),
}).strict()
export type Clarification = z.infer<typeof clarificationSchema>
export const clarificationContextSchema = z.object({
  ...target, referenceNodeIds: z.array(id).max(10),
  answers: z.array(z.object({ questionId: id, field: id, question: z.string(), selectedOptions: z.array(z.object({ id, label: z.string() })), customText: z.string() }).strict()).max(8),
}).strict()
export type ClarificationContext = z.infer<typeof clarificationContextSchema>

/** IDs/revisions belong to the server. Legacy text questions get text inputs, never invented choices. */
export function createClarification(runId: string, referenceNodeIds: string[], specs: ClarificationQuestionSpec[], texts: string[], runtimeSupported = true): Clarification | undefined {
  const questions = specs.length ? specs : texts.slice(0, 8).map((question, index): ClarificationQuestionSpec => ({
    field: `missing_${index + 1}`, question, selection: 'text', options: [], allowCustom: true,
  }))
  if (!questions.length) return undefined
  return clarificationSchema.parse({ runId, revision: 1, state: 'pending', referenceNodeIds, runtimeSupported,
    questions: questions.map((spec, index) => ({ questionId: `${runId}_q${index + 1}`, spec })) })
}

export function resolveClarificationAnswers(question: Clarification, response: ClarificationResponse): ClarificationContext {
  if (question.runId !== response.runId || question.revision !== response.revision) throw new Error('问题版本已过期')
  if (response.answers.length !== question.questions.length || new Set(response.answers.map(answer => answer.questionId)).size !== response.answers.length) throw new Error('请回答所有问题')
  const answers = question.questions.map(({ questionId, spec }) => {
    const answer = response.answers.find(value => value.questionId === questionId)
    if (!answer || new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length
      || answer.selectedOptionIds.some(id => !spec.options.some(option => option.id === id))
      || !spec.allowCustom && answer.customText || spec.selection === 'text' && answer.selectedOptionIds.length
      || spec.selection === 'single' && answer.selectedOptionIds.length + Number(Boolean(answer.customText)) !== 1
      || !answer.selectedOptionIds.length && !answer.customText) throw new Error('答案不符合原问题选项')
    return { questionId, field: spec.field, question: spec.question,
      selectedOptions: spec.options.filter(option => answer.selectedOptionIds.includes(option.id)), customText: answer.customText }
  })
  return { runId: question.runId, revision: question.revision, referenceNodeIds: [...question.referenceNodeIds], answers }
}

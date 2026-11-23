/** User-facing boundary for old persisted diagnostics and current progress. */
export function publicAgentText(value: string): string {
  return value
    .replace(/Outputting\.{0,3}/gi, '正在处理')
    .replace(/(?:正在调用)?第三方生图\s*API/gi, '正在生成图片')
    .replace(/\b[a-z][a-z_]*\.(?:create|prepare|inspect|get_status|retry_shots|cancel)\b/gi, '图片处理')
    .replace(/\baction_verification_required\b/gi, '结果待核实')
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/gi, '处理状态待核对')
}

/** Explain known failure classes without echoing provider errors or credentials. */
export function deliveryFailureReason(message = ''): string {
  if (/额度|余额|quota|402/i.test(message)) return '生成服务额度不足，图片未能交付。请联系管理员补足额度后再发起新任务。'
  if (/鉴权|凭据|unauthori[sz]ed|401|403/i.test(message)) return '生成服务暂时无法使用，图片未能交付。请联系管理员检查服务配置。'
  if (/违规|内容.*拒绝|violation|moderation/i.test(message)) return '图片内容未能通过处理。请调整参考图或描述后再发起新任务。'
  if (/超时|timeout|中断|connection/i.test(message)) return '等待结果时连接中断或超时，图片未能交付。请联系管理员核对原任务；不会自动重新生成。'
  if (/下载|download/i.test(message)) return '生成图片未能保存。请联系管理员核对原任务和存储状态；不会自动重新生成。'
  return '图片未能交付，请联系管理员核对原任务；不会自动重复生成。'
}

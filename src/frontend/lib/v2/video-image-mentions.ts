// Seedance numbers the images in the order in which they appear in the request.
export function videoImageMentions(text: string) {
  const digits = '零一二三四五六七八九'
  const pattern = /(?:[@＠]参考图|[@＠]?图片|(?<!构|插|意|原|配|截|制|绘)[@＠]?图)[ \t]*([0-9]+|[零一二三四五六七八九十两]+)(?![致律般直])/gu
  return Array.from(text.matchAll(pattern), match => {
    const value = match[1].replaceAll('两', '二')
    const [tens, ones] = value.split('十')
    const number = /^\d+$/.test(value) ? Number(value)
      : ones === undefined ? digits.indexOf(value)
      : (tens ? digits.indexOf(tens) : 1) * 10 + (ones ? digits.indexOf(ones) : 0)
    return { start: match.index, end: match.index + match[0].length, number }
  })
}

export function seedancePrompt(text: string, imageCount: number) {
  let prompt = ''
  let offset = 0
  for (const mention of videoImageMentions(text)) {
    if (mention.number < 1 || mention.number > imageCount) {
      return { error: `“${text.slice(mention.start, mention.end)}”没有对应的参考图，当前有 ${imageCount} 张`, prompt: text }
    }
    prompt += text.slice(offset, mention.start) + '@图片' + mention.number
    offset = mention.end
  }
  return { prompt: prompt + text.slice(offset) }
}

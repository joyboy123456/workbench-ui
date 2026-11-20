import assert from 'node:assert/strict'
import test from 'node:test'
import { generationMetadata, generationSpecSummary, imageDimensions, imageRatio } from './image-metadata'
import type { AssistantMessage } from './types'

test('source pixels are retained while rounded output ratios become common readable ratios', () => {
  assert.equal(imageDimensions({ width: 1536, height: 2048 }), '1536 × 2048')
  for (const [width, height, expected] of [[1536, 2048, '3:4'], [1100, 1467, '3:4'], [1920, 1080, '16:9'], [1000, 1000, '1:1'], [1500, 1000, '3:2'], [700, 500, '7:5']] as const) {
    assert.equal(imageRatio({ width, height }), expected)
  }
  assert.match(imageRatio({ width: 1100, height: 1473 }), /3:4/)
  assert.equal(imageRatio({ width: 0, height: 100 }), '未记录')
  assert.equal(imageRatio({ width: NaN, height: 100 }), '未记录')
  assert.equal(imageRatio({ width: 100, height: Infinity }), '未记录')
})
test('metadata uses recorded model/count and falls back to the matching reply without inventing defaults', () => {
  const message: AssistantMessage = { id: 'reply', role: 'assistant', createdAt: '', steps: [], results: [{ id: 'a', status: 'done' }, { id: 'b', status: 'done' }], meta: { spec: '3:4 · 1100×1467 · Nano Banana 2 · 2K' } }
  assert.deepEqual(generationMetadata(undefined, message), { modelName: 'Nano Banana 2', outputCount: 2 })
  assert.deepEqual(generationMetadata({ modelName: '实际模型', outputCount: 4 }, message), { modelName: '实际模型', outputCount: 4 })
  assert.deepEqual(generationMetadata({ params: { model: 'nano-banana-2', n: '3' } }), { modelName: 'Nano Banana 2', outputCount: 3 })
  assert.deepEqual(generationMetadata(), { modelName: undefined, outputCount: undefined })
  assert.equal(generationSpecSummary(message.meta?.spec), 'Nano Banana 2 · 2K')
})

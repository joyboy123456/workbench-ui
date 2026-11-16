import assert from 'node:assert/strict'
import test from 'node:test'
import { composerOptions, normalizeGeneration } from './composer-options'

test('model catalogue filters availability, follows registry resolution caps and contains no provider data', () => {
  const options = composerOptions(['nano-banana-2-lite'], 1)
  assert.equal(options.models.length, 1)
  assert.deepEqual(options.models[0].resolutions, ['1k'])
  assert.equal(options.directMaxCount, 1)
  assert.deepEqual(composerOptions([], 1).models, [])
  assert.equal(JSON.stringify(options).includes('apiKey'), false)
})
test('stale preferences resolve to a current model and supported resolution/count', () => {
  const result = normalizeGeneration({ modelId: 'removed', ratio: 'bad', resolution: '4k', count: 50 }, composerOptions(['nano-banana-2-lite']))
  assert.deepEqual(result, { modelId: 'nano-banana-2-lite', ratio: '3:4', resolution: '1k', count: 4 })
})

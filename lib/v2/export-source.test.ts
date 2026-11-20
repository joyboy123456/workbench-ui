import assert from 'node:assert/strict'
import test from 'node:test'
import { exportImageUrl } from './export-source'

test('exports use owned media bytes for CDN, old local URLs and versioned media', () => {
  const image = { id: 'result_task_1', url: 'https://data.wujiebantu.com/result.png', width: 20, height: 20 }
  assert.equal(exportImageUrl(image), '/api/media/assets/result_task_1/original?proxy=1')
  assert.equal(exportImageUrl({ ...image, url: '/local-assets/results/u/result.png' }), exportImageUrl(image))
  assert.equal(exportImageUrl({ ...image, url: '/api/media/assets/result_task_1/original?v=abc&project=p' }), '/api/media/assets/result_task_1/original?v=abc&project=p&proxy=1')
  assert.equal(exportImageUrl({ ...image, id: 'OWN0008', url: '/api/presets/models/OWN0008/image' }), '/api/presets/models/OWN0008/image')
})

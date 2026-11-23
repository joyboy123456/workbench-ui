import assert from 'node:assert/strict'
import test from 'node:test'

import { toAssetReferenceChoices } from './asset-choices'

test('参考图选择器汇总商品多角度图、模特和素材', () => {
  const image = (id: string) => ({ id, url: `/${id}.png`, width: 100, height: 120 })
  const choices = toAssetReferenceChoices(
    [{
      id: 'product-1', name: '连衣裙', categoryId: 'cat-1', images: [image('front'), image('back')],
      generatedCount: 0, projectIds: [], createdAt: '2026-11-17T00:00:00.000Z', updatedAt: '2026-11-17T00:00:00.000Z',
    }],
    [{ id: 'model-1', name: '模特 A', cover: image('model'), tags: [], source: 'custom' }],
    [{ id: 'material-1', name: '书房', image: image('room'), origin: 'upload', createdAt: '2026-11-17T00:00:00.000Z' }],
  )

  assert.deepEqual(choices.map(({ id, label, group, image: choiceImage }) => ({ id, label, group, imageId: choiceImage.id })), [
    { id: 'product:product-1:front', label: '连衣裙 · 图 1', group: '商品', imageId: 'front' },
    { id: 'product:product-1:back', label: '连衣裙 · 图 2', group: '商品', imageId: 'back' },
    { id: 'model:model-1', label: '模特 A', group: '模特', imageId: 'model' },
    { id: 'material:material-1', label: '书房', group: '素材', imageId: 'room' },
  ])
})

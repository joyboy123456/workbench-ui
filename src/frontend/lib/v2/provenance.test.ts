import assert from 'node:assert/strict'
import test from 'node:test'
import { ancestorLayers, parentIds, provenanceLinks, referenceParents, visibleProvenanceLinks } from './provenance'
import type { CanvasItem } from './types'
const card = (id: string, parents?: string[]): CanvasItem => ({ id, parentIds: parents, image: { id: `asset-${id}`, url: '/image.png', width: 20, height: 30 }, ref: { type: 'material', id }, x: 0, y: 0, w: 20 })

test('legacy sources fall back, explicit empty stays empty, duplicates/self edges are removed', () => {
  assert.deepEqual(parentIds({ id: 'b', parentId: 'a' }), ['a'])
  assert.deepEqual(parentIds({ id: 'b', parentId: 'a', parentIds: [] }), [])
  assert.deepEqual(parentIds({ id: 'b', parentIds: ['a', 'a', 'b'] }), ['a'])
})

test('ancestors walk all branches in layers and terminate on cycles or missing sources', () => {
  const items = [card('root', ['result']), card('a', ['root']), card('b', ['root']), card('result', ['a', 'b', 'a', 'missing'])]
  assert.deepEqual(ancestorLayers(items, 'result'), [['a', 'b'], ['root']])
  assert.equal(provenanceLinks(items).length, 5)
  assert.deepEqual(ancestorLayers(items, 'deleted'), [])
})

test('reference images resolve to local canvas IDs, never invented asset nodes', () => {
  const items = [card('source'), card('ref')]
  assert.deepEqual(referenceParents(items, ['source'], { ref: items[1].image, detail: items[1].image, prompt: 'words', external: { id: 'elsewhere', url: '/ext.png', width: 10, height: 10 } }), ['source', 'ref'])
})

test('new results automatically connect while all connections is on, even during a source trace', () => {
  const items = [card('source'), card('old', ['source']), card('new', ['source'])]
  const trace = new Set(['source', 'old'])
  assert.equal(visibleProvenanceLinks(items.slice(0, 2), true, trace).length, 1)
  assert.deepEqual(visibleProvenanceLinks(items, true, trace).map(link => link.target), ['old', 'new'])
  assert.deepEqual(visibleProvenanceLinks(items, false, trace).map(link => link.target), ['old'])
  assert.deepEqual(visibleProvenanceLinks(items, false), [])
})

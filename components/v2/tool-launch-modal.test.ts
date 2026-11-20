import test from 'node:test'
import assert from 'node:assert/strict'
import { buildToolFormSlots } from './tool-launch-modal'

test('buildToolFormSlots parses required/optional slots and selects reference slot as template target', () => {
  const slots = buildToolFormSlots({
    id: '80231',
    inputs: ['商品图', '版式参考图', '同款商品细节图 1（可选）', '同款商品细节图 2（可选）'],
  })
  assert.equal(slots.length, 4)
  assert.equal(slots[0].label, '商品图')
  assert.equal(slots[0].required, true)
  assert.equal(slots[0].isTemplateTarget, false)
  assert.equal(slots[1].label, '版式参考图')
  assert.equal(slots[1].required, true)
  assert.equal(slots[1].isTemplateTarget, true)
  assert.equal(slots[2].required, false)
  assert.equal(slots[3].required, false)
})

test('buildToolFormSlots provides commercial defaults when tool.inputs is empty', () => {
  const slots = buildToolFormSlots({ id: '701', inputs: [] })
  assert.equal(slots.length, 2)
  assert.equal(slots[0].label, '商品图')
  assert.equal(slots[0].required, true)
  assert.equal(slots[1].required, false)
  assert.equal(slots[1].isTemplateTarget, true)
})

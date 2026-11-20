import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_CATALOG } from '@/lib/v2/mock'
import { buildToolFormSlots, getToolFormConfig, TOOL_FORM_CONFIGS } from './tool-launch-modal'

test('every tool in TOOL_CATALOG has an explicit form config and at least one required upload slot', () => {
  for (const tool of TOOL_CATALOG) {
    assert.ok(TOOL_FORM_CONFIGS[tool.id], `missing TOOL_FORM_CONFIGS entry for ${tool.id} (${tool.name})`)
    const slots = buildToolFormSlots(tool)
    assert.ok(slots.length >= 1, `tool ${tool.id} must have >=1 upload slot`)
    assert.ok(slots.some(s => s.required), `tool ${tool.id} must have >=1 required upload slot`)
  }
})

test('80231 仿详情图 targets 版式参考图 as template slot and exposes productCategory + sellingPoints', () => {
  const slots = buildToolFormSlots({ id: '80231', inputs: [] })
  assert.equal(slots[0].label, '商品图')
  assert.equal(slots[1].label, '版式参考图')
  assert.equal(slots[1].isTemplateTarget, true)
  const cfg = getToolFormConfig('80231')
  assert.deepEqual(cfg.extraFields?.map(f => f.key), ['productCategory', 'sellingPoints'])
})

test('text-output tools (80263 / 80264) and required-field tools (80215 / 80240) are configured accurately', () => {
  assert.equal(getToolFormConfig('80263').isTextOutput, true)
  assert.equal(getToolFormConfig('80264').isTextOutput, true)
  assert.equal(getToolFormConfig('80215').extraFields?.[0].required, true)
  assert.equal(getToolFormConfig('80240').extraFields?.[0].required, true)
  assert.equal(getToolFormConfig('80242').fixedResolution, '4K')
  assert.equal(getToolFormConfig('80232').defaultRatio, '2:3')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockDataSource } from './mock'

test('mock 数据源同步实现固定提示词、素材分类和回收站', async () => {
  const ds = createMockDataSource()
  const preset = await ds.createPromptPreset({ name: '详情页', content: '生成三屏详情页' })
  assert.equal((await ds.updatePromptPreset(preset.id, { name: '六屏详情', content: '生成六屏详情页' })).name, '六屏详情')
  await ds.deletePromptPreset(preset.id)
  assert.ok((await ds.optimizePrompt('连衣裙')).prompt.includes('商品主体'))

  const category = await ds.createMaterialCategory('临时分类')
  await ds.renameMaterialCategory(category.id, '更新分类')
  const material = (await ds.listMaterials())[0]!
  await ds.moveMaterial(material.id, category.id)
  assert.equal((await ds.listMaterials({ categoryId: category.id }))[0]?.id, material.id)
  await ds.deleteMaterial(material.id)
  assert.equal((await ds.listMaterials({ trash: true }))[0]?.id, material.id)
  await ds.restoreMaterial(material.id)
  await ds.deleteMaterialCategory(category.id)
  assert.equal((await ds.listMaterials({ uncategorized: true })).some(item => item.id === material.id), true)
})

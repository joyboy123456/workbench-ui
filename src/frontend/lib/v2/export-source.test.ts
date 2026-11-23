import assert from 'node:assert/strict'
import test from 'node:test'
import { exportImageUrl } from './export-source'

test('素材导出直接读取静态演示文件或浏览器上传对象', () => {
  const image = { id: 'result_demo', url: '/v2-mock/c1.jpg', width: 20, height: 20 }
  const uploadUrl = 'blob:http://localhost/a-preview'
  assert.equal(exportImageUrl(image), image.url)
  assert.equal(exportImageUrl({ ...image, url: uploadUrl }), uploadUrl)
})

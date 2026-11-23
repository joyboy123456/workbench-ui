import assert from 'node:assert/strict'
import test from 'node:test'
import { computeOutputRect, fileName, safeName } from './export-plan'

test('原图保留尺寸，2K/1K 按横图、竖图、方图长边等比缩小', () => {
  assert.deepEqual(computeOutputRect({ width: 3000, height: 1500 }, 'original'), { canvasW: 3000, canvasH: 1500 })
  for (const [size, edge] of [['2k', 2048], ['1k', 1024]] as const) {
    assert.deepEqual(computeOutputRect({ width: 4096, height: 2048 }, size), { canvasW: edge, canvasH: edge / 2 })
    assert.deepEqual(computeOutputRect({ width: 2048, height: 4096 }, size), { canvasW: edge / 2, canvasH: edge })
    assert.deepEqual(computeOutputRect({ width: 4096, height: 4096 }, size), { canvasW: edge, canvasH: edge })
    assert.deepEqual(computeOutputRect({ width: 600, height: 300 }, size), { canvasW: 600, canvasH: 300 })
  }
  assert.deepEqual(computeOutputRect({ width: 3000, height: 1000 }, '2k'), { canvasW: 2048, canvasH: 683 })
  assert.deepEqual(computeOutputRect({ width: 1, height: 20000 }, '1k'), { canvasW: 1, canvasH: 1024 })
})

test('非法原图尺寸与巨量画布在绘制前拒绝，大图可以缩小导出', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => computeOutputRect({ width: value, height: 100 }, 'original'), /整数像素/)
    assert.throws(() => computeOutputRect({ width: 100, height: value }, '2k'), /整数像素/)
  }
  assert.throws(() => computeOutputRect({ width: 20000, height: 1 }, 'original'), /尺寸过大/)
  assert.throws(() => computeOutputRect({ width: 6000, height: 6000 }, 'original'), /尺寸过大/)
  assert.deepEqual(computeOutputRect({ width: 6000, height: 6000 }, '2k'), { canvasW: 2048, canvasH: 2048 })
})

test('自动项目名加序号，保留清洗函数的非法字符、保留名与长中文保护', () => {
  assert.equal(fileName('夏季/新品:衬衫', 1), '夏季_新品_衬衫_001')
  assert.equal(fileName('春'.repeat(300), 100), `${'春'.repeat(32)}_100`)
  assert.equal(safeName('  <>:"/\\|?*\n. '), '__________')
  assert.equal(safeName('..'), '图片')
  assert.equal(safeName('CON'), '_CON')
  assert.equal(safeName('春'.repeat(300)).length, 53)
  assert.throws(() => fileName('项目', 0), /整数像素/)
})

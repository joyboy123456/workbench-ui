import assert from 'node:assert/strict'
import test from 'node:test'
import { createAndOpenProject, singleFlight } from './entry-actions'

test('rapid creation clicks await auth/create once and enter the new canvas', async () => {
  let finish!: (project: { id: string }) => void
  const pending = new Promise<{ id: string }>(resolve => { finish = resolve })
  let creates = 0
  const routes: string[] = []
  const lock = singleFlight()
  const click = () => lock(() => createAndOpenProject(() => { creates++; return pending }, href => { routes.push(href) }))
  const first = click()
  await click()
  assert.equal(creates, 1)
  assert.deepEqual(routes, [])
  finish({ id: 'new-project' })
  await first
  assert.deepEqual(routes, ['/v2/canvas/new-project?view=split'])
})

test('tool entry opens the requested tool without waiting for file selection or generation', async () => {
  const routes: string[] = []
  await createAndOpenProject(async () => ({ id: 'tool-project' }), href => { routes.push(href) }, '23')
  assert.deepEqual(routes, ['/v2/canvas/tool-project?view=split&tool=23'])
})

test('failed creation propagates for UI feedback and releases the submission lock', async () => {
  const lock = singleFlight()
  await assert.rejects(lock(() => createAndOpenProject(async () => { throw new Error('创建失败') }, () => assert.fail('must not navigate'))), /创建失败/)
  let retried = false
  await lock(async () => { retried = true })
  assert.equal(retried, true)
  await assert.rejects(createAndOpenProject(async () => ({ id: '' }), () => assert.fail()), /响应无效/)
})

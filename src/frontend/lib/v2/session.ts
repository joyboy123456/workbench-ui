export interface V2SessionUser {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}

export interface V2LoginInput { username: string; password: string }
export interface V2RegisterInput extends V2LoginInput { inviteCode: string; displayName?: string }

export interface V2SessionSource {
  getSession(signal?: AbortSignal): Promise<V2SessionUser | null>
  logout(): Promise<void>
  login(input: V2LoginInput): Promise<V2SessionUser>
  register(input: V2RegisterInput): Promise<V2SessionUser>
  enterDemo?(): Promise<V2SessionUser>
}

/** Bound the whole read, including implementations that ignore cancellation. */
export async function confirmV2Session(source: Pick<V2SessionSource, 'getSession'>, signal: AbortSignal): Promise<V2SessionUser | null> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(new DOMException('Session check timed out', 'TimeoutError')), 8000)
    let rejectAbort!: () => void
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
    })
    try { return await Promise.race([source.getSession(controller.signal), interrupted]) }
    catch (error) { if (signal.aborted || attempt === 1) throw error }
    finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      controller.signal.removeEventListener('abort', rejectAbort)
    }
  }
}

const DEMO_SESSION_KEY = 'v2:demo-session'
const demoUser: V2SessionUser = { id: 'local-demo', username: 'demo', displayName: '演示账号' }

export function createDemoSession(): V2SessionSource {
  async function enterDemo() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEMO_SESSION_KEY, 'active')
    return demoUser
  }

  return {
    async getSession(signal) {
      signal?.throwIfAborted()
      return typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_SESSION_KEY) === 'signed-out' ? null : demoUser
    },
    enterDemo,
    login: enterDemo,
    register: enterDemo,
    async logout() {
      localStorage.setItem(DEMO_SESSION_KEY, 'signed-out')
    },
  }
}

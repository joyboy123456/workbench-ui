/** 与主仓库共用的会话契约。独立前端使用本地演示身份。 */
export interface V2SessionUser {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}

export interface V2LoginInput { username: string; password: string }
export interface V2RegisterInput extends V2LoginInput { inviteCode: string; displayName?: string }

export interface V2SessionSource {
  getSession(): Promise<V2SessionUser | null>
  logout(): Promise<void>
  login(input: V2LoginInput): Promise<V2SessionUser>
  register(input: V2RegisterInput): Promise<V2SessionUser>
}

/** 账号身份沿用既有 Cookie 会话；mock 仅模拟业务数据，不绕过账号规则。 */
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
  login(input: V2LoginInput): Promise<V2SessionUser>
  register(input: V2RegisterInput): Promise<V2SessionUser>
}

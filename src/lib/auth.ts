// 登录态工具：token/玩家名统一读写，登出统一清理
export function getToken(): string {
  return localStorage.getItem('ad_token') || ''
}

export function getPlayerName(): string {
  return localStorage.getItem('ad_user') || '冒险者'
}

export function setAuth(token: string, username: string) {
  localStorage.setItem('ad_token', token)
  localStorage.setItem('ad_user', username)
}

export function clearAuth() {
  localStorage.removeItem('ad_token')
  localStorage.removeItem('ad_user')
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

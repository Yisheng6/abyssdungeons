import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { Home, Compass, User, Backpack, Hammer, Settings, LogOut, X, Sword } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import TownHeroPanel from './TownHeroPanel'

const NAV_ITEMS = [
  { path: '/', label: '城镇', icon: Home },
  { path: '/explore', label: '探索', icon: Compass },
  { path: '/character', label: '角色', icon: User },
  { path: '/inventory', label: '背包', icon: Backpack },
  { path: '/blacksmith', label: '铁匠铺', icon: Hammer },
]

const SETTINGS_QUALITY_NAMES: Record<string, string> = {
  common: '普通', fine: '精致', rare: '稀有', epic: '史诗', legendary: '传说',
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const player = useGameStore((s) => s.player)
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const [showSettings, setShowSettings] = useState(false)
  const playerName = localStorage.getItem('ad_user') || '冒险者'

  const logout = () => {
    localStorage.removeItem('ad_token')
    localStorage.removeItem('ad_user')
    navigate('/login')
  }

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const settingsModal = showSettings && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={() => setShowSettings(false)}>
      <div className="w-full max-w-xs rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>设置</span>
          <button onClick={() => setShowSettings(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
            账号：{playerName}
          </div>
          {/* 装备自动分解 */}
          <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>装备自动分解</span>
              <button
                onClick={() => updateSettings({ autoDisassemble: !settings.autoDisassemble })}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-colors"
                style={{
                  backgroundColor: settings.autoDisassemble ? 'rgba(63,185,80,0.25)' : 'var(--bg-card)',
                  color: settings.autoDisassemble ? '#3FB950' : 'var(--text-muted)',
                  border: settings.autoDisassemble ? '1px solid #3FB950' : '1px solid var(--border-color)',
                }}>
                {settings.autoDisassemble ? '已开启' : '已关闭'}
              </button>
            </div>
            {settings.autoDisassemble && (
              <>
                <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  分解条件：品质 ≤ 以下选择的装备，拾取时直接分解为金币
                </div>
                <div className="flex flex-wrap gap-1">
                  {(['common', 'fine', 'rare', 'epic', 'legendary'] as const).map((q) => (
                    <button key={q}
                      onClick={() => updateSettings({ autoDisassembleMaxQuality: q })}
                      className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                      style={{
                        backgroundColor: settings.autoDisassembleMaxQuality === q ? 'rgba(201,168,76,0.25)' : 'var(--bg-card)',
                        color: settings.autoDisassembleMaxQuality === q ? '#C9A84C' : 'var(--text-muted)',
                        border: settings.autoDisassembleMaxQuality === q ? '1px solid #C9A84C' : '1px solid transparent',
                      }}>
                      {SETTINGS_QUALITY_NAMES[q]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={logout}
            className="w-full rounded border py-1.5 transition-colors"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
            退出登录
          </button>
          <div className="pt-1 text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>深渊地城 · zhiyihw.com</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ═══ 左侧：角色面板（Logo + 状态 + 货币 + 设置） ═══ */}
      <TownHeroPanel />

      {/* ═══ 主内容区 ═══ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶部栏 */}
        <div className="flex h-11 items-center justify-between border-b px-3 lg:hidden"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--accent)' }}>
            <Sword size={15} /> 深渊地城
          </span>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>金币 <span style={{ color: '#C9A84C' }}>{player?.gold ?? 0}</span></span>
            <span>钻石 <span style={{ color: '#79C0FF' }}>{player?.diamonds ?? 0}</span></span>
            <button onClick={() => setShowSettings(true)} style={{ color: 'var(--text-muted)' }}><Settings size={15} /></button>
          </div>
        </div>

        {/* 页面内容（移动端底部留出导航高度） */}
        <div className="flex-1 pb-14 lg:pb-0">
          <Outlet />
        </div>

        {/* 移动端底部导航 */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t lg:hidden"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px]"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                <item.icon size={17} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      {settingsModal}
    </div>
  )
}

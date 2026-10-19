import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { Home, Compass, User, Backpack, Hammer, Settings, LogOut, X, Sword, Sparkles, Shield, Trophy, FlaskConical, Target, MessageSquare, Landmark } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import TownHeroPanel from './TownHeroPanel'
import AutoDisassembleSettings from './AutoDisassembleSettings'
import AutoPotionSettings from './AutoPotionSettings'

const NAV_ITEMS = [
  { path: '/', label: '城镇', icon: Home },
  { path: '/explore', label: '混乱深渊', icon: Compass },
  { path: '/lawful', label: '守序深渊', icon: Landmark },
  { path: '/shop', label: '商店', icon: FlaskConical },
  { path: '/character', label: '角色', icon: User },
  { path: '/inventory', label: '背包', icon: Backpack },
  { path: '/blacksmith', label: '铁匠铺', icon: Hammer },
  { path: '/tasks', label: '任务', icon: Target },
  { path: '/leaderboard', label: '排行', icon: Trophy },
  { path: '/chat', label: '聊天', icon: MessageSquare },
]

const QUICK_ACTIONS = [
  { icon: Compass, label: '混乱深渊', path: '/explore' },
  { icon: Landmark, label: '守序深渊', path: '/lawful' },
  { icon: FlaskConical, label: '商店', path: '/shop' },
  { icon: User, label: '角色面板', path: '/character' },
  { icon: Backpack, label: '背包', path: '/inventory' },
  { icon: Sparkles, label: '技能树', path: '/character' },
  { icon: Shield, label: '铁匠铺', path: '/blacksmith' },
  { icon: Target, label: '任务', path: '/tasks' },
  { icon: Trophy, label: '排行榜', path: '/leaderboard' },
  { icon: MessageSquare, label: '聊天', path: '/chat' },
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

  const isBattlePage = ['/explore', '/lawful', '/combat'].some((p) => location.pathname.startsWith(p))

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
          <AutoPotionSettings />
          <AutoDisassembleSettings />
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
      {/* ═══ 左侧：角色面板（战斗页隐藏，避免与战斗内数值显示重复） ═══ */}
      {!isBattlePage && <TownHeroPanel />}

      {/* ═══ 主内容区 ═══ */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:overflow-hidden">
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

        {/* 剧情横幅（固定显示） */}
        <div className="m-4 mb-0 flex-shrink-0 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            你站在<strong style={{ color: 'var(--text-primary)' }}>深渊镇</strong>的石板广场上。远处传来铁匠铺的锤击声，
            空气中弥漫着淡淡的硫磺气息。镇子的边缘，一道漆黑的裂隙通向无尽的地下世界——
            那是所有冒险者梦想与噩梦开始的地方。
          </p>
        </div>

        {/* 页面内容（通用显示区，移动端底部留出导航高度） */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-14 lg:pb-0">
          <Outlet />
        </div>

        {/* 快捷入口（固定在主内容区底部，移动端已有底部导航故隐藏） */}
        <div className="m-4 mt-0 hidden flex-shrink-0 grid-cols-5 gap-2 lg:grid">
          {QUICK_ACTIONS.map((f) => (
            <button key={f.label} onClick={() => { if (f.path !== '#') navigate(f.path) }}
              className="game-card flex items-center justify-center gap-2 rounded-lg px-2 py-3 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
              style={{ opacity: f.path === '#' ? 0.45 : 1 }}>
              <f.icon size={16} style={{ color: 'var(--accent)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
            </button>
          ))}
        </div>

        {/* 移动端底部导航 */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto border-t lg:hidden"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="flex min-w-[54px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px]"
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

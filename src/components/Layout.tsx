import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { Home, Compass, User, Backpack, Hammer, Settings, LogOut, X, Sword, Sparkles, Sparkle, Trophy, FlaskConical, Target, MessageSquare, Landmark, Crown, Mail, MoreHorizontal } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import AutoDisassembleSettings from './AutoDisassembleSettings'
import AutoPotionSettings from './AutoPotionSettings'
import Explore from '@/pages/Explore'
import Lawful from '@/pages/Lawful'
import Rift from '@/pages/Rift'
import Weekly from '@/pages/Weekly'

// 左侧竖排导航（桌面端，Dormant Dominion 风格）
const SIDE_NAV = [
  { path: '/', label: '主页', icon: Home },
  { path: '/explore', label: '混乱深渊', icon: Compass },
  { path: '/lawful', label: '守序深渊', icon: Landmark },
  { path: '/rift', label: '每日秘境', icon: Sparkle },
  { path: '/weekly', label: '每周挑战', icon: Crown },
  { path: '/talents', label: '天赋', icon: Sparkles },
  { path: '/character', label: '角色', icon: User },
  { path: '/inventory', label: '背包', icon: Backpack },
  { path: '/blacksmith', label: '铁匠铺', icon: Hammer },
  { path: '/shop', label: '商店', icon: FlaskConical },
  { path: '/tasks', label: '任务', icon: Target },
  { path: '/leaderboard', label: '排行', icon: Trophy },
  { path: '/chat', label: '聊天', icon: MessageSquare },
  { path: '/mail', label: '邮箱', icon: Mail },
]

// 移动端底部固定页签（其余进「更多」）
const PRIMARY_NAV = [
  { path: '/', label: '主页', icon: Home },
  { path: '/explore', label: '混乱深渊', icon: Compass },
  { path: '/lawful', label: '守序深渊', icon: Landmark },
  { path: '/inventory', label: '背包', icon: Backpack },
]

const MORE_NAV = SIDE_NAV.filter((i) => !PRIMARY_NAV.some((p) => p.path === i.path))

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const player = useGameStore((s) => s.player)
  const inCombat = useGameStore((s) => s.inCombat)
  const exploreLayer = useGameStore((s) => s.exploreLayer)
  const [showSettings, setShowSettings] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const unreadQ = trpc.mail.unread.useQuery({ playerName }, { refetchInterval: 30000 })
  const unreadMails = unreadQ.data?.count || 0
  // 战斗页常驻挂载：首次访问后不卸载，切换页签战斗不中断
  const onExplore = location.pathname.startsWith('/explore')
  const onLawful = location.pathname.startsWith('/lawful')
  const onRift = location.pathname.startsWith('/rift')
  const onWeekly = location.pathname.startsWith('/weekly')
  const [exploreMounted, setExploreMounted] = useState(false)
  const [lawfulMounted, setLawfulMounted] = useState(false)
  const [riftMounted, setRiftMounted] = useState(false)
  const [weeklyMounted, setWeeklyMounted] = useState(false)
  useEffect(() => { if (onExplore) setExploreMounted(true) }, [onExplore])
  useEffect(() => { if (onLawful) setLawfulMounted(true) }, [onLawful])
  useEffect(() => { if (onRift) setRiftMounted(true) }, [onRift])
  useEffect(() => { if (onWeekly) setWeeklyMounted(true) }, [onWeekly])

  const logout = () => {
    localStorage.removeItem('ad_token')
    localStorage.removeItem('ad_user')
    navigate('/login')
  }

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  // 顶部状态一句话（仿 DD: "Idle. Pick a skill to train or a monster to fight."）
  const statusText = inCombat
    ? `战斗中 · 混乱深渊第 ${exploreLayer || 1} 层深处`
    : onExplore || onLawful
      ? '正在深渊中探索……'
      : '休整中。去深渊战斗，或在镇上打理装备。'

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
      {/* ═══ 左侧：竖排图标导航（桌面端） ═══ */}
      <aside className="sticky top-0 hidden h-screen w-[176px] flex-shrink-0 flex-col border-r lg:flex"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        {/* Logo */}
        <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: 'var(--border-color)' }}>
          <Sword size={18} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>深渊地城</span>
        </div>
        {/* 导航项 */}
        <nav className="flex-1 overflow-y-auto py-2">
          {SIDE_NAV.map((item) => {
            const active = isActive(item.path)
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="relative flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}>
                {active && <span className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: 'var(--accent)' }} />}
                <item.icon size={17} />
                {item.label}
                {item.path === '/mail' && unreadMails > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{ backgroundColor: '#F85149', color: '#fff' }}>
                    {unreadMails > 99 ? '99+' : unreadMails}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        {/* 底部：设置 + 退出 */}
        <div className="flex-shrink-0 border-t py-1" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => setShowSettings(true)}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <Settings size={15} /> 设置
          </button>
          <button onClick={logout}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <LogOut size={15} /> 退出
          </button>
        </div>
      </aside>

      {/* ═══ 主内容区 ═══ */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:overflow-hidden">
        {/* 顶部状态栏：玩家名 + 状态 + 货币 + 邮件 + 设置 */}
        <div className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b px-4"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="flex items-center gap-1.5 text-sm font-bold lg:hidden" style={{ color: 'var(--accent)' }}>
              <Sword size={15} />
            </span>
            <span className="truncate text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{playerName}</span>
            <span className="hidden truncate text-xs sm:inline" style={{ color: 'var(--text-muted)' }}>{statusText}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>金币 <span className="font-bold" style={{ color: '#C9A84C' }}>{player?.gold ?? 0}</span></span>
            <span>钻石 <span className="font-bold" style={{ color: '#79C0FF' }}>{player?.diamonds ?? 0}</span></span>
            <button onClick={() => navigate('/mail')} className="relative" style={{ color: 'var(--text-muted)' }}>
              <Mail size={15} />
              {unreadMails > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold"
                  style={{ backgroundColor: '#F85149', color: '#fff' }}>
                  {unreadMails > 99 ? '99+' : unreadMails}
                </span>
              )}
            </button>
            <button onClick={() => setShowSettings(true)} className="lg:hidden" style={{ color: 'var(--text-muted)' }}>
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* 页面内容（通用显示区，移动端底部留出导航高度） */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-14 lg:pb-0">
          {/* 战斗页常驻：隐藏而不是卸载 */}
          {exploreMounted && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ display: onExplore ? undefined : 'none' }}>
              <Explore />
            </div>
          )}
          {lawfulMounted && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ display: onLawful ? undefined : 'none' }}>
              <Lawful />
            </div>
          )}
          {riftMounted && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ display: onRift ? undefined : 'none' }}>
              <Rift />
            </div>
          )}
          {weeklyMounted && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ display: onWeekly ? undefined : 'none' }}>
              <Weekly />
            </div>
          )}
          {!onExplore && !onLawful && !onRift && !onWeekly && <Outlet />}
        </div>

        {/* 移动端底部导航：4 个主功能 + 更多 */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t lg:hidden"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          {PRIMARY_NAV.map((item) => {
            const active = isActive(item.path)
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className="relative flex min-w-[54px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px]"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                <item.icon size={17} />
                {item.label}
                {item.path === '/mail' && unreadMails > 0 && (
                  <span className="absolute right-3 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold"
                    style={{ backgroundColor: '#F85149', color: '#fff' }}>
                    {unreadMails > 99 ? '99+' : unreadMails}
                  </span>
                )}
              </button>
            )
          })}
          <button onClick={() => setShowMore(true)}
            className="relative flex min-w-[54px] flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px]"
            style={{ color: MORE_NAV.some((i) => isActive(i.path)) ? 'var(--accent)' : 'var(--text-muted)' }}>
            <MoreHorizontal size={17} />
            更多
          </button>
        </nav>

        {/* 更多功能抽屉 */}
        {showMore && (
          <div className="fixed inset-0 z-50 flex items-end lg:hidden" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowMore(false)}>
            <div className="w-full rounded-t-xl border-t p-4 pb-8"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>更多功能</span>
                <button onClick={() => setShowMore(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {MORE_NAV.map((item) => {
                  const active = isActive(item.path)
                  return (
                    <button key={item.path}
                      onClick={() => { setShowMore(false); navigate(item.path) }}
                      className="flex flex-col items-center gap-1 rounded-lg py-3 text-[11px]"
                      style={{
                        backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}>
                      <item.icon size={18} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {settingsModal}
    </div>
  )
}

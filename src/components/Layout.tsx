import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { X } from 'lucide-react'
import PixIcon from './PixIcon'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { getToken, clearAuth } from '@/lib/auth'
import { loadCloudSave, startAutoSave, flushSave, getSyncStatus, onSyncStatusChange } from '@/lib/cloudsave'
import type { SyncStatus } from '@/lib/cloudsave'
import AutoDisassembleSettings from './AutoDisassembleSettings'
import AutoPotionSettings from './AutoPotionSettings'
import Explore from '@/pages/Explore'
import Lawful from '@/pages/Lawful'
import Rift from '@/pages/Rift'
import Weekly from '@/pages/Weekly'

// 左侧竖排导航（桌面端，Dormant Dominion 风格）
// children 表示折叠分组：父项点击展开/收起，子项缩进显示
const SIDE_NAV: Array<{
  path?: string; label: string; icon: string
  children?: Array<{ path: string; label: string; icon: string }>
}> = [
  { path: '/', label: '主页', icon: 'home' },
  {
    label: '深渊探索', icon: 'abyss',
    children: [
      { path: '/explore', label: '混乱深渊', icon: 'stairs' },
      { path: '/lawful', label: '守序深渊', icon: 'temple' },
    ],
  },
  { path: '/rift', label: '每日秘境', icon: 'rift' },
  { path: '/weekly', label: '每周挑战', icon: 'crown' },
  { path: '/talents', label: '天赋', icon: 'talent' },
  { path: '/character', label: '角色', icon: 'user' },
  { path: '/inventory', label: '背包', icon: 'bag' },
  { path: '/blacksmith', label: '铁匠铺', icon: 'anvil' },
  { path: '/shop', label: '商店', icon: 'flask' },
  { path: '/tasks', label: '任务', icon: 'quest' },
  { path: '/leaderboard', label: '排行', icon: 'trophy' },
  { path: '/chat', label: '聊天', icon: 'chat' },
  { path: '/mail', label: '邮箱', icon: 'mail' },
]

// 移动端底部固定页签（其余进「更多」）
const PRIMARY_NAV = [
  { path: '/', label: '主页', icon: 'home' },
  { path: '/explore', label: '混乱深渊', icon: 'abyss' },
  { path: '/lawful', label: '守序深渊', icon: 'temple' },
  { path: '/inventory', label: '背包', icon: 'bag' },
]

// 打平后的导航（供移动端「更多」抽屉过滤用）
const FLAT_NAV = SIDE_NAV.flatMap((i) => (i.children ? i.children : [{ path: i.path!, label: i.label, icon: i.icon }]))

const MORE_NAV = FLAT_NAV.filter((i) => !PRIMARY_NAV.some((p) => p.path === i.path))

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const player = useGameStore((s) => s.player)
  const inCombat = useGameStore((s) => s.inCombat)
  const exploreLayer = useGameStore((s) => s.exploreLayer)
  const [showSettings, setShowSettings] = useState(false)
  const [showMore, setShowMore] = useState(false)
  // 「深渊探索」折叠分组：身处子页面时自动展开
  const [abyssOpen, setAbyssOpen] = useState(
    () => location.pathname.startsWith('/explore') || location.pathname.startsWith('/lawful'),
  )
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const token = getToken()
  // 启动校验令牌：401 = 令牌失效回登录页；其他错误（服务器不可达）= 阻塞提示网络失败
  const meQ = trpc.account.me.useQuery({ token }, { retry: false, staleTime: 60000 })
  const [gate, setGate] = useState<'loading' | 'ok' | 'fail'>('loading')
  useEffect(() => {
    if (!meQ.error) return
    const httpStatus = (meQ.error as { data?: { httpStatus?: number } }).data?.httpStatus
    if (httpStatus === 401) { clearAuth(); window.location.href = '/login' }
    else setGate('fail')
  }, [meQ.error])
  // 令牌有效后：必须从服务器拉到云存档才能进游戏（全程联网，不允许本地跑）
  useEffect(() => {
    if (meQ.data) {
      void loadCloudSave().then((r) => {
        if (r === 'ok') { startAutoSave(); setGate('ok') }
        else setGate('fail')
      })
    }
  }, [meQ.data])
  const unreadQ = trpc.mail.unread.useQuery({ playerName, token }, { refetchInterval: 30000 })
  const unreadMails = unreadQ.data?.count || 0
  // 云存档同步状态指示
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus())
  useEffect(() => onSyncStatusChange(setSyncStatus), [])
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
  // 进入混乱/守序深渊时自动展开分组
  useEffect(() => { if (onExplore || onLawful) setAbyssOpen(true) }, [onExplore, onLawful])

  const logoutMut = trpc.account.logout.useMutation()
  const logout = () => {
    void flushSave().finally(() => {
      logoutMut.mutate({ token }) // 服务端销毁令牌（不等待结果）
      clearAuth()
      window.location.href = '/login' // 整页刷新，回到登录页后存档键随之切换
    })
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

  // ─── 联网门禁：未通过服务器验证/存档拉取前，不渲染游戏 ───
  if (gate === 'fail') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <PixIcon name="abyss" size={48} />
        <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>网络连接失败</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>无法连接游戏服务器，本游戏需要全程联网</div>
        <button className="game-btn-primary px-6 py-2 text-sm" onClick={() => window.location.reload()}>重新连接</button>
      </div>
    )
  }
  if (gate === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <PixIcon name="abyss" size={48} />
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>正在连接服务器……</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ═══ 左侧：竖排图标导航（桌面端） ═══ */}
      <aside className="sticky top-0 hidden h-screen w-[176px] flex-shrink-0 flex-col border-r lg:flex"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        {/* Logo */}
        <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: 'var(--border-color)' }}>
          <PixIcon name="sword" size={20} />
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>深渊地城</span>
        </div>
        {/* 导航项 */}
        <nav className="flex-1 overflow-y-auto py-2">
          {SIDE_NAV.map((item) => {
            // ── 折叠分组（深渊探索） ──
            if (item.children) {
              const groupActive = item.children.some((c) => isActive(c.path))
              const open = item.label === '深渊探索' ? abyssOpen : groupActive
              const toggle = () => { if (item.label === '深渊探索') setAbyssOpen((v) => !v) }
              return (
                <div key={item.label}>
                  <button onClick={toggle}
                    className="relative flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors"
                    style={{
                      color: groupActive ? 'var(--accent)' : 'var(--text-secondary)',
                      backgroundColor: 'transparent',
                      fontWeight: groupActive ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                    <PixIcon name={item.icon} size={18} />
                    {item.label}
                    <span className="ml-auto text-[10px] transition-transform"
                      style={{ color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none' }}>
                      ▶
                    </span>
                  </button>
                  {open && item.children.map((child) => {
                    const active = isActive(child.path)
                    return (
                      <button key={child.path} onClick={() => navigate(child.path)}
                        className="relative flex w-full items-center gap-2.5 py-2 pl-9 pr-4 text-[12px] transition-colors"
                        style={{
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                          fontWeight: active ? 600 : 400,
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}>
                        {active && <span className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: 'var(--accent)' }} />}
                        <PixIcon name={child.icon} size={16} />
                        {child.label}
                      </button>
                    )
                  })}
                </div>
              )
            }
            // ── 普通项 ──
            const active = isActive(item.path!)
            return (
              <button key={item.path} onClick={() => navigate(item.path!)}
                className="relative flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}>
                {active && <span className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: 'var(--accent)' }} />}
                <PixIcon name={item.icon} size={18} />
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
            <PixIcon name="gear" size={16} /> 设置
          </button>
          <button onClick={logout}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
            <PixIcon name="exit" size={16} /> 退出
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
              <PixIcon name="sword" size={16} />
            </span>
            <span className="truncate text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{playerName}</span>
            <span className="hidden truncate text-xs sm:inline" style={{ color: 'var(--text-muted)' }}>{statusText}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {/* 云存档同步状态 */}
            <span
              className="flex items-center gap-1"
              title={syncStatus === 'synced' ? '存档已同步到云端' : syncStatus === 'pending' ? '有待同步的进度' : '云端同步失败（会自动重试）'}
              style={{ color: syncStatus === 'synced' ? '#3FB950' : syncStatus === 'pending' ? 'var(--accent)' : '#F85149', cursor: syncStatus === 'error' ? 'pointer' : 'default' }}
              onClick={() => { if (syncStatus === 'error') void flushSave() }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
              <span className="hidden sm:inline">{syncStatus === 'synced' ? '已存档' : syncStatus === 'pending' ? '同步中' : '同步失败'}</span>
            </span>
            <span>金币 <span className="font-bold" style={{ color: '#C9A84C' }}>{player?.gold ?? 0}</span></span>
            <span>钻石 <span className="font-bold" style={{ color: '#79C0FF' }}>{player?.diamonds ?? 0}</span></span>
            <button onClick={() => navigate('/mail')} className="relative" style={{ color: 'var(--text-muted)' }}>
              <PixIcon name="mail" size={16} />
              {unreadMails > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold"
                  style={{ backgroundColor: '#F85149', color: '#fff' }}>
                  {unreadMails > 99 ? '99+' : unreadMails}
                </span>
              )}
            </button>
            <button onClick={() => setShowSettings(true)} className="lg:hidden" style={{ color: 'var(--text-muted)' }}>
              <PixIcon name="gear" size={16} />
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
                <PixIcon name={item.icon} size={18} />
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
            <PixIcon name="dots" size={18} />
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
                      <PixIcon name={item.icon} size={20} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 游玩中云端连续同步失败：阻塞提示，防止进度丢失 */}
      {syncStatus === 'error' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-xs rounded-lg border p-5 text-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
            <PixIcon name="abyss" size={40} />
            <div className="mt-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>网络连接失败</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>与游戏服务器的连接已中断，进度暂未保存到云端</div>
            <button className="game-btn-primary mt-4 w-full py-2 text-sm"
              onClick={() => void flushSave()}>
              重试连接
            </button>
          </div>
        </div>
      )}

      {settingsModal}
    </div>
  )
}

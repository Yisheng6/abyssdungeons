import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Sword, Shield, Backpack, Sparkles, Map, Trophy, LogOut, User } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { loadCatalogs, getTierName } from '@/lib/catalog'

// 职业中文名映射
const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}

const STAT_NAMES: Record<string, string> = {
  atk: '攻击力', def: '防御力', mag: '魔法力', mdef: '魔防', agi: '敏捷', luk: '幸运',
}

const features = [
  { icon: Sword, label: '进入地牢', path: '/explore', desc: '自动探索 · 无限层数' },
  { icon: User, label: '角色面板', path: '/character', desc: '查看属性和技能' },
  { icon: Backpack, label: '背包', path: '/inventory', desc: '管理装备和道具' },
  { icon: Sparkles, label: '技能树', path: '/character', desc: '升级和学习技能' },
  { icon: Shield, label: '铁匠铺', path: '/blacksmith', desc: '强化 · 分解 · 合成' },
  { icon: Trophy, label: '排行榜', path: '#', desc: '查看全服排名' },
]

export default function Town() {
  const navigate = useNavigate()
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const player = useGameStore((s) => s.player)

  // 预加载物品/技能目录（套装加成计算等依赖）
  useEffect(() => { loadCatalogs() }, [])

  const logout = () => {
    localStorage.removeItem('ad_token')
    localStorage.removeItem('ad_user')
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: Character Panel */}
      <aside className="hidden w-[260px] flex-shrink-0 border-r p-4 lg:block" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-hover)', border: '2px solid var(--accent)' }}>
            <User style={{ color: 'var(--accent)', width: 28, height: 28 }} />
          </div>
          <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{playerName}</h3>
          <span className="inline-block rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--accent)' }}>
            {player ? `Lv.${player.level} ${CLASS_NAMES[player.classId] || player.classId} · ${getTierName(player.classId, player.tier || 1)}` : '点击角色面板创建角色'}
          </span>
        </div>

        {/* HP/MP */}
        <div className="mb-4 space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>HP</span><span>{player?.hp ?? 100}/{player?.maxHp ?? 100}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${player ? (player.hp / player.maxHp) * 100 : 100}%`, background: 'linear-gradient(90deg, #F85149, #3FB950)' }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>MP</span><span>{player?.mp ?? 50}/{player?.maxMp ?? 50}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${player ? (player.mp / player.maxMp) * 100 : 100}%`, background: 'linear-gradient(90deg, #58A6FF, #79C0FF)' }} />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {player ? (
            <>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>攻击力: <span style={{ color: 'var(--text-primary)' }}>{player.atk}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>防御力: <span style={{ color: 'var(--text-primary)' }}>{player.def}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>魔法力: <span style={{ color: 'var(--text-primary)' }}>{player.mag}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>魔防: <span style={{ color: 'var(--text-primary)' }}>{player.mdef}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>敏捷: <span style={{ color: 'var(--text-primary)' }}>{player.agi}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>幸运: <span style={{ color: 'var(--text-primary)' }}>{player.luk}</span></div>
            </>
          ) : (
            <div className="col-span-2 rounded p-2 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>尚未创建角色</div>
          )}
        </div>

        <button onClick={logout} className="flex w-full items-center justify-center gap-1 rounded-lg border py-1.5 text-xs transition-colors" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <LogOut size={14} /> 退出登录
        </button>
      </aside>

      {/* Center: Main Content */}
      <main className="flex flex-1 flex-col">
        {/* Top Nav */}
        <header className="flex h-12 items-center justify-between border-b px-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2">
            <Sword size={18} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>深渊地城</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}> / 深渊镇</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <span style={{ fontSize: 14 }}>$</span> 0
            </span>
            {/* Mobile logout button */}
            <button onClick={logout} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs lg:hidden" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              <LogOut size={12} /> 退出
            </button>
          </div>
        </header>

        {/* Scene Description */}
        <div className="m-4 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            你站在<strong style={{ color: 'var(--text-primary)' }}>深渊镇</strong>的石板广场上。远处传来铁匠铺的锤击声，
            空气中弥漫着淡淡的硫磺气息。镇子的边缘，一道漆黑的裂隙通向无尽的地下世界——
            那是所有冒险者梦想与噩梦开始的地方。
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            提示：选择「进入地牢」开始你的第一次探险。输入层级坐标（如 L=1, X=0, Y=0）或点击快速开始。
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid flex-1 grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3">
          {features.map((f) => (
            <button key={f.label} onClick={() => { if (f.path !== '#') navigate(f.path) }}
              className="game-card flex flex-col items-center justify-center gap-2 p-6 text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
              <f.icon size={28} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.desc}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

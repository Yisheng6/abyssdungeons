import { useNavigate } from 'react-router'
import { LogOut, User } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { getTierName } from '@/lib/catalog'

const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}

/** 城镇页左侧角色状态面板（由 Layout 渲染在导航栏左边） */
export default function TownHeroPanel() {
  const navigate = useNavigate()
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const player = useGameStore((s) => s.player)

  const logout = () => {
    localStorage.removeItem('ad_token')
    localStorage.removeItem('ad_user')
    navigate('/login')
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] flex-shrink-0 overflow-y-auto border-r p-4 lg:block"
      style={{ borderColor: 'var(--border-color)' }}>
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
        {player && (
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>EXP</span><span>{player.exp}/{player.level * 100}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (player.exp / (player.level * 100)) * 100)}%`, background: 'linear-gradient(90deg, #C9A84C, #F0D878)' }} />
            </div>
          </div>
        )}
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
  )
}

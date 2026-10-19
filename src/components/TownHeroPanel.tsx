import { useState } from 'react'
import { useNavigate } from 'react-router'
import { LogOut, Settings, Sword, User, X } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { getTierName } from '@/lib/catalog'

const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}

const SETTINGS_QUALITY_NAMES: Record<string, string> = {
  common: '普通', fine: '精致', rare: '稀有', epic: '史诗', legendary: '传说',
}

/** 全局左侧角色面板：Logo + 角色状态 + 货币 + 设置/退出 */
export default function TownHeroPanel() {
  const navigate = useNavigate()
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const player = useGameStore((s) => s.player)
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const [showSettings, setShowSettings] = useState(false)

  const logout = () => {
    localStorage.removeItem('ad_token')
    localStorage.removeItem('ad_user')
    navigate('/login')
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] flex-shrink-0 flex-col border-r lg:flex"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
      {/* Logo */}
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: 'var(--border-color)' }}>
        <Sword size={18} style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>深渊地城</span>
      </div>

      {/* 角色状态 */}
      <div className="flex-1 overflow-y-auto p-4">
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
        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
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
      </div>

      {/* 底部：货币 + 设置 + 退出 */}
      <div className="flex-shrink-0 border-t p-3 text-xs" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-2 flex gap-3" style={{ color: 'var(--text-muted)' }}>
          <span>金币 <span style={{ color: '#C9A84C' }}>{player?.gold ?? 0}</span></span>
          <span>钻石 <span style={{ color: '#79C0FF' }}>{player?.diamonds ?? 0}</span></span>
        </div>
        <button onClick={() => setShowSettings(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <Settings size={14} /> 设置
        </button>
        <button onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <LogOut size={14} /> 退出登录
        </button>
      </div>

      {/* 设置弹窗 */}
      {showSettings && (
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
      )}
    </aside>
  )
}

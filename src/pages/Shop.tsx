import { useEffect, useState } from 'react'
import { FlaskConical, Coins } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { loadCatalogs, getItemInfo } from '@/lib/catalog'
import { charApi } from '@/lib/char-api'

/** 商店出售的药水（价格 = 物品 value） */
const SHOP_ITEMS = ['hp_small', 'hp_medium', 'hp_large', 'mp_small', 'mp_medium']

export default function Shop() {
  const player = useGameStore((s) => s.player)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadCatalogs() }, [])

  const buy = async (itemId: string, qty: number) => {
    const cat = getItemInfo(itemId)
    if (!cat) return
    if (!player) { setMsg('请先创建角色'); return }
    const r = await charApi.buy(itemId, qty)
    setMsg(r.message)
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <FlaskConical size={16} style={{ color: 'var(--accent)' }} /> 杂货商店
        </h2>
        <span className="flex items-center gap-1 text-xs" style={{ color: '#C9A84C' }}>
          <Coins size={13} /> {player?.gold ?? 0}
        </span>
      </div>
      <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>出售生命药水和法力药水，探索前记得备足补给。</p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SHOP_ITEMS.map((id) => {
          const cat = getItemInfo(id)
          if (!cat) return null
          const price = cat.value ?? 10
          const effect = (cat.effect || {}) as Record<string, number>
          const effectText = effect.heal ? `恢复 ${effect.heal >= 9999 ? '全部' : effect.heal} 点生命`
            : effect.restoreMp ? `恢复 ${effect.restoreMp} 点法力` : ''
          const affordable = (player?.gold ?? 0) >= price
          return (
            <div key={id} className="game-card flex items-center justify-between gap-2 p-3">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{cat.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{effectText}</div>
                <div className="mt-0.5 text-xs" style={{ color: '#C9A84C' }}>{price} 金币</div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => buy(id, 1)} disabled={!affordable}
                  className="rounded-lg px-3 py-1 text-xs font-bold transition-all active:scale-95"
                  style={{ backgroundColor: affordable ? 'var(--accent)' : 'var(--bg-hover)', color: affordable ? 'var(--bg-primary)' : 'var(--text-muted)' }}>
                  买 1
                </button>
                <button onClick={() => buy(id, 10)} disabled={(player?.gold ?? 0) < price * 10}
                  className="rounded-lg border px-3 py-1 text-xs transition-all active:scale-95"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', opacity: (player?.gold ?? 0) >= price * 10 ? 1 : 0.4 }}>
                  买 10
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {msg && (
        <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)' }}>
          {msg}
        </div>
      )}
    </div>
  )
}

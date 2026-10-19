import { useGameStore } from '@/stores/gameStore'

/** 自动喝药设置：HP 低于阈值时自动使用生命药水 */
export default function AutoPotionSettings() {
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const on = settings.autoPotion ?? false
  const threshold = settings.autoPotionThreshold ?? 50

  return (
    <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>自动喝药</span>
        <button
          onClick={() => updateSettings({ autoPotion: !on })}
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-colors"
          style={{
            backgroundColor: on ? 'rgba(63,185,80,0.25)' : 'var(--bg-card)',
            color: on ? '#3FB950' : 'var(--text-muted)',
            border: on ? '1px solid #3FB950' : '1px solid var(--border-color)',
          }}>
          {on ? '已开启' : '已关闭'}
        </button>
      </div>
      {on && (
        <>
          <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            战斗中 HP 低于阈值时自动使用背包里的生命药水（优先小瓶）
          </div>
          <div className="flex gap-1">
            {[30, 50, 70].map((v) => (
              <button key={v}
                onClick={() => updateSettings({ autoPotionThreshold: v })}
                className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                style={{
                  backgroundColor: threshold === v ? 'rgba(201,168,76,0.25)' : 'var(--bg-card)',
                  color: threshold === v ? '#C9A84C' : 'var(--text-muted)',
                  border: threshold === v ? '1px solid #C9A84C' : '1px solid transparent',
                }}>
                HP &lt; {v}%
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

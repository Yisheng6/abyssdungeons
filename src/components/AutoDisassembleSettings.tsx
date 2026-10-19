import { useGameStore, SLOT_NAMES, STAT_NAMES, DEFAULT_DISASSEMBLE_RULES } from '@/stores/gameStore'
import type { AutoDisassembleRules } from '@/stores/gameStore'

const QUALITY_OPTIONS: Array<[string, string]> = [
  ['common', '普通'], ['fine', '精致'], ['rare', '稀有'], ['epic', '史诗'], ['legendary', '传说'], ['mythic', '神话'],
]

/** 自动分解多条件设置（与背包装备筛选同款交互） */
export default function AutoDisassembleSettings() {
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const rules: AutoDisassembleRules = settings.autoDisassembleRules || { ...DEFAULT_DISASSEMBLE_RULES }

  const patch = (p: Partial<AutoDisassembleRules>) =>
    updateSettings({ autoDisassembleRules: { ...rules, ...p } })

  const toggleIn = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key]

  const chip = (active: boolean, accent = false) => ({
    backgroundColor: active ? (accent ? 'rgba(163,113,247,0.25)' : 'rgba(201,168,76,0.25)') : 'var(--bg-card)',
    color: active ? (accent ? '#A371F7' : '#C9A84C') : 'var(--text-muted)',
    border: active ? `1px solid ${accent ? '#A371F7' : '#C9A84C'}` : '1px solid transparent',
  }) as const

  return (
    <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>装备自动分解</span>
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
        <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            拾取装备时，符合以下全部条件的装备直接分解为金币
          </div>

          {/* 品质（多选） */}
          <div>
            <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>品质（多选，全不选 = 任意品质）</div>
            <div className="flex flex-wrap gap-1">
              {QUALITY_OPTIONS.map(([q, name]) => (
                <button key={q} onClick={() => patch({ qualities: toggleIn(rules.qualities, q) })}
                  className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                  style={chip(rules.qualities.includes(q))}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* 部位（多选） */}
          <div>
            <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>部位（多选，全不选 = 全部部位）</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(SLOT_NAMES).map(([k, name]) => (
                <button key={k} onClick={() => patch({ slots: toggleIn(rules.slots, k) })}
                  className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                  style={chip(rules.slots.includes(k))}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* 套装阶级 / 强化等级上限 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>套装阶级 ≤</div>
              <div className="flex flex-wrap gap-1">
                {[[-1, '不限'], [0, '0'], [1, 'Ⅰ'], [2, 'Ⅱ'], [3, 'Ⅲ']].map(([v, label]) => (
                  <button key={v} onClick={() => patch({ maxSetTier: v as number })}
                    className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                    style={chip(rules.maxSetTier === v, true)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>强化等级 ≤</div>
              <div className="flex flex-wrap gap-1">
                {[[-1, '不限'], [0, '+0'], [5, '+5'], [10, '+10']].map(([v, label]) => (
                  <button key={v} onClick={() => patch({ maxEnhance: v as number })}
                    className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                    style={chip(rules.maxEnhance === v, true)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 保留词条 */}
          <div>
            <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>保留词条（含选中词条的装备不分解）</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(STAT_NAMES).map(([k, name]) => (
                <button key={k} onClick={() => patch({ keepAffixes: toggleIn(rules.keepAffixes, k) })}
                  className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                  style={chip(rules.keepAffixes.includes(k))}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => patch({ ...DEFAULT_DISASSEMBLE_RULES })}
            className="w-full rounded border py-1 text-[10px] transition-colors"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            重置条件
          </button>
        </div>
      )}
    </div>
  )
}

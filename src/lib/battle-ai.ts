// ═══ 自动战斗技能选择 AI ═══
// 规则：按玩家自定义顺序遍历，跳过——冷却中 / 蓝不足 / 满血治疗 / 已有同名增益 / 目标已有同名DoT
// 都不满足时普通攻击

import { getSkillInfo } from './catalog'

export interface AiContext {
  hp: number
  maxHp: number
  mp: number
  skills: string[]
  statuses?: Array<{ id: string }>
  cooldowns?: Record<string, number>
}

/** 技能分类 */
export function classifySkill(skillId: string): 'heal' | 'buff' | 'dot' | 'dispel' | 'damage' | 'other' {
  const sd = getSkillInfo(skillId)
  const eff = (sd as unknown as { effect?: Record<string, unknown> })?.effect || {}
  if (eff.heal || eff.healPercent) return 'heal'
  if (eff.dispel) return 'dispel'
  const hasDamage = !!(eff.damage || eff.trapDamage || eff.dotDamage)
  const hasBuff = !!(eff.atkBuff || eff.defBuff || eff.magMultiplier || eff.defMultiplier || eff.critChanceBuff || eff.dodgeBuff || eff.shield)
  if (eff.dotDamage && !eff.damage) return 'dot'
  if (hasBuff && !hasDamage) return 'buff'
  if (hasDamage) return 'damage'
  return 'other'
}

/**
 * 按顺序选择本回合技能。
 * @param order 玩家排序后的技能列表（为空则按 skills 原顺序）
 * @param targetStatuses 当前主攻目标的异常状态（用于避免重复挂 DoT）
 */
export function chooseAutoSkill(
  player: AiContext,
  order: string[],
  targetStatuses?: Array<{ id: string }>,
): string | null {
  const seq = order.length > 0
    ? [...order.filter((s) => player.skills.includes(s)), ...player.skills.filter((s) => !order.includes(s))]
    : player.skills
  const hpPct = player.maxHp > 0 ? player.hp / player.maxHp : 1

  for (const sid of seq) {
    const sd = getSkillInfo(sid)
    if (!sd) continue
    if ((player.cooldowns?.[sid] || 0) > 0) continue // 冷却中
    if (player.mp < (sd.mpCost ?? 10)) continue      // 蓝不足
    const kind = classifySkill(sid)
    if (kind === 'heal' && hpPct > 0.7) continue     // 血量健康不奶
    if (kind === 'buff' && (player.statuses || []).some((s) => s.id === `buff_${sid}`)) continue // 增益未消失不重复
    if (kind === 'dot' && (targetStatuses || []).some((s) => s.id === `dot_${sid}`)) continue    // DoT 未消失不重复
    if (kind === 'dispel' && !(player.statuses || []).some((s) => !s.id.startsWith('buff_'))) continue // 无debuff不驱散
    if (kind === 'other') continue                   // 未支持的技能（召唤等）不自动放
    return sid
  }
  return null
}

/** 战斗切换与战斗快照工具 */
import { useGameStore, getPlayerMods } from '@/stores/gameStore'

export const MODE_NAMES: Record<string, string> = {
  explore: '混乱深渊', lawful: '守序深渊', rift: '每日秘境', weekly: '每周挑战', combat: '决斗场',
}

/**
 * 进入新战斗前调用：若已有其他玩法的战斗在进行，弹确认框；
 * 确认后中断旧战斗（旧循环每回合检查 battleMode，发现易主即自行退出）。
 * 返回是否可以开始新战斗。
 */
export function confirmSwitchBattle(target: 'explore' | 'lawful' | 'rift' | 'weekly' | 'combat'): boolean {
  const gs = useGameStore.getState()
  const cur = gs.battleMode
  const busy = gs.inCombat || gs.isAutoExploring
  if (!busy || !cur || cur === target) return true
  if (!window.confirm(`当前正在「${MODE_NAMES[cur]}」战斗中，是否结束它并切换为「${MODE_NAMES[target]}」？`)) return false
  useGameStore.setState({ isAutoExploring: false, lawfulInBattle: false, riftInBattle: false, battleMode: target })
  return true
}

/**
 * 战斗开始时的属性快照：战斗中更换装备/技能/天赋不影响当前战斗，
 * 暂停或切换战斗后，下一场战斗才使用新配置。
 */
export function snapshotBattleStats() {
  const gs = useGameStore.getState()
  const p = gs.player!
  return {
    atk: p.atk, def: p.def, mag: p.mag, mdef: p.mdef, agi: p.agi, luk: p.luk,
    con: p.con || 0, wil: p.wil || 0, maxHp: p.maxHp, maxMp: p.maxMp,
    skills: p.skills, element: p.element || 'none',
    mods: getPlayerMods().combat,
  }
}
export type BattleSnap = ReturnType<typeof snapshotBattleStats>

/** 当前战斗是否已被切换走（每回合开头检查）。battleMode 为 null（波次间隙）不算被切换 */
export function battleHijacked(mode: string): boolean {
  const bm = useGameStore.getState().battleMode
  return bm !== null && bm !== mode
}

/** 战斗结束清理：只有自己仍是当前战斗时才清除状态，避免误清新战斗 */
export function releaseBattle(mode: 'explore' | 'lawful' | 'rift' | 'weekly' | 'combat') {
  const gs = useGameStore.getState()
  if (gs.battleMode === mode) {
    gs.setInCombat(false)
    gs.setBattleMode(null)
  }
}

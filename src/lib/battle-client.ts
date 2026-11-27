// 服务端战斗会话封装：客户端只发出招选择，战斗状态全部由服务端托管
import { apiClient } from './api'
import { getToken } from './auth'

export interface BattleEnemyInit {
  id: string; uid?: string; name: string
  hp: number; maxHp: number; mp: number; maxMp: number
  atk: number; def: number; mag: number; mdef: number
  agi: number; luk: number
  skills: string[]; element: string; aiType?: string
  statuses?: Array<{ id: string; name: string; kind: string; turns: number }>
  dropTable?: unknown[] | null
}

// 角色属性由服务端从云存档重算，客户端只上报当前血蓝（服务端钳制到重算上限）
export interface BattlePlayerInit {
  hp: number; mp: number
}

export async function battleStart(
  mode: 'explore' | 'lawful' | 'rift' | 'weekly',
  layer: number,
  player: BattlePlayerInit,
  enemies: BattleEnemyInit[],
): Promise<string> {
  const r = await apiClient.battle.start.mutate({
    token: getToken(), mode, layer,
    player,
    enemies: enemies as never,
    dropTables: enemies.map((e) => ({ enemyId: e.id, dropTable: e.dropTable as never })),
  })
  return r.battleId
}

export interface BattleAction {
  type: 'attack' | 'skill' | 'defend' | 'flee'
  skillId?: string
  itemId?: string // 同回合吃药（服务端校验治疗量）
}

export async function battleTick(battleId: string, action: BattleAction) {
  return apiClient.battle.tick.mutate({ token: getToken(), battleId, action })
}

export async function battleAbandon() {
  try { await apiClient.battle.abandon.mutate({ token: getToken() }) } catch { /* silent */ }
}

// ─── 通用服务端战斗循环（供混乱/守序深渊、秘境、周挑战复用）───
// 战斗状态在服务端会话中，本函数只负责：喝药/选技能 → 发 tick → 把结果同步进 store
import { useGameStore } from '@/stores/gameStore'
import { chooseAutoSkill } from './battle-ai'
import { getItemInfo } from './catalog'
import type { snapshotBattleStats } from './battle-switch'

export interface BattleSettle {
  exp: number; gold: number; diamonds: number; levelUps: number
  items: Array<{ name: string; quantity: number; quality?: string; note?: string }>
  weeklyDamage?: number
  passHeal?: { hp: number; mp: number }
  state?: Record<string, unknown>
  version?: number
}

export interface RunBattleResult {
  victory: boolean
  aborted: boolean      // 被停止/被切换走
  sessionLost: boolean  // 服务端会话丢失（如服务器重启）
  expGain: number       // 服务端结算的基础经验
  drops: Array<{ itemId: string; name?: string; type?: string; quantity: number; quality?: string; stats?: Record<string, number>; affixes?: Record<string, number> }>
  /** 服务端结算结果：奖励已写入存档，客户端应用 state 即可 */
  settle: BattleSettle | null
}

export async function runServerBattle(opts: {
  mode: 'explore' | 'lawful' | 'rift' | 'weekly'
  layer: number
  enemies: BattleEnemyInit[]
  snap: ReturnType<typeof snapshotBattleStats>
  isAborted: () => boolean
  onLog: (l: string) => void
  onTick?: (r: { player: { hp: number; mp: number }; enemies: Array<{ uid?: string; id: string; name: string; hp: number; maxHp: number; dead: boolean }>; ended: boolean; victory: boolean }) => void
  roundDelayMs?: number
}): Promise<RunBattleResult> {
  const { mode, layer, enemies, snap, isAborted, onLog } = opts
  const roundDelay = opts.roundDelayMs ?? 2000
  const gs = useGameStore.getState()
  const player0 = gs.player!

  // 开战：属性由服务端按存档重算，客户端只登记敌人与当前血蓝
  const battleId = await battleStart(mode, layer, {
    hp: player0.hp, mp: player0.mp,
  }, enemies)

  let victory = false
  let expGain = 0
  let drops: RunBattleResult['drops'] = []
  let settle: RunBattleResult['settle'] = null

  for (let round = 1; round <= 90; round++) {
    if (isAborted()) { void battleAbandon(); return { victory: false, aborted: true, sessionLost: false, expGain: 0, drops: [], settle: null } }

    const cur = useGameStore.getState()
    if (!cur.player || cur.player.hp <= 0) break

    // 自动喝药（客户端扣背包，服务端按配置表校验治疗量）
    let itemId: string | undefined
    const threshold = cur.settings.autoPotionThreshold ?? 50
    if (cur.settings.autoPotion && cur.player.hp / cur.player.maxHp * 100 < threshold) {
      const healOf = (i: { effect?: unknown; id: string }) =>
        (((i.effect as Record<string, number> | undefined)?.heal ?? (getItemInfo(i.id)?.effect as Record<string, number> | undefined)?.heal ?? 0))
      const potion = cur.inventory
        .filter((i) => i.type === 'consumable' && i.quantity > 0 && healOf(i) > 0)
        .sort((a, b) => healOf(a) - healOf(b))[0]
      if (potion) {
        const r = cur.useConsumable(potion.uid)
        if (r.success) itemId = potion.id
      }
    }

    // 智能技能选择（技能取自开战快照）
    const firstAlive = cur.combatEnemies.find((e) => e.hp > 0)
    const sid = chooseAutoSkill(
      { hp: cur.player.hp, maxHp: snap.maxHp, mp: cur.player.mp, skills: snap.skills || [],
        statuses: cur.playerStatuses || [], cooldowns: cur.skillCooldowns },
      snap.skills || [], (firstAlive as unknown as { statuses?: Array<{ id: string }> })?.statuses)
    const action: BattleAction = sid ? { type: 'skill', skillId: sid, itemId } : { type: 'attack', itemId }

    // 服务端推进一回合
    let result
    try {
      result = await battleTick(battleId, action)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('TOO_FAST') || msg.includes('TOO_MANY')) {
        await new Promise((r) => setTimeout(r, 600)) // 服务端控速：稍等重试本轮
        round--
        continue
      }
      // NO_BATTLE 等：会话丢失（服务器重启等）
      onLog('⚠ 战斗连接中断（会话已失效）')
      void battleAbandon()
      return { victory: false, aborted: false, sessionLost: true, expGain: 0, drops: [], settle: null }
    }

    result.logs.forEach(onLog)
    opts.onTick?.(result)

    // 同步服务端状态到 store（界面显示）
    const after = useGameStore.getState()
    const merged = after.combatEnemies.map((e) => {
      const u = result.enemies.find((r) => (r.uid ?? r.id) === (e.uid ?? e.id))
      return u ? { ...e, ...u } : e
    })
    after.setCombatEnemies(merged)
    after.updatePlayerHp(result.player.hp)
    after.updatePlayerMp(result.player.mp)
    after.setPlayerStatuses((result.player.statuses || []) as never)
    after.setSkillCooldowns((result.player.cooldowns || {}) as never)

    if (result.ended) {
      victory = result.victory
      expGain = result.expGain || 0
      drops = (result.drops || []) as RunBattleResult['drops']
      settle = (result.settle || null) as RunBattleResult['settle']
      break
    }

    await new Promise((r) => setTimeout(r, roundDelay))
  }

  return { victory, aborted: false, sessionLost: false, expGain, drops, settle }
}

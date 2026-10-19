import type { TaskProgress } from '@/stores/gameStore'

export interface TaskDef {
  id: string
  scope: 'daily' | 'achievement'
  name: string
  desc: string
  metric: keyof TaskProgress
  target: number
  /** 经验奖励 */
  exp: number
  /** 成就读累计值，每日读当日值 */
}

export const TASKS: TaskDef[] = [
  // ─── 每日任务 ───
  { id: 'd_rooms', scope: 'daily', name: '今日探索', desc: '探索 30 个房间', metric: 'rooms', target: 30, exp: 150 },
  { id: 'd_kills', scope: 'daily', name: '今日猎杀', desc: '击杀 50 只怪物', metric: 'kills', target: 50, exp: 200 },
  { id: 'd_layers', scope: 'daily', name: '今日突破', desc: '通关 2 层地牢', metric: 'layers', target: 2, exp: 300 },
  // ─── 成就 ───
  { id: 'a_kills_100', scope: 'achievement', name: '初露锋芒', desc: '累计击杀 100 只怪物', metric: 'kills', target: 100, exp: 300 },
  { id: 'a_kills_500', scope: 'achievement', name: '猎手本色', desc: '累计击杀 500 只怪物', metric: 'kills', target: 500, exp: 800 },
  { id: 'a_kills_2000', scope: 'achievement', name: '深渊收割者', desc: '累计击杀 2000 只怪物', metric: 'kills', target: 2000, exp: 2500 },
  { id: 'a_rooms_200', scope: 'achievement', name: '迷宫行者', desc: '累计探索 200 个房间', metric: 'rooms', target: 200, exp: 400 },
  { id: 'a_rooms_1000', scope: 'achievement', name: '地城制图师', desc: '累计探索 1000 个房间', metric: 'rooms', target: 1000, exp: 1500 },
  { id: 'a_layers_10', scope: 'achievement', name: '深入腹地', desc: '累计通关 10 层', metric: 'layers', target: 10, exp: 500 },
  { id: 'a_layers_50', scope: 'achievement', name: '深渊常客', desc: '累计通关 50 层', metric: 'layers', target: 50, exp: 2000 },
  { id: 'a_boss_10', scope: 'achievement', name: 'Boss 克星', desc: '累计击杀 10 只 Boss', metric: 'bossKills', target: 10, exp: 1200 },
]

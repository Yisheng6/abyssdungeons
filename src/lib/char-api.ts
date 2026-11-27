// 角色操作客户端封装：所有改动角色数据的操作走服务端接口
// 服务端返回最新存档状态，applyServerState 应用到本地 store（本地仅为镜像缓存）
import { apiClient } from './api'
import { getToken } from './auth'
import { useGameStore } from '@/stores/gameStore'
import { setCloudVersion, notifySyncStatus } from './cloudsave'

export interface CharOpResult {
  success: boolean
  message: string
  state?: Record<string, unknown>
  version?: number
}

/** 把服务端返回的存档状态应用到本地（含版本号同步，避免云存档冲突） */
export function applyServerState(r: { state?: unknown; version?: number }) {
  if (r.state && typeof r.state === 'object') {
    useGameStore.setState(r.state as never)
  }
  if (typeof r.version === 'number') setCloudVersion(r.version)
}

async function exec(call: () => Promise<CharOpResult>): Promise<CharOpResult> {
  notifySyncStatus('syncing')
  try {
    const r = await call()
    if (r.success) applyServerState(r)
    notifySyncStatus(r.success ? 'saved' : 'error')
    return r
  } catch (e) {
    notifySyncStatus('error')
    return { success: false, message: e instanceof Error ? e.message : '网络错误' }
  }
}

export const charApi = {
  createPlayer: (classId: string) => exec(() => apiClient.char.createPlayer.mutate({ token: getToken(), classId }) as never),
  switchClass: (classId: string) => exec(() => apiClient.char.switchClass.mutate({ token: getToken(), classId }) as never),
  equip: (uid: string) => exec(() => apiClient.char.equip.mutate({ token: getToken(), uid }) as never),
  unequip: (slot: string) => exec(() => apiClient.char.unequip.mutate({ token: getToken(), slot }) as never),
  useItem: (uid: string) => exec(() => apiClient.char.useItem.mutate({ token: getToken(), uid }) as never),
  disassemble: (uids: string[]) => exec(() => apiClient.char.disassemble.mutate({ token: getToken(), uids }) as never),
  buy: (itemId: string, qty: number) => exec(() => apiClient.char.buy.mutate({ token: getToken(), itemId, qty }) as never),
  enhance: (uid: string, useProtect?: boolean, useLucky?: boolean) =>
    exec(() => apiClient.char.enhance.mutate({ token: getToken(), uid, useProtect, useLucky }) as never),
  reforge: (uid: string, useDiamond?: boolean) =>
    exec(() => apiClient.char.reforge.mutate({ token: getToken(), uid, useDiamond }) as never),
  socketGem: (uid: string, gemUid: string) =>
    exec(() => apiClient.char.socketGem.mutate({ token: getToken(), uid, gemUid }) as never),
  unsocketGem: (uid: string, gemIndex: number) =>
    exec(() => apiClient.char.unsocketGem.mutate({ token: getToken(), uid, gemIndex }) as never),
  advanceTier: () => exec(() => apiClient.char.advanceTier.mutate({ token: getToken() }) as never),
  awaken: () => exec(() => apiClient.char.awaken.mutate({ token: getToken() }) as never),
  learnTalent: (nodeId: string) => exec(() => apiClient.char.learnTalent.mutate({ token: getToken(), nodeId }) as never),
  respecTalents: () => exec(() => apiClient.char.respecTalents.mutate({ token: getToken() }) as never),
  learnSkill: (skillId: string) => exec(() => apiClient.char.learnSkill.mutate({ token: getToken(), skillId }) as never),
  claimTask: (taskId: string) => exec(() => apiClient.char.claimTask.mutate({ token: getToken(), taskId }) as never),
  track: (kind: 'rooms' | 'kills' | 'layers' | 'bossKills', n = 1) =>
    exec(() => apiClient.char.track.mutate({ token: getToken(), kind, n }) as never),
  updateMaxLayer: (layer: number) => exec(() => apiClient.char.updateMaxLayer.mutate({ token: getToken(), layer }) as never),
  setLawfulLayer: (layer: number) => exec(() => apiClient.char.setLawfulLayer.mutate({ token: getToken(), layer }) as never),
  setRiftStage: (stage: number, cleared?: boolean) =>
    exec(() => apiClient.char.setRiftStage.mutate({ token: getToken(), stage, cleared }) as never),
  updateSettings: (patch: Record<string, unknown>) =>
    exec(() => apiClient.char.updateSettings.mutate({ token: getToken(), patch }) as never),
  claimLoot: (voucher: string) =>
    exec(() => apiClient.char.claimLoot.mutate({ token: getToken(), voucher }) as never),
}

// createPlayer 首次调用时可能尚无存档，不走通用 exec 的错误包装
export async function charCreatePlayer(classId: string): Promise<CharOpResult> {
  return exec(() => apiClient.char.createPlayer.mutate({ token: getToken(), classId }) as never)
}

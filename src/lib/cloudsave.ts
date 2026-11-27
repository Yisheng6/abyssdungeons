// 云存档（只读）：
// - 服务器是存档唯一写方：所有数据变更通过 char.*/battle.* 服务端接口完成
// - 登录后 loadCloudSave() 拉取服务端存档 → 写入本地键 → 触发 store 重新水合
// - 本文件保留读取、版本同步与同步状态指示；不再有上传通道
import { apiClient as client } from './api'
import { getToken } from './auth'
import { useGameStore, STORAGE_KEY } from '@/stores/gameStore'

let version = 0 // 本地基于的服务端版本

/** 服务端操作返回新版本号时同步（避免下次读取误判） */
export function setCloudVersion(v: number) { version = v }
export function getCloudVersion(): number { return version }

// ─── 同步状态（顶栏指示器用）───
export type SyncStatus = 'synced' | 'syncing' | 'saved' | 'pending' | 'error'
let status: SyncStatus = 'synced'
const listeners = new Set<(s: SyncStatus) => void>()
function setStatus(s: SyncStatus) {
  if (status === s) return
  status = s
  listeners.forEach((fn) => fn(s))
}
export function notifySyncStatus(s: SyncStatus) { setStatus(s) }
export function getSyncStatus(): SyncStatus { return status }
export function onSyncStatusChange(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * 登录后调用：拉取云存档覆盖本地。失败自动重试 3 次。
 * 返回 'ok'（拿到云端存档或确认是新账号）/ 'fail'（服务器不可达，调用方应阻塞进入游戏）
 * 注意：本游戏为全程联网游戏，失败时绝不允许用本地缓存继续玩
 */
export async function loadCloudSave(): Promise<'ok' | 'fail'> {
  const token = getToken()
  if (!token) return 'fail'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.save.get.query({ token })
      if (res.found) {
        version = res.version
        localStorage.setItem(STORAGE_KEY, res.data)
        // 重新水合 store（复用 persist 的迁移/补全逻辑）
        await useGameStore.persist.rehydrate()
        setStatus('synced')
        return 'ok'
      }
      // 云端无存档 = 新账号：等待创建角色（创建走服务端接口）
      setStatus('synced')
      return 'ok'
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
    }
  }
  setStatus('error')
  return 'fail'
}

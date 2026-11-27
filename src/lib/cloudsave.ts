// 云存档同步：
// - 登录校验通过后 loadCloudSave() 拉取服务端存档 → 写入本地键 → 触发 store 重新水合（迁移逻辑复用）
// - startAutoSave() 后每 30s 检查脏标记并上传；切后台/关页/登出时强制 flush
// - 版本号乐观锁：冲突说明别的设备存了更新的档 → 以服务器为准并刷新页面
// - localStorage 保留为离线缓存：网络失败时游戏照玩，恢复后自动补传
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '../../api/router'
import { getToken } from './auth'
import { useGameStore, STORAGE_KEY } from '@/stores/gameStore'

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
})

let version = 0 // 本地基于的服务端版本
let dirty = false
let started = false
let failCount = 0 // 连续上传失败次数（≥3 才置 error，避免瞬时抖动打扰玩家）

// ─── 同步状态（顶栏指示器用）───
export type SyncStatus = 'synced' | 'pending' | 'error'
let status: SyncStatus = 'synced'
const listeners = new Set<(s: SyncStatus) => void>()
function setStatus(s: SyncStatus) {
  if (status === s) return
  status = s
  listeners.forEach((fn) => fn(s))
}
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
      // 云端无存档 = 新账号：以本地初始档为准上传
      dirty = true
      setStatus('pending')
      return 'ok'
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
    }
  }
  setStatus('error')
  return 'fail'
}

/** 立即上传存档（登出/切后台/关页前调用） */
export async function flushSave(): Promise<void> {
  const token = getToken()
  if (!token) return
  const data = localStorage.getItem(STORAGE_KEY)
  if (!data) return
  try {
    const r = await client.save.put.mutate({ token, baseVersion: version, data })
    if (r.success) {
      version = r.version
      dirty = false
      failCount = 0
      setStatus('synced')
    } else if (r.conflict) {
      // 其他设备有更新存档：服务器为准，覆盖本地后刷新页面
      const res = await client.save.get.query({ token })
      if (res.found) {
        version = res.version
        localStorage.setItem(STORAGE_KEY, res.data)
        window.location.reload()
      }
    }
  } catch {
    failCount++
    if (failCount >= 3) setStatus('error') // 连续失败：阻塞提示网络异常
  }
}

/** 开启自动同步（30s 周期 + 页面隐藏时） */
export function startAutoSave() {
  if (started) return
  started = true
  // store 任何变化都标脏（persist 已同步写 localStorage，这里只决定是否上传）
  useGameStore.subscribe(() => { dirty = true; if (status === 'synced') setStatus('pending') })
  window.setInterval(() => { if (dirty) void flushSave() }, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) void flushSave()
  })
  window.addEventListener('beforeunload', () => { void flushSave() })
}

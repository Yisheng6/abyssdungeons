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

/** 登录后调用：拉取云存档覆盖本地。返回是否有云端存档 */
export async function loadCloudSave(): Promise<boolean> {
  const token = getToken()
  if (!token) return false
  try {
    const res = await client.save.get.query({ token })
    if (res.found) {
      version = res.version
      localStorage.setItem(STORAGE_KEY, res.data)
      // 重新水合 store（复用 persist 的迁移/补全逻辑）
      await useGameStore.persist.rehydrate()
      return true
    }
    // 云端无存档：本地（含旧共享存档迁移来的）将作为初始档，标记待上传
    dirty = true
    return false
  } catch {
    // 网络失败：用本地存档离线玩，恢复后自动补传
    dirty = true
    return false
  }
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
    } else if (r.conflict) {
      // 其他设备有更新存档：服务器为准，覆盖本地后刷新页面
      const res = await client.save.get.query({ token })
      if (res.found) {
        version = res.version
        localStorage.setItem(STORAGE_KEY, res.data)
        window.location.reload()
      }
    }
  } catch { /* 失败等下个周期重试 */ }
}

/** 开启自动同步（30s 周期 + 页面隐藏时） */
export function startAutoSave() {
  if (started) return
  started = true
  // store 任何变化都标脏（persist 已同步写 localStorage，这里只决定是否上传）
  useGameStore.subscribe(() => { dirty = true })
  window.setInterval(() => { if (dirty) void flushSave() }, 30000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) void flushSave()
  })
  window.addEventListener('beforeunload', () => { void flushSave() })
}

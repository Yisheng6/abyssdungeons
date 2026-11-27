// 共享的 vanilla tRPC 客户端（供非 React 模块调用，如云存档、战斗会话）
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '../../api/router'

export const apiClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
})

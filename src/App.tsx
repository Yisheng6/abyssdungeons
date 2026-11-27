import { Routes, Route, Navigate, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { isLoggedIn } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Town from './pages/Town'
import Combat from './pages/Combat'
import CharacterPanel from './pages/CharacterPanel'
import Inventory from './pages/Inventory'
import Blacksmith from './pages/Blacksmith'
import Shop from './pages/Shop'
import Tasks from './pages/Tasks'
import Leaderboard from './pages/Leaderboard'
import Chat from './pages/Chat'
import Talents from './pages/Talents'
import Mail from './pages/Mail'
import NotFound from './pages/NotFound'

// 登录守卫：无 token 一律跳转登录页
function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!isLoggedIn()) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 共享布局：侧边导航 + 底部标签栏，所有页面都显示在主内容区 */}
      {/* 混乱深渊/守序深渊由 Layout 常驻挂载（切页签不卸载，战斗不中断），见 Layout.tsx */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Town />} />
        <Route path="/explore" element={null} />
        <Route path="/lawful" element={null} />
        <Route path="/rift" element={null} />
        <Route path="/weekly" element={null} />
        <Route path="/combat" element={<Combat />} />
        <Route path="/character" element={<CharacterPanel />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/blacksmith" element={<Blacksmith />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/talents" element={<Talents />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/mail" element={<Mail />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

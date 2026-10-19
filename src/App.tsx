import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Login from './pages/Login'
import Town from './pages/Town'
import Explore from './pages/Explore'
import Combat from './pages/Combat'
import CharacterPanel from './pages/CharacterPanel'
import Inventory from './pages/Inventory'
import Blacksmith from './pages/Blacksmith'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* 全屏模式页面（不进共享布局） */}
      <Route path="/explore" element={<Explore />} />
      <Route path="/combat" element={<Combat />} />
      {/* 共享布局：侧边导航 + 底部标签栏 */}
      <Route element={<Layout />}>
        <Route path="/" element={<Town />} />
        <Route path="/character" element={<CharacterPanel />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/blacksmith" element={<Blacksmith />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

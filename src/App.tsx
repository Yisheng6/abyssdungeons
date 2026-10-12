import { Routes, Route } from 'react-router'
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
      <Route path="/" element={<Town />} />
      <Route path="/login" element={<Login />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/combat" element={<Combat />} />
      <Route path="/character" element={<CharacterPanel />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/blacksmith" element={<Blacksmith />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

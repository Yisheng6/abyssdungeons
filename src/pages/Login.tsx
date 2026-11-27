import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router'
import { Sword } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { setAuth, isLoggedIn } from '@/lib/auth'

type Mode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const loginMut = trpc.account.login.useMutation()
  const registerMut = trpc.account.register.useMutation()

  // 已登录直接进游戏
  if (isLoggedIn()) return <Navigate to="/" replace />

  const validateLogin = () => {
    if (!username.trim()) return '请输入用户名'
    if (!password) return '请输入密码'
    return ''
  }

  const validateRegister = () => {
    if (!username.trim() || username.length < 2 || username.length > 16) return '用户名需 2-16 位'
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return '用户名只能包含字母、数字、下划线'
    if (!password || password.length < 8 || password.length > 32) return '密码需 8-32 位'
    if (password !== confirmPassword) return '两次输入的密码不一致'
    return ''
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    const err = mode === 'login' ? validateLogin() : validateRegister()
    if (err) { setError(err); return }

    setLoading(true)
    try {
      if (mode === 'register') {
        await registerMut.mutateAsync({ username: username.trim(), password })
        setSuccess('注册成功，请登录')
        setMode('login')
        setPassword('')
        setConfirmPassword('')
      } else {
        const r = await loginMut.mutateAsync({ username: username.trim(), password })
        setAuth(r.token, r.username)
        navigate('/')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at center, #1A2332 0%, #0D1117 100%)' }}>
      {/* Particles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="absolute rounded-full opacity-20"
            style={{
              width: 2 + Math.random() * 3,
              height: 2 + Math.random() * 3,
              backgroundColor: '#C9A84C',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${8 + Math.random() * 12}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-20px)} }`}</style>

      <div className="game-card w-full max-w-[420px] space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Sword className="mx-auto mb-2" style={{ color: 'var(--accent)', width: 36, height: 36 }} />
          <h1 className="text-2xl font-bold tracking-wider" style={{ color: 'var(--accent)', fontFamily: 'Georgia, serif' }}>
            深渊地城
          </h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>ABYSS DUNGEONS</p>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => { setMode('login'); setError(''); setSuccess('') }}
            className="flex-1 pb-2 text-sm font-medium transition-colors"
            style={{
              color: mode === 'login' ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: mode === 'login' ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
            登录
          </button>
          <button onClick={() => { setMode('register'); setError(''); setSuccess('') }}
            className="flex-1 pb-2 text-sm font-medium transition-colors"
            style={{
              color: mode === 'register' ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: mode === 'register' ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
            注册
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {error && <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(248,81,73,0.15)', color: 'var(--danger)' }}>{error}</div>}
          {success && <div className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(63,185,80,0.15)', color: 'var(--success)' }}>{success}</div>}

          <div>
            <label className="mb-1 block text-xs" style={{ color: 'var(--text-secondary)' }}>用户名</label>
            <input className="game-input w-full" placeholder={mode === 'register' ? '2-16位字母/数字/下划线' : '请输入用户名'}
              value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} />
          </div>

          <div>
            <label className="mb-1 block text-xs" style={{ color: 'var(--text-secondary)' }}>密码</label>
            <input className="game-input w-full" placeholder="8-32位密码" type="password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-xs" style={{ color: 'var(--text-secondary)' }}>确认密码</label>
              <input className="game-input w-full" placeholder="再次输入密码" type="password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          )}

          <button className="game-btn-primary w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '进入深渊' : '创建角色'}
          </button>
        </div>

      </div>
    </div>
  )
}

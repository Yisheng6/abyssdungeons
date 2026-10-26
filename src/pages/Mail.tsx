import { useState } from 'react'
import { Mail, MailOpen, Gift, Trash2, Inbox, Coins, Gem, Package } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'

interface MailItem {
  id: string; title: string; content: string
  attachments: Array<{ kind: string; amount?: number; itemId?: string; quantity?: number }>
  createdAt: number; expiresAt: number; read: boolean; claimed: boolean; tag?: string
}

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const attText = (a: { kind: string; amount?: number; itemId?: string; quantity?: number }, itemName?: string) =>
  a.kind === 'gold' ? `金币 ×${a.amount}` : a.kind === 'diamonds' ? `钻石 ×${a.amount}` : `${itemName || a.itemId} ×${a.quantity || 1}`

export default function MailPage() {
  const store = useGameStore()
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const listQ = trpc.mail.list.useQuery({ playerName }, { refetchInterval: 30000 })
  const readMut = trpc.mail.read.useMutation()
  const claimMut = trpc.mail.claim.useMutation()
  const removeMut = trpc.mail.remove.useMutation()
  const [selected, setSelected] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const mails = (listQ.data || []) as MailItem[]
  const cur = mails.find((m) => m.id === selected) || null

  const refresh = () => listQ.refetch()

  const openMail = (m: MailItem) => {
    setSelected(m.id)
    if (!m.read) readMut.mutate({ playerName, mailId: m.id }, { onSuccess: refresh })
  }

  const claim = (m: MailItem) => {
    claimMut.mutate({ playerName, mailId: m.id }, {
      onSuccess: (r) => {
        if (!r.success) { setMsg(r.message); return }
        if (r.gold > 0) store.addPlayerGold(r.gold)
        if (r.diamonds > 0) store.addPlayerDiamonds(r.diamonds)
        for (const it of r.items) {
          store.addItem({
            uid: '', id: it.itemId, name: it.name, type: (it.type || 'material') as never,
            quality: (it.quality || 'common') as never, quantity: it.quantity,
            desc: '', stats: it.stats, affixes: it.affixes, slot: it.slot as never,
            setId: it.setId, setTier: it.setTier, value: it.value,
            effect: it.effect as never,
            learnSkillId: it.learnSkillId,
          })
        }
        setMsg(`领取成功：${[r.gold > 0 ? `金币×${r.gold}` : '', r.diamonds > 0 ? `钻石×${r.diamonds}` : '', r.items.length > 0 ? `道具×${r.items.reduce((a, i) => a + i.quantity, 0)}` : ''].filter(Boolean).join('、')}`)
        refresh()
      },
    })
  }

  const remove = (m: MailItem) => {
    removeMut.mutate({ playerName, mailId: m.id }, {
      onSuccess: (r) => { setMsg(r.message); if (r.success) setSelected(null); refresh() },
    })
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Mail size={20} style={{ color: 'var(--accent)' }} />
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>邮箱</h1>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>邮件保留 14 天</span>
      </div>

      {msg && (
        <div className="game-card mb-3 p-2 text-center text-xs" style={{ color: '#3FB950' }} onClick={() => setMsg('')}>{msg}</div>
      )}

      {mails.length === 0 ? (
        <div className="game-card flex flex-col items-center gap-2 p-10 text-sm" style={{ color: 'var(--text-muted)' }}>
          <Inbox size={32} />
          暂无邮件
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {/* 列表 */}
          <div className="space-y-2">
            {mails.map((m) => (
              <button key={m.id} onClick={() => openMail(m)}
                className="game-card flex w-full items-center gap-2 p-3 text-left transition-all hover:scale-[1.01]"
                style={{ borderColor: selected === m.id ? 'var(--accent)' : undefined }}>
                {m.read ? <MailOpen size={16} style={{ color: 'var(--text-muted)' }} /> : <Mail size={16} style={{ color: 'var(--accent)' }} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm" style={{ color: m.read ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: m.read ? 400 : 700 }}>
                    {m.title}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {fmtTime(m.createdAt)}
                    {m.attachments.length > 0 && !m.claimed && <span style={{ color: '#C9A84C' }}> · 含附件</span>}
                  </div>
                </div>
                {m.attachments.length > 0 && !m.claimed && <Gift size={14} style={{ color: '#C9A84C' }} />}
              </button>
            ))}
          </div>

          {/* 详情 */}
          <div>
            {cur ? (
              <div className="game-card p-4">
                <div className="mb-1 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{cur.title}</div>
                <div className="mb-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {fmtTime(cur.createdAt)} · {Math.max(0, Math.ceil((cur.expiresAt - Date.now()) / 86400000))} 天后过期
                </div>
                <div className="mb-4 whitespace-pre-wrap text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {cur.content}
                </div>

                {cur.attachments.length > 0 && (
                  <div className="mb-4 rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                      <Package size={11} /> 附件
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cur.attachments.map((a, i) => (
                        <span key={i} className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px]"
                          style={{ backgroundColor: 'var(--bg-card)', color: cur.claimed ? 'var(--text-muted)' : '#C9A84C' }}>
                          {a.kind === 'gold' ? <Coins size={10} /> : a.kind === 'diamonds' ? <Gem size={10} /> : <Package size={10} />}
                          {attText(a)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {cur.attachments.length > 0 && !cur.claimed && (
                    <button onClick={() => claim(cur)} disabled={claimMut.isPending}
                      className="flex-1 rounded py-1.5 text-xs font-bold"
                      style={{ backgroundColor: '#C9A84C', color: '#000' }}>
                      领取附件
                    </button>
                  )}
                  <button onClick={() => remove(cur)} disabled={removeMut.isPending}
                    className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="game-card flex h-full items-center justify-center p-10 text-xs" style={{ color: 'var(--text-muted)' }}>
                选择一封邮件查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

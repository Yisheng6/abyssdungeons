import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { useSocket } from '@/hooks/useSocket'
import { trpc } from '@/providers/trpc'

interface ChatMsg { senderId: string; senderName: string; content: string; time: number }

export default function Chat() {
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const { sendChat, onChatMessage } = useSocket(playerName, playerName)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const historyQ = trpc.chat.history.useQuery({ channel: 'world', count: 50 })

  useEffect(() => {
    if (historyQ.data) setMessages(historyQ.data as ChatMsg[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQ.data])

  useEffect(() => {
    const off = onChatMessage((msg) => setMessages((m) => [...m.slice(-99), msg]))
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text) return
    sendChat('world', text)
    setInput('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <h2 className="mb-2 flex flex-shrink-0 items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        <MessageSquare size={15} style={{ color: 'var(--accent)' }} /> 世界频道
      </h2>

      <div className="game-card min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>还没有消息，来说第一句吧</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="text-xs leading-relaxed">
            <span className="font-medium" style={{ color: m.senderId === playerName ? 'var(--accent)' : '#79C0FF' }}>
              {m.senderName}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>：</span>
            <span style={{ color: 'var(--text-primary)' }}>{m.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mt-2 flex flex-shrink-0 gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          maxLength={200}
          placeholder="输入消息，回车发送…"
          className="flex-1 rounded-lg border px-3 py-2 text-xs outline-none"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
        />
        <button onClick={send}
          className="flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-bold transition-all active:scale-95"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Send size={13} /> 发送
        </button>
      </div>
    </div>
  )
}

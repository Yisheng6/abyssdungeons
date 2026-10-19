import { useEffect, useState } from 'react'
import { Trophy, Medal } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'

const CATEGORIES = [
  { id: 'deepest_layer' as const, name: '混乱深渊', suffix: '层' },
  { id: 'lawful_layer' as const, name: '守序深渊', suffix: '层' },
  { id: 'kills' as const, name: '累计击杀', suffix: '' },
  { id: 'wealth' as const, name: '财富', suffix: '金币' },
]

interface RankEntry { player: string; score: number; rank: number; meta?: { name?: string } }

export default function Leaderboard() {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]['id']>('deepest_layer')
  const [list, setList] = useState<RankEntry[]>([])
  const [myRank, setMyRank] = useState<number | null>(null)
  const player = useGameStore((s) => s.player)
  const playerName = localStorage.getItem('ad_user') || ''
  const getTopMut = trpc.lb.getTop.useQuery({ category: cat, count: 20 })
  const submitMut = trpc.lb.submitScore.useMutation()
  const myRankQ = trpc.lb.getMyRank.useQuery({ category: cat, playerId: playerName }, { enabled: !!playerName })

  // 上榜：提交当前玩家成绩
  useEffect(() => {
    if (!playerName || !player) return
    const score = cat === 'deepest_layer' ? (player.maxLayer || 1)
      : cat === 'wealth' ? player.gold
      : 0
    if (score > 0) {
      submitMut.mutateAsync({ category: cat, playerId: playerName, playerName, score }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, playerName])

  useEffect(() => { if (getTopMut.data) setList(getTopMut.data as RankEntry[]) }, [getTopMut.data])
  useEffect(() => { if (myRankQ.data) setMyRank(myRankQ.data.rank ?? null) }, [myRankQ.data])

  const rankColor = (i: number) => i === 0 ? '#F0D878' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)'
  const cur = CATEGORIES.find((c) => c.id === cat)!

  return (
    <div className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        <Trophy size={16} style={{ color: 'var(--accent)' }} /> 排行榜
      </h2>

      <div className="mb-3 flex gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className="rounded-full px-3 py-1 text-xs transition-colors"
            style={{
              backgroundColor: cat === c.id ? 'rgba(201,168,76,0.25)' : 'var(--bg-card)',
              color: cat === c.id ? '#C9A84C' : 'var(--text-muted)',
              border: cat === c.id ? '1px solid #C9A84C' : '1px solid var(--border-color)',
            }}>
            {c.name}
          </button>
        ))}
      </div>

      {myRank !== null && myRank > 0 && (
        <div className="mb-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', backgroundColor: 'rgba(201,168,76,0.08)' }}>
          我的排名：第 {myRank} 名
        </div>
      )}

      <div className="space-y-1.5">
        {list.length === 0 && (
          <div className="game-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            暂无数据，成为第一个上榜的冒险者吧！
          </div>
        )}
        {list.map((e, i) => (
          <div key={`${e.player}-${i}`}
            className="game-card flex items-center gap-3 px-3 py-2"
            style={e.player === playerName ? { borderColor: 'var(--accent)' } : undefined}>
            <span className="flex w-8 items-center justify-center" style={{ color: rankColor(i) }}>
              {i < 3 ? <Medal size={16} /> : <span className="text-xs">{i + 1}</span>}
            </span>
            <span className="flex-1 truncate text-sm" style={{ color: 'var(--text-primary)' }}>
              {e.meta?.name || e.player}
              {e.player === playerName && <span className="ml-1 text-[10px]" style={{ color: 'var(--accent)' }}>（我）</span>}
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
              {e.score}{cur.suffix && <span className="ml-0.5 text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>{cur.suffix}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

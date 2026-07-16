import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─── Types ───

export interface Player {
  id: string; name: string; classId: string; level: number
  hp: number; maxHp: number; mp: number; maxMp: number
  atk: number; def: number; mag: number; mdef: number; agi: number; luk: number
  skills: string[]; element: string; exp: number; gold: number
}

export interface Item {
  uid: string; id: string; name: string; type: 'equipment' | 'consumable'
  slot?: 'weapon' | 'helmet' | 'armor' | 'leggings' | 'boots' | 'necklace' | 'ring'
  quality: 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'mythic'
  quantity: number; desc: string; stats?: Record<string, number>
}

export interface Equipment {
  weapon: Item | null; helmet: Item | null; armor: Item | null
  leggings: Item | null; boots: Item | null; necklace: Item | null
  ring1: Item | null; ring2: Item | null
}

/** Each class only saves: player + what's EQUIPPED. Backpack is shared. */
export interface ClassSave {
  player: Player
  equipment: Equipment
}

interface Enemy {
  id: string; name: string; hp: number; maxHp: number
  mp: number; maxMp: number; atk: number; def: number
  mag: number; mdef: number; agi: number; luk: number
  skills: string[]; element: string; aiType?: string
}

interface RoomInfo {
  roomId: number; type: string; themeName: string; themeDescription: string
  directions: Array<{ direction: string; roomId: number }>
  enemies: Array<{ id: string; name: string; hp: number; maxHp: number }>
  loot: Array<{ itemId: string; quality?: string; quantity: number }>
  isEntrance: boolean; isExit: boolean
}

interface GameState {
  // ─── Auth ───
  isLoggedIn: boolean; playerName: string

  // ─── Multi-Class: per-class saves (player + equipped gear only) ───
  classSaves: Record<string, ClassSave>
  activeClassId: string
  lastClassSwitch: number
  switchCooldownMs: number

  // ─── SHARED backpack (all classes see the same items) ───
  inventory: Item[]

  // ─── Runtime: current class ───
  player: Player | null
  equipment: Equipment

  // ─── Dungeon ───
  currentDungeon: { seed: string; layer: number; x: number; y: number; theme: string; roomCount: number } | null
  currentRoomId: number; exploredRooms: Set<number>
  roomInfo: RoomInfo | null
  dungeonRooms: Array<{ id: number; type: string; x: number; y: number; connections: number[]; explored: boolean }>

  // ─── Combat ───
  inCombat: boolean; combatEnemies: Enemy[]; combatLogs: string[]
  combatEnded: boolean; combatVictory: boolean

  // ─── Actions ───
  setLoggedIn: (v: boolean) => void
  setPlayerName: (v: string) => void

  createPlayer: (classId: string, classStats: Record<string, number>) => boolean
  switchClass: (classId: string) => { success: boolean; message: string }
  getClassCooldownRemaining: () => number
  getSavedClassIds: () => string[]

  setPlayer: (p: Player | null) => void
  updatePlayerHp: (hp: number) => void
  updatePlayerMp: (mp: number) => void
  addPlayerExp: (amount: number) => void
  addPlayerGold: (amount: number) => void

  // Equipment (affects current class save)
  equipItem: (itemUid: string) => void
  unequipItem: (slot: keyof Equipment) => void
  getEquipSlot: (item: Item) => keyof Equipment | null
  syncClassEquipment: () => void

  // Shared inventory
  addItem: (item: Item) => void
  removeItem: (itemUid: string) => void

  // Dungeon
  setCurrentDungeon: (d: GameState['currentDungeon']) => void
  setCurrentRoomId: (id: number) => void
  setRoomInfo: (r: RoomInfo | null) => void
  setDungeonRooms: (r: GameState['dungeonRooms']) => void
  addExploredRoom: (id: number) => void

  // Combat
  setInCombat: (v: boolean) => void
  setCombatEnemies: (e: Enemy[]) => void
  addCombatLog: (log: string) => void
  setCombatEnded: (v: boolean) => void
  setCombatVictory: (v: boolean) => void
  resetCombat: () => void
  resetDungeon: () => void
}

const defaultEquipment: Equipment = {
  weapon: null, helmet: null, armor: null,
  leggings: null, boots: null, necklace: null, ring1: null, ring2: null,
}

const equipSlots: Record<string, keyof Equipment> = {
  weapon: 'weapon', helmet: 'helmet', armor: 'armor',
  leggings: 'leggings', boots: 'boots', necklace: 'necklace',
  ring: 'ring1',
}

const DEFAULT_CLASS_STATS: Record<string, Record<string, number>> = {
  warrior:  { hp: 150, mp: 30, atk: 15, def: 12, mag: 2, mdef: 8, agi: 6, luk: 5 },
  mage:     { hp: 80,  mp: 100, atk: 5, def: 4, mag: 18, mdef: 12, agi: 7, luk: 8 },
  assassin: { hp: 100, mp: 50, atk: 18, def: 6, mag: 4, mdef: 5, agi: 16, luk: 10 },
  ranger:   { hp: 110, mp: 45, atk: 14, def: 7, mag: 6, mdef: 7, agi: 14, luk: 9 },
  priest:   { hp: 100, mp: 80, atk: 6, def: 6, mag: 14, mdef: 14, agi: 6, luk: 7 },
  warlock:  { hp: 90,  mp: 90, atk: 7, def: 5, mag: 16, mdef: 10, agi: 8, luk: 12 },
}

const STORAGE_KEY = 'abyss-game-save'

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // ─── Initial ───
      isLoggedIn: false, playerName: '',
      classSaves: {}, activeClassId: '',
      lastClassSwitch: 0, switchCooldownMs: 5000,
      inventory: [],
      player: null, equipment: { ...defaultEquipment },
      currentDungeon: null, currentRoomId: 0, exploredRooms: new Set(),
      roomInfo: null, dungeonRooms: [],
      inCombat: false, combatEnemies: [], combatLogs: [],
      combatEnded: false, combatVictory: false,

      // ─── Auth ───
      setLoggedIn: (v) => set({ isLoggedIn: v }),
      setPlayerName: (v) => set({ playerName: v }),

      // ─── Create Player ───
      createPlayer: (classId, classStats) => {
        const state = get()
        const name = state.playerName || localStorage.getItem('ad_user') || '冒险者'
        const stats = classStats || DEFAULT_CLASS_STATS[classId] || DEFAULT_CLASS_STATS.warrior

        const newPlayer: Player = {
          id: `p_${Date.now()}`, name, classId, level: 1,
          hp: stats.hp || 100, maxHp: stats.hp || 100,
          mp: stats.mp || 50, maxMp: stats.mp || 50,
          atk: stats.atk || 10, def: stats.def || 10,
          mag: stats.mag || 10, mdef: stats.mdef || 8,
          agi: stats.agi || 10, luk: stats.luk || 5,
          skills: [], element: 'none', exp: 0, gold: 0,
        }

        const classSave: ClassSave = { player: newPlayer, equipment: { ...defaultEquipment } }

        // Starter items go to SHARED inventory
        const starterItems = getStarterItems(classId)
        const newInventory = [...state.inventory]
        for (const item of starterItems) {
          const existing = newInventory.find((i) => i.id === item.id && i.type === 'consumable')
          if (existing && item.type === 'consumable') {
            existing.quantity += item.quantity
          } else {
            newInventory.push(item)
          }
        }

        set({
          classSaves: { ...state.classSaves, [classId]: classSave },
          activeClassId: classId,
          player: newPlayer,
          equipment: { ...defaultEquipment },
          inventory: newInventory,
        })
        return true
      },

      // ─── Switch Class: backpack stays, equipment swaps ───
      switchClass: (targetClassId) => {
        const state = get()
        const now = Date.now()
        const elapsed = now - state.lastClassSwitch

        if (elapsed < state.switchCooldownMs) {
          return { success: false, message: `冷却中，还需 ${Math.ceil((state.switchCooldownMs - elapsed) / 1000)} 秒` }
        }
        if (targetClassId === state.activeClassId) {
          return { success: false, message: '已是当前职业' }
        }
        if (state.inCombat) {
          return { success: false, message: '战斗中无法切换' }
        }

        // 1. Save current class: player + equipment (inventory stays shared, no save needed)
        const updatedSaves = { ...state.classSaves }
        if (state.activeClassId && state.player) {
          updatedSaves[state.activeClassId] = {
            player: { ...state.player },
            equipment: { ...state.equipment },
          }
        }

        // 2. Load or create target class
        let targetSave = updatedSaves[targetClassId]
        if (!targetSave) {
          const stats = DEFAULT_CLASS_STATS[targetClassId] || DEFAULT_CLASS_STATS.warrior
          const name = state.playerName || localStorage.getItem('ad_user') || '冒险者'
          targetSave = {
            player: {
              id: `p_${Date.now()}`, name, classId: targetClassId, level: 1,
              hp: stats.hp || 100, maxHp: stats.hp || 100,
              mp: stats.mp || 50, maxMp: stats.mp || 50,
              atk: stats.atk || 10, def: stats.def || 10,
              mag: stats.mag || 10, mdef: stats.mdef || 8,
              agi: stats.agi || 10, luk: stats.luk || 5,
              skills: [], element: 'none', exp: 0, gold: 0,
            },
            equipment: { ...defaultEquipment },
          }
        }

        set({
          classSaves: { ...updatedSaves, [targetClassId]: targetSave },
          activeClassId: targetClassId,
          lastClassSwitch: now,
          player: targetSave.player,
          equipment: targetSave.equipment,
          // inventory is NOT changed — shared!
        })

        return { success: true, message: '职业切换成功' }
      },

      getClassCooldownRemaining: () => {
        const s = get()
        return Math.max(0, s.switchCooldownMs - (Date.now() - s.lastClassSwitch))
      },

      getSavedClassIds: () => Object.keys(get().classSaves),

      // ─── Player ───
      setPlayer: (p) => set({ player: p }),

      updatePlayerHp: (hp) => {
        const s = get()
        if (!s.player) return
        const newPlayer = { ...s.player, hp: Math.max(0, Math.min(s.player.maxHp, hp)) }
        const newSaves = { ...s.classSaves }
        if (s.activeClassId) newSaves[s.activeClassId] = { ...newSaves[s.activeClassId], player: newPlayer }
        set({ player: newPlayer, classSaves: newSaves })
      },

      updatePlayerMp: (mp) => {
        const s = get()
        if (!s.player) return
        const newPlayer = { ...s.player, mp: Math.max(0, Math.min(s.player.maxMp, mp)) }
        const newSaves = { ...s.classSaves }
        if (s.activeClassId) newSaves[s.activeClassId] = { ...newSaves[s.activeClassId], player: newPlayer }
        set({ player: newPlayer, classSaves: newSaves })
      },

      addPlayerExp: (amount) => {
        const s = get()
        if (!s.player) return
        const np = { ...s.player, exp: s.player.exp + amount }
        const need = np.level * 100
        if (np.exp >= need) {
          np.level += 1; np.exp -= need
          np.maxHp += 10; np.hp = np.maxHp
          np.maxMp += 5; np.mp = np.maxMp
          np.atk += 2; np.def += 1
          np.mag += 1; np.mdef += 1
          np.agi += 1
        }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
      },

      addPlayerGold: (amount) => {
        const s = get()
        if (!s.player) return
        const np = { ...s.player, gold: s.player.gold + amount }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
      },

      // ─── Equipment ───
      equipItem: (itemUid) => {
        const s = get()
        const idx = s.inventory.findIndex((i) => i.uid === itemUid)
        if (idx === -1) return
        const item = s.inventory[idx]
        if (item.type !== 'equipment') return

        const slot = get().getEquipSlot(item)
        if (!slot) return

        // Remove from inventory
        const newInv = [...s.inventory]
        newInv.splice(idx, 1)

        // If slot occupied, return old equip to inventory
        const oldEquip = s.equipment[slot]
        if (oldEquip) newInv.push(oldEquip)

        const newEquip = { ...s.equipment, [slot]: item }

        // Apply stat bonuses
        let newPlayer = s.player ? { ...s.player } : null
        if (newPlayer && item.stats) {
          for (const [stat, val] of Object.entries(item.stats)) {
            if (stat in newPlayer) (newPlayer as Record<string, number>)[stat] += val
          }
        }
        // Remove old equip stats
        if (newPlayer && oldEquip?.stats) {
          for (const [stat, val] of Object.entries(oldEquip.stats)) {
            if (stat in newPlayer) (newPlayer as Record<string, number>)[stat] -= val
          }
        }

        // Sync to classSave
        const ns = { ...s.classSaves }
        if (s.activeClassId) {
          ns[s.activeClassId] = { player: newPlayer || ns[s.activeClassId].player, equipment: newEquip }
        }

        set({ inventory: newInv, equipment: newEquip, player: newPlayer, classSaves: ns })
      },

      unequipItem: (slot) => {
        const s = get()
        const item = s.equipment[slot]
        if (!item) return

        const newEquip = { ...s.equipment, [slot]: null }
        const newInv = [...s.inventory, item]

        // Remove stat bonuses
        let newPlayer = s.player ? { ...s.player } : null
        if (newPlayer && item.stats) {
          for (const [stat, val] of Object.entries(item.stats)) {
            if (stat in newPlayer) (newPlayer as Record<string, number>)[stat] -= val
          }
        }

        const ns = { ...s.classSaves }
        if (s.activeClassId) {
          ns[s.activeClassId] = { player: newPlayer || ns[s.activeClassId].player, equipment: newEquip }
        }

        set({ inventory: newInv, equipment: newEquip, player: newPlayer, classSaves: ns })
      },

      getEquipSlot: (item) => {
        if (!item.slot) return null
        if (item.slot === 'ring') return get().equipment.ring1 ? 'ring2' : 'ring1'
        return equipSlots[item.slot] || null
      },

      syncClassEquipment: () => {
        const s = get()
        if (!s.activeClassId) return
        const ns = { ...s.classSaves }
        ns[s.activeClassId] = { ...ns[s.activeClassId], equipment: { ...s.equipment } }
        set({ classSaves: ns })
      },

      // ─── Shared Inventory ───
      addItem: (item) => {
        const s = get()
        const existing = s.inventory.find((i) => i.id === item.id && i.type === 'consumable')
        if (existing && item.type === 'consumable') {
          set({
            inventory: s.inventory.map((i) =>
              i.uid === existing.uid ? { ...i, quantity: i.quantity + item.quantity } : i
            )
          })
        } else {
          set({ inventory: [...s.inventory, { ...item, uid: item.uid || `i_${Date.now()}_${Math.random().toString(36).slice(2)}` }] })
        }
      },

      removeItem: (itemUid) => {
        set({ inventory: get().inventory.filter((i) => i.uid !== itemUid) })
      },

      // ─── Dungeon ───
      setCurrentDungeon: (d) => set({ currentDungeon: d }),
      setCurrentRoomId: (id) => set({ currentRoomId: id }),
      setRoomInfo: (r) => set({ roomInfo: r }),
      setDungeonRooms: (r) => set({ dungeonRooms: r }),
      addExploredRoom: (id) => set((s) => ({ exploredRooms: new Set([...s.exploredRooms, id]) })),

      // ─── Combat ───
      setInCombat: (v) => set({ inCombat: v }),
      setCombatEnemies: (e) => set({ combatEnemies: e }),
      addCombatLog: (log) => set((s) => ({ combatLogs: [...s.combatLogs, log] })),
      setCombatEnded: (v) => set({ combatEnded: v }),
      setCombatVictory: (v) => set({ combatVictory: v }),
      resetCombat: () => set({ inCombat: false, combatEnemies: [], combatLogs: [], combatEnded: false, combatVictory: false }),
      resetDungeon: () => set({ currentDungeon: null, currentRoomId: 0, exploredRooms: new Set(), roomInfo: null, dungeonRooms: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        playerName: state.playerName,
        classSaves: state.classSaves,
        activeClassId: state.activeClassId,
        lastClassSwitch: state.lastClassSwitch,
        switchCooldownMs: state.switchCooldownMs,
        inventory: state.inventory,        // SHARED — persisted once
        player: state.player,
        equipment: state.equipment,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.exploredRooms = new Set()
          state.combatLogs = []
          state.inCombat = false
          state.combatEnemies = []
          state.combatEnded = false
          state.combatVictory = false
        }
      },
    }
  )
)

// ─── Starter Items ───
function getStarterItems(classId: string): Item[] {
  const common: Item[] = [
    { uid: `hp_${Date.now()}_1`, id: 'hp_small', name: '小型生命药水', type: 'consumable', quality: 'common', quantity: 5, desc: '恢复 50 点 HP' },
    { uid: `hp_${Date.now()}_2`, id: 'mp_small', name: '小型法力药水', type: 'consumable', quality: 'common', quantity: 3, desc: '恢复 30 点 MP' },
    { uid: `scroll_${Date.now()}`, id: 'scroll_town', name: '回城卷轴', type: 'consumable', quality: 'fine', quantity: 1, desc: '返回城镇' },
  ]

  const weapons: Record<string, Item> = {
    warrior:  { uid: `w_${Date.now()}`, id: 'sword_trainee', name: '训练用剑', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '新兵训练用的铁剑', stats: { atk: 3 } },
    mage:     { uid: `w_${Date.now()}`, id: 'wand_apprentice', name: '学徒法杖', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '法师学徒的基础法杖', stats: { mag: 3 } },
    assassin: { uid: `w_${Date.now()}`, id: 'dagger_trainee', name: '训练匕首', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '轻巧的训练匕首', stats: { atk: 3, agi: 1 } },
    ranger:   { uid: `w_${Date.now()}`, id: 'bow_trainee', name: '训练短弓', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '基础训练短弓', stats: { atk: 2, agi: 1 } },
    priest:   { uid: `w_${Date.now()}`, id: 'mace_trainee', name: '祈祷之锤', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '祭司训练用锤', stats: { atk: 1, mag: 2 } },
    warlock:  { uid: `w_${Date.now()}`, id: 'orb_trainee', name: '灵魂之球', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '术士训练用法器', stats: { mag: 3 } },
  }

  return [...common, weapons[classId] || weapons.warrior]
}

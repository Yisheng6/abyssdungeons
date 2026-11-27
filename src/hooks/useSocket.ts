import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

let globalSocket: Socket | null = null

export function getSocket(): Socket | null {
  return globalSocket
}

export function useSocket(playerId: string, playerName: string, token?: string) {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = io('/', {
      path: '/socket.io',
      query: { playerId, playerName, token: token || '' },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    socketRef.current = socket
    globalSocket = socket

    socket.on('connect', () => {
      console.log('[Socket] connected')
      socket.emit('chat:join', 'world')
    })

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected')
    })

    socket.on('connect_error', (err) => {
      console.log('[Socket] error:', err.message)
    })

    return () => {
      socket.disconnect()
      globalSocket = null
    }
  }, [playerId, playerName, token])

  const sendChat = useCallback((channel: string, content: string) => {
    socketRef.current?.emit('chat:message', { channel, content })
  }, [])

  const joinChat = useCallback((channel: string) => {
    socketRef.current?.emit('chat:join', channel)
  }, [])

  const leaveChat = useCallback((channel: string) => {
    socketRef.current?.emit('chat:leave', channel)
  }, [])

  const onChatMessage = useCallback((handler: (msg: { senderId: string; senderName: string; content: string; time: number }) => void) => {
    socketRef.current?.on('chat:message', handler)
    return () => { socketRef.current?.off('chat:message', handler) }
  }, [])

  const onPlayerOnline = useCallback((handler: (data: { playerId: string; name: string }) => void) => {
    socketRef.current?.on('player:online', handler)
    return () => { socketRef.current?.off('player:online', handler) }
  }, [])

  const onPlayerOffline = useCallback((handler: (data: { playerId: string; name: string }) => void) => {
    socketRef.current?.on('player:offline', handler)
    return () => { socketRef.current?.off('player:offline', handler) }
  }, [])

  return {
    socket: socketRef.current,
    sendChat,
    joinChat,
    leaveChat,
    onChatMessage,
    onPlayerOnline,
    onPlayerOffline,
    isConnected: !!socketRef.current?.connected,
  }
}

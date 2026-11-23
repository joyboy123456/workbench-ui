'use client'
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Board, type BoardProps } from './board'
import { ChatPanel, type ChatPanelProps } from './chat-panel'
import type { createCanvasGraphStore, createChatStreamStore } from './workspace-stores'

// The controller owns actions that close over the current project and selection. Keep their
// public identity stable while dispatching to the latest committed implementation.
function usePanelProps<T extends object>(props: T): T {
  const committed = useRef(props)
  useLayoutEffect(() => { committed.current = props }, [props])
  const handlers = useRef(new Map<keyof T, (...args: unknown[]) => unknown>()).current
  const result = { ...props }
  for (const key of Object.keys(props) as (keyof T)[]) {
    if (typeof props[key] !== 'function') continue
    let handler = handlers.get(key)
    if (!handler) {
      handler = (...args) => {
        const callback = committed.current[key]
        if (typeof callback === 'function') return callback(...args)
      }
      handlers.set(key, handler)
    }
    result[key] = handler as T[keyof T]
  }
  return result
}

export function WorkspaceBoard({ graph, ...props }: Omit<BoardProps, 'items' | 'selected'> & { graph: ReturnType<typeof createCanvasGraphStore> }) {
  const items = useSyncExternalStore(graph.live.subscribe, graph.live.getSnapshot, graph.live.getSnapshot)
  const selected = useSyncExternalStore(graph.selection.subscribe, graph.selection.getSnapshot, graph.selection.getSnapshot)
  return <Board {...usePanelProps(props)} items={items} selected={selected} />
}

export function WorkspaceChat({ chat, ...props }: Omit<ChatPanelProps, 'messages'> & { chat: ReturnType<typeof createChatStreamStore> }) {
  const messages = useSyncExternalStore(chat.messages.subscribe, chat.messages.getSnapshot, chat.messages.getSnapshot)
  return <ChatPanel {...usePanelProps(props)} messages={messages} />
}

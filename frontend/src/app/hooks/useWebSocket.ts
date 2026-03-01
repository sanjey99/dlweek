import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = ((import.meta as any).env?.VITE_WS_URL || 'ws://localhost:4000') + '/ws';

export type WSMessage =
  | { type: 'init'; actions: unknown[]; total: number }
  | { type: 'new_action'; action: unknown }
  | { type: 'action_updated'; action: unknown }
  | { type: 'upload_progress'; sessionId: string; processed: number; total: number }
  | { type: 'upload_complete'; sessionId: string; total: number };

interface UseWebSocketOptions {
  onMessage: (msg: WSMessage) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useWebSocket({ onMessage, onConnectionChange }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        onConnectionChange?.(true);
        console.log('[WS] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          onMessageRef.current(msg);
        } catch {
          console.warn('[WS] Failed to parse message');
        }
      };

      ws.onclose = () => {
        setConnected(false);
        onConnectionChange?.(false);
        console.log('[WS] Disconnected — reconnecting in 3s');
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [onConnectionChange]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current !== null) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}

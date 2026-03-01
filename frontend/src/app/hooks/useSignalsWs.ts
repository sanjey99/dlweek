import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsSignalEvent } from '../../api/client';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

interface UseSignalsWsOptions {
  /** Called for every governance event (action_updated, new_action, etc.) */
  onEvent: (evt: WsSignalEvent) => void;
  /** Min reconnect delay in ms (default 1000) */
  minDelay?: number;
  /** Max reconnect delay in ms (default 30000) */
  maxDelay?: number;
}

/**
 * React hook that maintains a WebSocket connection to `/ws/signals`
 * with exponential backoff reconnect and truthful connection status.
 */
export function useSignalsWs({
  onEvent,
  minDelay = 1_000,
  maxDelay = 30_000,
}: UseSignalsWsOptions) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const disposedRef = useRef(false);
  // Stable ref for callback so reconnects always use the latest handler
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (disposedRef.current) return;

    setStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/signals`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) { ws.close(); return; }
      retriesRef.current = 0;
      setStatus('connected');
    };

    ws.onmessage = (msg) => {
      try {
        const data: WsSignalEvent = JSON.parse(msg.data);
        if (
          data.type === 'action_resolved' ||
          data.type === 'action_updated' ||
          data.type === 'new_action'
        ) {
          onEventRef.current(data);
        }
      } catch {
        // ignore non-JSON frames (market ticks, pings)
      }
    };

    ws.onclose = () => {
      if (disposedRef.current) return;
      setStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnect handled there
      ws.close();
    };

    function scheduleReconnect() {
      if (disposedRef.current) return;
      const attempt = retriesRef.current++;
      // Exponential backoff: min * 2^attempt, capped at max, with ±20% jitter
      const base = Math.min(minDelay * 2 ** attempt, maxDelay);
      const jitter = base * (0.8 + Math.random() * 0.4);
      setTimeout(() => connect(), jitter);
    }
  }, [minDelay, maxDelay]);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return status;
}

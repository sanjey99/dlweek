import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { TerminalSquare, Send, Bot, User, ShieldCheck, Sun, Moon } from 'lucide-react';
import { getTheme } from '../../utils/theme';
import { useIsMobile } from '../../utils/useIsMobile';

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(`Expected JSON response but got: ${preview || 'empty response'}`);
  }
}

export default function AgentTerminal() {
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const executedActionIdsRef = useRef(new Set());
  const proposalByActionIdRef = useRef({});
  const isExecutingRef = useRef(false);
  const activeContextRef = useRef({ action: '', content: '', fileName: '', fileType: '' });
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('sentinel-theme');
      if (stored === 'light') return false;
      if (stored === 'dark') return true;
    } catch { /* ignore */ }
    return true;
  });
  const [input, setInput] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [pollingStatus, setPollingStatus] = useState('IDLE');
  const [currentActionId, setCurrentActionId] = useState(() => {
    try {
      return sessionStorage.getItem('agentActionId') || null;
    } catch {
      return null;
    }
  });
  const [history, setHistory] = useState(() => {
    try {
      const stored = sessionStorage.getItem('agentMessages');
      if (!stored) {
        return [
          {
            id: 'm-1',
            role: 'system',
            text: 'Agent Terminal ready. Enter a simulated agent proposal message.',
            ts: new Date().toLocaleTimeString(),
          },
        ];
      }
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed)
        ? parsed
        : [
          {
            id: 'm-1',
            role: 'system',
            text: 'Agent Terminal ready. Enter a simulated agent proposal message.',
            ts: new Date().toLocaleTimeString(),
          },
        ];
    } catch {
      return [
        {
          id: 'm-1',
          role: 'system',
          text: 'Agent Terminal ready. Enter a simulated agent proposal message.',
          ts: new Date().toLocaleTimeString(),
        },
      ];
    }
  });

  const theme = getTheme(isDark);
  const isMobile = useIsMobile();

  const canSend = input.trim().length > 0;
  const placeholder = useMemo(
    () => 'Example: Propose deploy model_v2.4 to production with rollback plan attached',
    []
  );
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  async function fetchFinalTurn(promptText) {
    const response = await fetch('http://localhost:4000/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userInput: promptText,
        agent: 'OpenAI',
        isExecutionTurn: true,
        file: activeContextRef.current.content
          ? {
              name: activeContextRef.current.fileName || 'approved-context.txt',
              content: activeContextRef.current.content,
              type: activeContextRef.current.fileType || 'text/plain',
            }
          : undefined,
      }),
    });
    return response;
  }

  async function requestFinalOutput(actionId, previousProposal) {
    const followupPrompt = `HUMAN APPROVAL GRANTED. You previously proposed: "${previousProposal || activeContextRef.current.action || 'No proposal text available.'}". Using the provided file content, execute this change NOW. Return ONLY the updated code block or a completion summary. CRITICAL: Do not call any tools. Do not propose new actions. STOP after this response.
Approved Action ID: ${actionId}`;
    const response = await fetchFinalTurn(followupPrompt);
    if (!response.ok) {
      throw new Error(`Final output request failed with HTTP ${response.status}`);
    }
    const data = await parseJsonResponse(response);
    if (data?.type === 'text' && data?.message) return String(data.message);
    if (data?.type === 'tool_call') {
      const retryPrompt = `SYSTEM INSTRUCTION: Finalization retry. Do not propose any actions or tool calls. Return only the final updated file content (or a concise completion summary if no file edit is needed).`;
      const retryResponse = await fetchFinalTurn(retryPrompt);
      if (!retryResponse.ok) {
        throw new Error(`Final retry failed with HTTP ${retryResponse.status}`);
      }
      const retryData = await parseJsonResponse(retryResponse);
      if (retryData?.type === 'text' && retryData?.message) return String(retryData.message);
    }
    if (data?.message) return String(data.message);
    return 'Action approved and executed.';
  }

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  useEffect(() => {
    try {
      sessionStorage.setItem('agentMessages', JSON.stringify(history));
    } catch {
      // Ignore storage write failures.
    }
  }, [history]);

  useEffect(() => {
    try {
      if (currentActionId) {
        sessionStorage.setItem('agentActionId', currentActionId);
      } else {
        sessionStorage.removeItem('agentActionId');
      }
    } catch {
      // Ignore storage write failures.
    }
  }, [currentActionId]);

  useEffect(() => {
    if (!currentActionId) return undefined;
    if (isExecutingRef.current) return undefined;
    setPollingStatus('PENDING');

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch('http://127.0.0.1:4000/api/actions?limit=200');
        const data = await parseJsonResponse(response);
        console.log('🔄 Polling Status Update:', data);
        if (!response.ok) {
          setHistory((prev) => [
            ...prev,
            {
              id: `s-${Date.now()}-poll-error`,
              role: 'system',
              text: '❌ Error: Lost connection to Sentinel or action not found (404).',
              ts: new Date().toLocaleTimeString(),
            },
          ]);
          clearInterval(intervalId);
          setCurrentActionId(null);
          return;
        }

        const matchedAction = Array.isArray(data?.actions)
          ? data.actions.find((action) => action?.id === currentActionId)
          : null;
        const currentStatus = String(
          data?.status
            || data?.action?.status
            || data?.action?.riskStatus
            || matchedAction?.status
            || matchedAction?.riskStatus
            || ''
        );
        const normalizedStatus = currentStatus.toUpperCase();

        if (normalizedStatus.includes('PENDING')) {
          if (!activeContextRef.current.action && matchedAction?.proposedAction) {
            activeContextRef.current.action = String(matchedAction.proposedAction);
          }
          return;
        }

        if (normalizedStatus.includes('APPROVE')) {
          if (isExecutingRef.current) {
            return;
          }
          if (executedActionIdsRef.current.has(currentActionId)) {
            return;
          }
          const approvedActionId = currentActionId;
          executedActionIdsRef.current.add(currentActionId);
          isExecutingRef.current = true;
          clearInterval(intervalId);
          setCurrentActionId(null);

          setHistory((prev) => [
            ...prev,
            {
              id: `s-${Date.now()}-approved-exec`,
              role: 'system',
              text: 'Sentinel Approved. Executing action...',
              ts: new Date().toLocaleTimeString(),
            },
          ]);
          try {
            const previousProposal = proposalByActionIdRef.current[approvedActionId];
            const finalText = await requestFinalOutput(approvedActionId, previousProposal);
            setHistory((prev) => [
              ...prev,
              {
                id: `s-${Date.now()}-approved-final`,
                role: 'system',
                text: finalText,
                ts: new Date().toLocaleTimeString(),
              },
            ]);
          } catch (finalErr) {
            setHistory((prev) => [
              ...prev,
              {
                id: `s-${Date.now()}-approved-final-error`,
                role: 'system',
                text: `Sentinel Approved, but final output failed: ${String(finalErr?.message || finalErr)}`,
                ts: new Date().toLocaleTimeString(),
              },
            ]);
          } finally {
            isExecutingRef.current = false;
          }
          delete proposalByActionIdRef.current[approvedActionId];
          executedActionIdsRef.current.delete(approvedActionId);
          setPendingFile(null);
          activeContextRef.current = { action: '', content: '', fileName: '', fileType: '' };
          setPollingStatus('IDLE');
          setInput('');
          return;
        }

        if (normalizedStatus.includes('BLOCK') || normalizedStatus.includes('REJECT')) {
          setHistory((prev) => [
            ...prev,
            {
              id: `s-${Date.now()}-blocked`,
              role: 'system',
              text: 'Sentinel Blocked. Action prevented.',
              ts: new Date().toLocaleTimeString(),
            },
          ]);
          clearInterval(intervalId);
          setCurrentActionId(null);
          setPollingStatus('IDLE');
        }
      } catch {
        // Keep polling; transient fetch failures should not crash terminal state.
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [currentActionId]);

  async function handleSend() {
    if (!canSend) return;
    const text = input.trim();
    const ts = new Date().toLocaleTimeString();

    setHistory((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'agent', text, ts },
    ]);
    activeContextRef.current = {
      action: text,
      content: pendingFile?.content ? String(pendingFile.content) : '',
      fileName: pendingFile?.name ? String(pendingFile.name) : '',
      fileType: pendingFile?.type ? String(pendingFile.type) : '',
    };
    setInput('');

    try {
      const payload = { userInput: text, agent: 'OpenAI', file: pendingFile || undefined };
      console.log('JSON Payload sent to Sentinel:', JSON.stringify(payload, null, 2));

      const response = await fetch('http://localhost:4000/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let backendError = `HTTP ${response.status}`;
        try {
          const errorBody = await parseJsonResponse(response);
          backendError = String(errorBody?.error || errorBody?.message || backendError);
        } catch {
          // Ignore parse failures here; retain HTTP status fallback.
        }
        throw new Error(`Backend connection failed - ${backendError}`);
      }
      const data = await parseJsonResponse(response);

      if (data?.type === 'text') {
        setHistory((prev) => [
          ...prev,
          {
            id: `s-${Date.now()}-text`,
            role: 'system',
            text: String(data?.message || ''),
            ts: new Date().toLocaleTimeString(),
          },
        ]);
        return;
      }

      if (data?.type === 'tool_call') {
        if (!data?.actionId) {
          throw new Error('Missing actionId in tool_call response');
        }
        proposalByActionIdRef.current[data.actionId] = text;
        activeContextRef.current.action = text;
        setHistory((prev) => [
          ...prev,
          {
            id: `s-${Date.now()}-tool-call`,
            role: 'system',
            text: String(data?.message || 'Agent proposing high-risk action. Awaiting Sentinel approval.'),
            ts: new Date().toLocaleTimeString(),
          },
        ]);
        setCurrentActionId(data.actionId);
        setPollingStatus('PENDING');
        setPendingFile(null);
        return;
      }

      throw new Error('Unexpected response type from /api/agent/chat');
    } catch (error) {
      console.error(' Frontend Fetch Error:', error);
      const rawMessage = String(error?.message || error);
      const uiMessage = rawMessage.includes('Backend connection failed -')
        ? `Agent: ${rawMessage}`
        : `Sentinel proposal failed: ${rawMessage}`;

      setHistory((prev) => [
        ...prev,
        {
          id: `s-${Date.now()}-error`,
          role: 'system',
          text: uiMessage,
          ts: new Date().toLocaleTimeString(),
        },
      ]);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || '');
      setPendingFile({
        name: file.name,
        content: content,
        type: file.type,
      });
      console.log('📂 File Read Success:', file.name, 'Length:', content.length);
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.textPrimary,
        fontFamily: 'Inter, sans-serif',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          borderBottom: `1px solid ${theme.border}`,
          backdropFilter: 'blur(6px)',
          background: isDark ? 'rgba(10,10,10,0.92)' : 'rgba(245,245,245,0.92)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: isMobile ? '10px 12px' : '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: isDark ? '#101a12' : '#e8f5ea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TerminalSquare size={16} color="#30A46C" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Agent Terminal</span>
              <span style={{ fontSize: 11, color: theme.textTertiary }}>
                Simulated proposal console (UI-only)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setIsDark((v) => {
                const next = !v;
                try { localStorage.setItem('sentinel-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
                return next;
              })}
              style={{
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.textSecondary,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Link
              to="/"
              style={{
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.textSecondary,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                textDecoration: 'none',
              }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: isMobile ? '14px 12px 24px' : '18px 20px 30px',
        }}
      >
        <section
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            background: theme.surface,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              borderBottom: `1px solid ${theme.border}`,
              padding: '10px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: theme.textSecondary, letterSpacing: '0.03em' }}>
              MESSAGE HISTORY
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={13} color="#30A46C" />
              <span style={{ color: '#30A46C', fontSize: 11 }}>
                {currentActionId ? `currentActionId: ${currentActionId}` : 'proposal mode'}
              </span>
            </div>
          </div>

          <div
            style={{
              minHeight: isMobile ? 320 : 420,
              maxHeight: isMobile ? 420 : 520,
              overflowY: 'auto',
              background: isDark ? '#0D0D0D' : '#F8F8F8',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {history.map((msg) => {
              const isAgent = msg.role === 'agent';
              const isSystem = msg.role === 'system';
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isAgent ? 'flex-end' : 'flex-start',
                    maxWidth: '92%',
                    border: `1px solid ${isAgent ? 'rgba(48,164,108,0.35)' : theme.border}`,
                    background: isAgent
                      ? (isDark ? 'rgba(48,164,108,0.12)' : '#E9F8EE')
                      : theme.surface,
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {isAgent ? (
                      <User size={12} color={isDark ? '#83D3A5' : '#237A4B'} />
                    ) : (
                      <Bot size={12} color={isSystem ? '#30A46C' : theme.textSecondary} />
                    )}
                    <span style={{ color: theme.textSecondary, fontFamily: 'Inter, sans-serif', fontSize: 11 }}>
                      {isAgent ? 'agent' : msg.role}
                    </span>
                    <span style={{ color: theme.textTertiary, fontFamily: 'Inter, sans-serif', fontSize: 10 }}>
                      {msg.ts}
                    </span>
                  </div>
                  <div>{msg.text}</div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ borderTop: `1px solid ${theme.border}`, padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                ref={fileInputRef}
                id="agent-file-input"
                type="file"
                accept=".js,.ts,.jsx,.tsx,.html,.css,.py,.json,.txt,.md"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {!pendingFile ? (
                <>
                  <label
                    htmlFor="agent-file-input"
                    style={{
                      border: `1px solid ${theme.border}`,
                      background: theme.surface,
                      color: theme.textSecondary,
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Choose file
                  </label>
                  <span style={{ color: theme.textTertiary, fontSize: 11 }}>No file chosen</span>
                </>
              ) : (
                <>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      border: `1px solid rgba(48,164,108,0.45)`,
                      background: isDark ? 'rgba(48,164,108,0.15)' : '#E9F8EE',
                      color: isDark ? '#83D3A5' : '#237A4B',
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontSize: 12,
                    }}
                  >
                    <span>{pendingFile.name}</span>
                    <span style={{ opacity: 0.9 }}>Ready</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingFile(null)}
                    style={{
                      border: `1px solid ${theme.border}`,
                      background: theme.surface,
                      color: theme.textSecondary,
                      borderRadius: 999,
                      padding: '5px 9px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    X
                  </button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                style={{
                  flex: 1,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  background: isDark ? '#111' : '#FFF',
                  color: theme.textPrimary,
                  fontSize: 13,
                  padding: '10px 12px',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  background: canSend ? '#30A46C' : (isDark ? '#1D3B2A' : '#B7DCC5'),
                  color: '#fff',
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                }}
              >
                <Send size={13} />
                Send
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

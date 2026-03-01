import { useState } from 'react';
import { CheckCircle, Layers, ShieldX, Bot, AlertOctagon, Info, X, Database, Clock } from 'lucide-react';
import type { ReactNode, CSSProperties } from 'react';
import { ActionItem, Theme } from '../../types';
import { COLORS } from '../../utils/theme';

interface ReviewPanelProps {
  theme: Theme;
  isDark: boolean;
  action: ActionItem | null;
  onApprove: (id: string) => void;
  onEscalate: (id: string) => void;
  onBlock: (id: string) => void;
  isMobile: boolean;
}

function RiskGauge({ score, isDark }: { score: number; isDark: boolean }) {
  const getColor = (s: number) => {
    if (s >= 80) return COLORS.red;
    if (s >= 50) return COLORS.amber;
    return COLORS.green;
  };

  const color = getColor(score);
  const segments = 20;
  const filled = Math.round((score / 100) * segments);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            color: isDark ? '#8A8A8A' : '#5A5A5A',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          ML Risk Score
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <span
            style={{
              color,
              fontSize: 26,
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '-0.03em',
            }}
          >
            {score}
          </span>
          <span style={{ color: isDark ? '#555' : '#ADADAD', fontSize: 14, fontFamily: 'Inter, sans-serif' }}>
            /100
          </span>
        </div>
      </div>

      {/* Segmented bar */}
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 2,
              background:
                i < filled
                  ? color
                  : isDark
                  ? 'rgba(255,255,255,0.07)'
                  : 'rgba(0,0,0,0.07)',
              transition: 'background 0.3s',
              opacity: i < filled ? (0.4 + (i / filled) * 0.6) : 1,
            }}
          />
        ))}
      </div>

      {/* Label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 6,
          background: score >= 80 ? COLORS.redMuted : score >= 50 ? COLORS.amberMuted : COLORS.greenMuted,
        }}
      >
        <AlertOctagon size={13} color={color} />
        <span style={{ color, fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
          {score >= 80 ? 'Critical Risk — Immediate Review Required' : score >= 50 ? 'Elevated Risk — Review Recommended' : 'Low Risk — Routine Review'}
        </span>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  variant,
  onClick,
  disabled,
  disabledReason,
}: {
  label: string;
  icon: ReactNode;
  variant: 'approve' | 'escalate' | 'block';
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [hovered, setHovered] = useState(false);

  const styles: Record<string, CSSProperties> = {
    approve: {
      border: `1.5px solid ${COLORS.green}`,
      color: hovered ? '#fff' : COLORS.green,
      background: hovered ? COLORS.green : 'transparent',
    },
    escalate: {
      border: `1.5px solid ${COLORS.amber}`,
      color: hovered ? '#000' : COLORS.amber,
      background: hovered ? COLORS.amber : 'transparent',
    },
    block: {
      border: `1.5px solid ${COLORS.red}`,
      color: '#fff',
      background: hovered ? '#c73338' : COLORS.red,
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? (disabledReason ?? 'Action already resolved') : label}
      aria-label={disabled ? (disabledReason ?? 'Action already resolved') : label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        padding: '12px 8px',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        fontWeight: 600,
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.4 : 1,
        minHeight: 44, /* touch target */
        ...styles[variant],
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function ReviewPanel({ theme, isDark, action, onApprove, onEscalate, onBlock, isMobile }: ReviewPanelProps) {
  if (!action) {
    return (
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          minHeight: isMobile ? 160 : 300,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.textTertiary,
          }}
        >
          <Info size={20} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: theme.textSecondary, fontSize: 14, fontWeight: 500 }}>No action selected</p>
          <p style={{ color: theme.textTertiary, fontSize: 12, marginTop: 4 }}>
            Click a pending review in the feed to begin
          </p>
        </div>
        {/* Source attribution even on empty state */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <Database size={9} color={theme.textTertiary} />
          <span style={{ color: theme.textTertiary, fontSize: 10 }}>
            sentinel-ml-v3.2 · ready
          </span>
        </div>
      </div>
    );
  }

  const isPending = action.riskStatus === 'HIGH_RISK_PENDING' || action.riskStatus === 'MEDIUM_RISK_PENDING';
  const actionAgent = (action as any).agent || (action as any).agent_name || action.agentName;
  const actionEnvironment = (action as any).environment || (action as any).env || action.environment;
  const flaggingReasons = Array.isArray((action as any).flaggingReasons)
    ? (action as any).flaggingReasons
    : action.flagReasons;
  const scoreColor =
    action.riskScore >= 80 ? COLORS.red : action.riskScore >= 50 ? COLORS.amber : COLORS.green;

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${action.riskScore >= 80 ? 'rgba(229,72,77,0.3)' : theme.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        boxShadow:
          action.riskScore >= 80
            ? `0 0 0 1px rgba(229,72,77,0.12), 0 4px 24px rgba(229,72,77,0.08)`
            : 'none',
      }}
    >
      {/* Panel Header — high-contrast for quick scan */}
      <div
        style={{
          padding: isMobile ? '12px 14px' : '14px 18px',
          borderBottom: `1px solid ${theme.border}`,
          background: isPending
            ? (action.riskScore >= 80 ? 'rgba(229,72,77,0.08)' : 'rgba(255,178,36,0.06)')
            : theme.tableHeaderBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              background: COLORS.redMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertOctagon size={13} color={COLORS.red} />
          </div>
          <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>
            Active Review Panel
          </span>
        </div>
        <div
          style={{
            padding: '3px 8px',
            borderRadius: 4,
            background: COLORS.redMuted,
            color: COLORS.red,
            fontSize: isMobile ? 9 : 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}
        >
          HUMAN-IN-THE-LOOP
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: isMobile ? '14px' : '18px', display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 18 }}>
        {/* Agent info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={14} color={theme.textSecondary} />
            <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Agent
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 7,
              background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: isDark ? '#1a2a1a' : '#e8f5e9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Bot size={14} color="#30A46C" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {actionAgent}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: 11, marginTop: 1 }}>
                {actionEnvironment} · {action.timestamp}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: actionEnvironment === 'PROD' ? COLORS.redMuted : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                  color: actionEnvironment === 'PROD' ? COLORS.red : theme.textSecondary,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                }}
              >
                {actionEnvironment}
              </div>
            </div>
          </div>
        </div>

        {/* Proposed Command */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={14} color={theme.textSecondary} />
            <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Proposed Command
            </span>
          </div>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 7,
              background: isDark ? '#0D0D0D' : '#F3F3F3',
              border: `1px solid ${action.riskScore >= 80 ? 'rgba(229,72,77,0.25)' : theme.border}`,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 3,
                height: '100%',
                borderRadius: '7px 0 0 7px',
                background: scoreColor,
              }}
            />
            <code
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: isMobile ? 12 : 13,
                color: action.riskScore >= 80 ? '#FF8589' : theme.textPrimary,
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}
            >
              {action.proposedAction}
            </code>
          </div>
        </div>

        {/* Risk Score Gauge */}
        <div
          style={{
            padding: '14px',
            borderRadius: 8,
            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            border: `1px solid ${theme.border}`,
          }}
        >
          <RiskGauge score={action.riskScore} isDark={isDark} />
        </div>

        {/* Flag Reasons */}
        {flaggingReasons?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertOctagon size={14} color={theme.textSecondary} />
              <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Flagging Reasons
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {flaggingReasons?.map((reason, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '9px 12px',
                    borderRadius: 6,
                    background: isDark ? 'rgba(229,72,77,0.05)' : 'rgba(229,72,77,0.04)',
                    border: `1px solid rgba(229,72,77,0.15)`,
                  }}
                >
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: COLORS.red,
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: theme.textPrimary, fontSize: 12, lineHeight: 1.5 }}>
                    {reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: theme.border }} />

        {/* CTA summary — instant comprehension for judge scan */}
        {isPending && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: action.riskScore >= 80
                ? 'rgba(229,72,77,0.08)'
                : 'rgba(255,178,36,0.06)',
              border: `1px solid ${action.riskScore >= 80 ? 'rgba(229,72,77,0.2)' : 'rgba(255,178,36,0.2)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertOctagon size={14} color={scoreColor} />
            <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
              {action.riskScore >= 80
                ? 'Critical — approve or block this action now'
                : 'Review required — approve or block below'}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          <ActionButton
            label="Approve"
            icon={<CheckCircle size={14} />}
            variant="approve"
            onClick={() => onApprove(action.id)}
            disabled={!isPending}
            disabledReason={!isPending ? 'This action has already been resolved' : undefined}
          />
          <ActionButton
            label="Block Action"
            icon={<ShieldX size={14} />}
            variant="block"
            onClick={() => onBlock(action.id)}
            disabled={!isPending}
            disabledReason={!isPending ? 'This action has already been resolved' : undefined}
          />
        </div>

        {!isPending && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${theme.border}`,
            }}
          >
            <X size={13} color={theme.textTertiary} />
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>
              This action has already been resolved and cannot be modified.
            </span>
          </div>
        )}

        {/* Source + Timestamp truthfulness footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 0 0',
            borderTop: `1px solid ${theme.border}`,
            marginTop: 2,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Database size={10} color={theme.textTertiary} />
            <span style={{ color: theme.textTertiary, fontSize: 10 }}>
              {action.source ?? 'sentinel-ml-v3.2'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Clock size={10} color={theme.textTertiary} />
            <span style={{ color: theme.textTertiary, fontSize: 10 }}>
              Scored at {action.timestamp} · {isPending ? 'awaiting review' : action.riskStatus === 'APPROVED' ? 'approved' : 'blocked'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { AreaChart, Area, Tooltip } from 'recharts';
import { TrendingUp, Clock, AlertTriangle, CheckCircle, Database } from 'lucide-react';
import type { ReactNode } from 'react';
import { Theme, ActionItem } from '../../types';
import { sparklineData } from '../../data/mockData';
import { COLORS } from '../../utils/theme';

interface MetricsRowProps {
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
  actions: ActionItem[];
}

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  accentColor?: string;
  accentBg?: string;
  hasSparkline?: boolean;
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  accentColor,
  accentBg,
  hasSparkline,
  theme,
  isDark,
  isMobile,
}: MetricCardProps) {
  const valueColor = accentColor ?? theme.textPrimary;

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: isMobile ? '14px 16px' : '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 8 : 12,
        fontFamily: 'Inter, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Top row: title + icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: theme.textSecondary, fontSize: isMobile ? 11 : 12, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {title}
        </span>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: accentBg ?? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accentColor ?? theme.textSecondary,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      {/* Value */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontSize: isMobile ? 26 : 34,
              fontWeight: 700,
              color: valueColor,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {value}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: isMobile ? 11 : 12, marginTop: 5 }}>
            {subtitle}
          </div>
        </div>

        {/* Sparkline — only on desktop */}
        {hasSparkline && !isMobile && (
          <div style={{ width: 80, height: 36, flexShrink: 0 }}>
            <AreaChart
              width={80}
              height={36}
              data={sparklineData}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ display: 'none' }}
                cursor={false}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={COLORS.green}
                strokeWidth={1.5}
                fill="url(#sparkGradient)"
                dot={false}
                isAnimationActive={true}
              />
            </AreaChart>
          </div>
        )}
      </div>
    </div>
  );
}

export function MetricsRow({ theme, isDark, isMobile, actions }: MetricsRowProps) {
  const stats = useMemo(() => {
    const resolved = actions.filter(
      (a) => a.riskStatus !== 'HIGH_RISK_PENDING' && a.riskStatus !== 'MEDIUM_RISK_PENDING'
    ).length;

    const pending = actions.filter(
      (a) => a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING'
    ).length;

    const highRisk = actions.filter(
      (a) =>
        a.riskScore >= 80 &&
        (a.riskStatus === 'APPROVED' || a.riskStatus === 'HIGH_RISK_BLOCKED')
    ).length;

    const blocked = actions.filter(
      (a) => a.riskStatus === 'HIGH_RISK_BLOCKED'
    ).length;

    const approved = actions.filter(
      (a) => a.riskStatus === 'APPROVED' || a.riskStatus === 'LOW_RISK'
    ).length;

    const decided = approved + blocked;
    const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0;

    const urgentPending = actions.filter(
      (a) => a.riskStatus === 'HIGH_RISK_PENDING'
    ).length;

    const now = new Date();
    const updatedAt = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;

    return { resolved, pending, highRisk, blocked, approved, approvalRate, decided, urgentPending, updatedAt };
  }, [actions]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: isMobile ? 10 : 16,
          fontFamily: 'Inter, sans-serif',
        }}
      >
      <MetricCard
        title="Total AI Actions"
        value={stats.resolved.toLocaleString()}
        subtitle={stats.resolved === 0 ? 'No actions reviewed yet' : `${stats.resolved} reviewed`}
        icon={<TrendingUp size={14} />}
        hasSparkline
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      <MetricCard
        title="Pending Reviews"
        value={String(stats.pending)}
        subtitle={stats.urgentPending > 0 ? `${stats.urgentPending} require urgent attention` : 'All clear'}
        icon={<Clock size={14} />}
        accentColor={COLORS.amber}
        accentBg={COLORS.amberMuted}
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      <MetricCard
        title="High-Risk Interventions"
        value={String(stats.highRisk)}
        subtitle={stats.blocked > 0 ? `${stats.blocked} blocked` : 'No high-risk blocks'}
        icon={<AlertTriangle size={14} />}
        accentColor={COLORS.red}
        accentBg={COLORS.redMuted}
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      <MetricCard
        title="Global Approval Rate"
        value={stats.decided > 0 ? `${stats.approvalRate}%` : '—'}
        subtitle={stats.decided > 0 ? `${stats.approved} of ${stats.decided} decided` : 'No decisions yet'}
        icon={<CheckCircle size={14} />}
        accentColor={COLORS.green}
        accentBg={COLORS.greenMuted}
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      </div>
      {/* Source / Timestamp truthfulness strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '0 2px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Database size={9} color={theme.textTertiary} />
          <span style={{ color: theme.textTertiary, fontSize: 10 }}>
            sentinel-ml-v3.2 · aggregated
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={9} color={theme.textTertiary} />
          <span style={{ color: theme.textTertiary, fontSize: 10 }}>
            Updated {stats.updatedAt}
          </span>
        </div>
      </div>
    </div>
  );
}

import { AreaChart, Area, Tooltip } from 'recharts';
import { TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Theme } from '../../types';
import { sparklineData } from '../../data/mockData';
import { COLORS } from '../../utils/theme';

interface MetricsRowProps {
  theme: Theme;
  isDark: boolean;
  isMobile: boolean;
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

export function MetricsRow({ theme, isDark, isMobile }: MetricsRowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: isMobile ? 10 : 16,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <MetricCard
        title="Total AI Actions Today"
        value="1,245"
        subtitle="↑ +12% from yesterday"
        icon={<TrendingUp size={14} />}
        hasSparkline
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      <MetricCard
        title="Pending Reviews"
        value="4"
        subtitle="2 require urgent attention"
        icon={<Clock size={14} />}
        accentColor={COLORS.amber}
        accentBg={COLORS.amberMuted}
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      <MetricCard
        title="High-Risk Interventions"
        value="12"
        subtitle="3 blocked automatically"
        icon={<AlertTriangle size={14} />}
        accentColor={COLORS.red}
        accentBg={COLORS.redMuted}
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
      <MetricCard
        title="Global Approval Rate"
        value="94%"
        subtitle="Last 24 hours"
        icon={<CheckCircle size={14} />}
        accentColor={COLORS.green}
        accentBg={COLORS.greenMuted}
        theme={theme}
        isDark={isDark}
        isMobile={isMobile}
      />
    </div>
  );
}
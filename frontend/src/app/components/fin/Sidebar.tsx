import { useState, useEffect } from 'react';
import { AlertTriangle, Cpu, Brain, Clock, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { C } from './colors';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  borderColor: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | null;
}

function StatCard({ label, value, sub, borderColor, icon, trend }: StatCardProps) {
  return (
    <div style={{
      background: C.bgCard,
      border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 2,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{ fontFamily: C.sans, fontSize: 9, color: C.textDim, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ color: C.textDim, opacity: 0.7 }}>{icon}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: C.mono, fontSize: 22, color: C.text, fontWeight: 600, lineHeight: 1 }}>{value}</span>
        {trend && (
          <span style={{ color: trend === 'up' ? C.red : C.green }}>
            {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          </span>
        )}
      </div>
      {sub && <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginTop: 2, display: 'block' }}>{sub}</span>}
    </div>
  );
}

export function Sidebar() {
  const [elapsed, setElapsed] = useState(154);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
  };

  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: C.bgPanel,
      borderRight: `1px solid ${C.border}`,
      padding: '16px 12px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <Activity size={12} color={C.orange} />
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.orange, letterSpacing: '0.12em' }}>SYSTEM OVERVIEW</span>
      </div>

      <StatCard
        label="Active Alerts"
        value="7"
        sub="↑ 2 since last check"
        borderColor={C.red}
        icon={<AlertTriangle size={12} />}
        trend="up"
      />
      <StatCard
        label="Models Running"
        value="3"
        sub="Risk · Fraud · Portfolio"
        borderColor={C.cyan}
        icon={<Cpu size={12} />}
      />
      <StatCard
        label="Avg Confidence"
        value="94.2%"
        sub="↑ 1.4% from baseline"
        borderColor={C.green}
        icon={<Brain size={12} />}
        trend={null}
      />
      <StatCard
        label="Last Inference"
        value={formatElapsed(elapsed)}
        sub="Risk model — latest"
        borderColor={C.orange}
        icon={<Clock size={12} />}
      />

      {/* Divider */}
      <div style={{ height: 1, background: C.border, margin: '12px 0' }} />

      {/* Section: Model Health */}
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.orange, letterSpacing: '0.12em', display: 'block', marginBottom: 10 }}>MODEL HEALTH</span>
        {[
          { name: 'RISK ENGINE', status: 'ONLINE', acc: '96.8%', color: C.green },
          { name: 'FRAUD DNN', status: 'ONLINE', acc: '98.1%', color: C.green },
          { name: 'OPTIMIZER', status: 'BUSY', acc: '—', color: C.yellow },
        ].map((m) => (
          <div key={m.name} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.text }}>{m.name}</div>
              <div style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>ACC: {m.acc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, boxShadow: `0 0 5px ${m.color}` }} />
              <span style={{ fontFamily: C.mono, fontSize: 8, color: m.color }}>{m.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: C.border, margin: '4px 0 12px' }} />

      {/* Feed Preview */}
      <div>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.orange, letterSpacing: '0.12em', display: 'block', marginBottom: 10 }}>RECENT ACTIVITY</span>
        {[
          { msg: 'High-risk loan flagged', time: '0:32', color: C.red },
          { msg: 'Fraud detected: TXN-8850', time: '1:14', color: C.red },
          { msg: 'Portfolio rebalanced', time: '2:45', color: C.green },
          { msg: 'Model retrained OK', time: '4:12', color: C.cyan },
          { msg: 'Risk threshold updated', time: '6:30', color: C.orange },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            padding: '5px 0',
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ width: 4, borderRadius: 1, background: item.color, flexShrink: 0, marginTop: 2, height: 14 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.msg}</div>
              <div style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim }}>{item.time} ago</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        aside::-webkit-scrollbar { width: 4px; }
        aside::-webkit-scrollbar-track { background: ${C.bg}; }
        aside::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>
    </aside>
  );
}

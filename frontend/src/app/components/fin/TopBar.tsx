import { useState, useEffect } from 'react';
import { Bell, User, ChevronDown, Wifi } from 'lucide-react';
import { C } from './colors';

type Tab = 'RISK_SCORE' | 'FRAUD_DETECT' | 'PORTFOLIO';

interface TopBarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'RISK_SCORE', label: 'RISK SCORE' },
  { id: 'FRAUD_DETECT', label: 'FRAUD DETECT' },
  { id: 'PORTFOLIO', label: 'PORTFOLIO' },
];

export function TopBar({ activeTab, setActiveTab }: TopBarProps) {
  const [time, setTime] = useState(new Date());
  const [alertPulse, setAlertPulse] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const pulse = setInterval(() => {
      setAlertPulse(true);
      setTimeout(() => setAlertPulse(false), 600);
    }, 8000);
    return () => clearInterval(pulse);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
  const isMarketOpen = time.getHours() >= 9 && time.getHours() < 16 && time.getDay() > 0 && time.getDay() < 6;

  return (
    <header style={{
      height: 48,
      background: C.bgPanel,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 0,
      flexShrink: 0,
      position: 'relative',
      zIndex: 100,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 24, flexShrink: 0 }}>
        <span style={{
          fontFamily: C.mono,
          fontSize: 18,
          fontWeight: 700,
          color: C.orange,
          letterSpacing: '0.05em',
        }}>FIN·IQ</span>
        <div style={{
          background: 'rgba(255,107,0,0.15)',
          border: `1px solid rgba(255,107,0,0.3)`,
          borderRadius: 2,
          padding: '2px 6px',
        }}>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.orange, letterSpacing: '0.1em' }}>TERMINAL v2.4</span>
        </div>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 24, background: C.border, marginRight: 24 }} />

      {/* Clock + Market Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 28, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text, letterSpacing: '0.08em', lineHeight: 1.2 }}>{timeStr}</span>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, letterSpacing: '0.06em', lineHeight: 1.2 }}>{dateStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7,
            borderRadius: '50%',
            background: isMarketOpen ? C.green : C.red,
            boxShadow: `0 0 8px ${isMarketOpen ? C.green : C.red}`,
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontFamily: C.mono, fontSize: 9, color: isMarketOpen ? C.green : C.red, letterSpacing: '0.08em' }}>
            {isMarketOpen ? 'LIVE' : 'CLOSED'}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 24, background: C.border, marginRight: 4 }} />

      {/* Tab Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 0 }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                height: 48,
                padding: '0 20px',
                background: isActive ? 'rgba(255,107,0,0.08)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? `2px solid ${C.orange}` : '2px solid transparent',
                color: isActive ? C.orange : C.textDim,
                fontFamily: C.mono,
                fontSize: 11,
                letterSpacing: '0.12em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = C.text;
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = C.textDim;
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Market Tickers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginRight: 20 }}>
        {[
          { sym: 'S&P', val: '5,248.32', chg: '+0.84%', up: true },
          { sym: 'NDX', val: '18,342.1', chg: '+1.22%', up: true },
          { sym: 'BTC', val: '67,482', chg: '-0.37%', up: false },
        ].map((t) => (
          <div key={t.sym} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim }}>{t.sym}</span>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{t.val}</span>
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 9, color: t.up ? C.green : C.red }}>{t.chg}</span>
          </div>
        ))}
      </div>

      {/* Separator */}
      <div style={{ width: 1, height: 24, background: C.border, marginRight: 16 }} />

      {/* Right Side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ position: 'relative', cursor: 'pointer' }}>
          <Bell size={16} color={C.textDim} />
          <div style={{
            position: 'absolute',
            top: -6,
            right: -8,
            minWidth: 16,
            height: 16,
            background: C.red,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: alertPulse ? 'none' : 'badgePulse 1s ease',
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 8, color: '#fff', fontWeight: 700 }}>7</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 2, border: `1px solid ${C.border}` }}>
          <div style={{
            width: 24, height: 24,
            borderRadius: 2,
            background: 'linear-gradient(135deg, #FF6B00 0%, #FF8C33 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 9, color: '#fff', fontWeight: 700 }}>JD</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: C.sans, fontSize: 11, color: C.text, lineHeight: 1.2 }}>J. Dawson</span>
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, lineHeight: 1.2 }}>ANALYST L2</span>
          </div>
          <ChevronDown size={12} color={C.textDim} />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes badgePulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
      `}</style>
    </header>
  );
}

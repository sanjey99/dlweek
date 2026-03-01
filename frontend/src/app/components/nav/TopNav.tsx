import { Bell, Sun, Moon, ShieldCheck } from 'lucide-react';
import { Theme } from '../../types';

interface TopNavProps {
  isDark: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  isMobile: boolean;
}

export function TopNav({ isDark, theme, onToggleTheme, isMobile }: TopNavProps) {
  return (
    <nav
      style={{
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        fontFamily: 'Inter, sans-serif',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: isMobile ? '0 12px' : '0 24px',
          height: isMobile ? 48 : 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Logo + Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={isMobile ? 18 : 20} color="#30A46C" />
            <span
              style={{
                color: theme.textPrimary,
                fontSize: isMobile ? 15 : 16,
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              Sentinel
            </span>
          </div>

          {/* Divider — hidden on mobile */}
          {!isMobile && <div style={{ width: 1, height: 20, background: theme.border }} />}

          {/* Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span
                style={{
                  position: 'absolute',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#30A46C',
                  opacity: 0.5,
                  animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                }}
              />
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#30A46C',
                  display: 'block',
                  position: 'relative',
                }}
              />
            </div>
            {/* Hide label on mobile */}
            {!isMobile && (
              <span style={{ color: '#30A46C', fontSize: 12, fontWeight: 500 }}>
                System Operational
              </span>
            )}
          </div>
        </div>

        {/* Right: Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 2 : 4 }}>
          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: theme.textSecondary,
              padding: '8px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = theme.surfaceElevated)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button
              title="Notifications"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: theme.textSecondary,
                padding: '8px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = theme.surfaceElevated)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Bell size={17} />
            </button>
            <div
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#E5484D',
                border: `2px solid ${theme.surface}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>4</span>
            </div>
          </div>

          {/* Divider — hidden on mobile */}
          {!isMobile && <div style={{ width: 1, height: 20, background: theme.border, margin: '0 8px' }} />}

          {/* User Avatar */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #30A46C, #1a7a52)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              marginLeft: isMobile ? 4 : 0,
            }}
          >
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>AK</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </nav>
  );
}
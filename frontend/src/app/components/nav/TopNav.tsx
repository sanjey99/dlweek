import { useMemo, useState } from 'react';
import { Bell, Sun, Moon, ShieldCheck, AlertTriangle, Ban, Clock3, X, Check } from 'lucide-react';
import { Theme } from '../../types';

interface TopNavProps {
  isDark: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  isMobile: boolean;
}

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  timeAgo: string;
  level: 'critical' | 'warning' | 'info';
  unread: boolean;
};

const initialNotifications: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Critical action requires review',
    detail: 'agent-db-ops proposed DROP TABLE users_backup in PROD — Risk score 94/100.',
    timeAgo: '2m ago',
    level: 'critical',
    unread: true,
  },
  {
    id: 'n2',
    title: 'Action automatically blocked',
    detail: 'agent-api-gateway blocked mass privilege escalation via PATCH /api/v1/users/all.',
    timeAgo: '9m ago',
    level: 'critical',
    unread: true,
  },
  {
    id: 'n3',
    title: 'Medium-risk action pending',
    detail: 'agent-file-ops is awaiting approval to delete /var/logs/ in STAGING.',
    timeAgo: '18m ago',
    level: 'warning',
    unread: true,
  },
  {
    id: 'n4',
    title: 'Compliance rule triggered',
    detail: 'agent-email-sender blocked by COMP-004: opt-out recipients targeted.',
    timeAgo: '31m ago',
    level: 'critical',
    unread: true,
  },
];

export function TopNav({ isDark, theme, onToggleTheme, isMobile }: TopNavProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications]
  );

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getLevelStyles = (level: NotificationItem['level']) => {
    if (level === 'critical') {
      return {
        icon: <Ban size={14} color="#E5484D" />,
        dot: '#E5484D',
        bg: 'rgba(229,72,77,0.14)',
      };
    }
    if (level === 'warning') {
      return {
        icon: <AlertTriangle size={14} color="#F5A524" />,
        dot: '#F5A524',
        bg: 'rgba(245,165,36,0.14)',
      };
    }

    return {
      icon: <Clock3 size={14} color="#3B82F6" />,
      dot: '#3B82F6',
      bg: 'rgba(59,130,246,0.14)',
    };
  };

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

          {/* Notification bell + popover */}
          <div style={{ position: 'relative' }}>
            <button
              title="Notifications"
              onClick={() => setIsNotificationsOpen((v) => !v)}
              style={{
                background: isNotificationsOpen ? theme.surfaceElevated : 'transparent',
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
              onMouseLeave={e => {
                if (!isNotificationsOpen) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Bell size={17} />
            </button>

            {unreadCount > 0 && (
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
                <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </div>
            )}

            {isNotificationsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: isMobile ? 'min(92vw, 360px)' : 360,
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                  overflow: 'hidden',
                  zIndex: 80,
                }}
              >
                <div
                  style={{
                    padding: '12px 14px',
                    borderBottom: `1px solid ${theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={15} color={theme.textSecondary} />
                    <span style={{ color: theme.textPrimary, fontWeight: 600, fontSize: 15 }}>
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span
                        style={{
                          minWidth: 18,
                          height: 18,
                          padding: '0 6px',
                          borderRadius: 999,
                          background: '#E5484D',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {unreadCount}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={markAllRead}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#30A46C',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: 0,
                    }}
                  >
                    <Check size={13} /> Mark all read
                  </button>
                </div>

                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 18, color: theme.textTertiary, fontSize: 13 }}>
                      No notifications.
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const level = getLevelStyles(n.level);
                      return (
                        <div
                          key={n.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '20px 1fr 20px',
                            alignItems: 'start',
                            gap: 10,
                            padding: '12px 14px',
                            borderBottom: `1px solid ${theme.border}`,
                            background: n.unread ? 'rgba(255,255,255,0.01)' : 'transparent',
                          }}
                        >
                          <div
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: level.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: 1,
                            }}
                          >
                            {level.icon}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              {n.unread && (
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: level.dot,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <span style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 600 }}>
                                {n.title}
                              </span>
                            </div>
                            <p style={{ margin: 0, color: theme.textSecondary, fontSize: 12.5, lineHeight: 1.4 }}>
                              {n.detail}
                            </p>
                            <span style={{ color: theme.textTertiary, fontSize: 11, marginTop: 4, display: 'inline-block' }}>
                              {n.timeAgo}
                            </span>
                          </div>

                          <button
                            onClick={() => dismissNotification(n.id)}
                            title="Dismiss"
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: theme.textTertiary,
                              cursor: 'pointer',
                              padding: 2,
                              marginTop: 1,
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <button
                  style={{
                    width: '100%',
                    border: 'none',
                    borderTop: `1px solid ${theme.border}`,
                    background: 'transparent',
                    color: theme.textSecondary,
                    padding: '12px 14px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  View all activity logs →
                </button>
              </div>
            )}
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

import { useMemo, useState } from 'react';
import { Bell, Sun, Moon, ShieldCheck, AlertTriangle, Ban, Clock3, X, Check, User, Settings, Shield, KeyRound, LogOut, ChevronRight } from 'lucide-react';
import { Theme } from '../../types';

interface TopNavProps {
  isDark: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  isMobile: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onOpenAction?: (actionId: string) => void;
}

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  actionId: string | null;
  createdAt: string;
  level: 'critical' | 'warning' | 'info';
  unread: boolean;
};

function timeAgoLabel(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'just now';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function TopNav({ isDark, theme, onToggleTheme, isMobile, notifications, unreadCount, onMarkAllRead, onMarkRead, onOpenAction }: TopNavProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const notificationRows = useMemo(() => notifications, [notifications]);

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
              onClick={() => {
                setIsNotificationsOpen((v) => !v);
                setIsAccountOpen(false);
              }}
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
                    onClick={onMarkAllRead}
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
                  {notificationRows.length === 0 ? (
                    <div style={{ padding: 18, color: theme.textTertiary, fontSize: 13 }}>
                      No notifications.
                    </div>
                  ) : (
                    notificationRows.map((n) => {
                      const level = getLevelStyles(n.level);
                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (n.actionId && onOpenAction) {
                              onOpenAction(n.actionId);
                            }
                            if (n.unread) {
                              onMarkRead(n.id);
                            }
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '20px 1fr 20px',
                            alignItems: 'start',
                            gap: 10,
                            padding: '12px 14px',
                            borderBottom: `1px solid ${theme.border}`,
                            background: n.unread ? 'rgba(255,255,255,0.01)' : 'transparent',
                            cursor: n.actionId ? 'pointer' : 'default',
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
                              {timeAgoLabel(n.createdAt)}
                            </span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkRead(n.id);
                            }}
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

          {/* User Avatar + account popup */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsAccountOpen((v) => !v);
                setIsNotificationsOpen(false);
              }}
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
                border: 'none',
              }}
            >
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>AK</span>
            </button>

            {isAccountOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: isMobile ? 'min(94vw, 340px)' : 320,
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                  overflow: 'hidden',
                  zIndex: 90,
                }}
              >
                <div style={{ padding: 14, borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #30A46C, #1a7a52)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      AK
                    </div>
                    <div>
                      <div style={{ color: theme.textPrimary, fontWeight: 700, fontSize: 16 }}>Alex Kim</div>
                      <div style={{ color: theme.textSecondary, fontSize: 13 }}>alex.kim@corp.io</div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: 'inline-flex',
                      alignItems: 'center',
                      background: 'rgba(48,164,108,0.14)',
                      color: '#30A46C',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      padding: '4px 8px',
                      borderRadius: 6,
                    }}
                  >
                    SENIOR REVIEWER
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 700 }}>12 actions</div>
                      <div style={{ color: theme.textTertiary, fontSize: 11 }}>reviewed</div>
                    </div>
                    <div>
                      <div style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 700 }}>Session: 2h</div>
                      <div style={{ color: theme.textTertiary, fontSize: 11 }}>14m active</div>
                    </div>
                  </div>
                </div>

                {[
                  { icon: <User size={15} />, label: 'Profile', sub: 'Manage your account details' },
                  { icon: <Settings size={15} />, label: 'Settings', sub: 'Dashboard & notification prefs' },
                  { icon: <Shield size={15} />, label: 'Security Audit Log', sub: 'Your review history' },
                  { icon: <KeyRound size={15} />, label: 'API Keys', sub: 'Manage integration tokens' },
                ].map((item) => (
                  <button
                    key={item.label}
                    style={{
                      width: '100%',
                      border: 'none',
                      borderBottom: `1px solid ${theme.border}`,
                      background: 'transparent',
                      color: theme.textPrimary,
                      padding: '12px 14px',
                      display: 'grid',
                      gridTemplateColumns: '20px 1fr 16px',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ color: theme.textSecondary }}>{item.icon}</span>
                    <span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{item.label}</span>
                      <span style={{ display: 'block', fontSize: 12, color: theme.textTertiary }}>{item.sub}</span>
                    </span>
                    <ChevronRight size={13} color={theme.textTertiary} />
                  </button>
                ))}

                <div
                  style={{
                    padding: '12px 14px',
                    borderBottom: `1px solid ${theme.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sun size={15} color={theme.textSecondary} />
                    <span style={{ color: theme.textPrimary, fontSize: 14, fontWeight: 600 }}>Switch to Light Mode</span>
                  </div>

                  <button
                    onClick={onToggleTheme}
                    style={{
                      width: 40,
                      height: 22,
                      borderRadius: 999,
                      border: 'none',
                      background: !isDark ? '#30A46C' : '#3A3A3A',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: !isDark ? 21 : 3,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.15s',
                      }}
                    />
                  </button>
                </div>

                <button
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    color: '#E5484D',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <LogOut size={15} /> Sign Out
                </button>
              </div>
            )}
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


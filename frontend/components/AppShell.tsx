"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearToken } from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/hooks/useTheme";
import GlobalSearch from "@/components/GlobalSearch";
import {
  LayoutDashboard, Calendar, CalendarDays, Users, Scissors,
  ShoppingCart, CheckSquare, DollarSign, Globe, MapPin,
  Settings, Bell, Search, Menu, X, LogOut, ChevronLeft,
  ChevronRight, Sparkles, HeadphonesIcon,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────────────── */
type Me = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  photoUrl?: string;
};

type Org = {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  trialEndsAt?: string;
  plan?: string;
};

type Notification = {
  id: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};

/* ── Navigation ──────────────────────────────────────────────────── */
const ALL_NAV = [
  { href: "/dashboard",    label: "Dashboard",    Icon: LayoutDashboard, module: "core" },
  { href: "/appointments", label: "Randevular",   Icon: Calendar,        module: "appointments" },
  { href: "/takvim",       label: "Takvim",       Icon: CalendarDays,    module: "appointments" },
  { href: "/customers",    label: "Müşteriler",   Icon: Users,           module: "customers" },
  { href: "/stylists",     label: "Stilistler",   Icon: Scissors,        module: "staff" },
  { href: "/services",     label: "Hizmetler",    Icon: Sparkles,        module: "services" },
  { href: "/stock",        label: "Stok",         Icon: ShoppingCart,    module: "stock" },
  { href: "/tasks",        label: "Görevler",     Icon: CheckSquare,     module: "tasks" },
  { href: "/finance",      label: "Finans",       Icon: DollarSign,      module: "finance" },
  { href: "/website",      label: "Web Sitesi",   Icon: Globe,           module: "website" },
  { href: "/salon-bul",    label: "Salon Bul",    Icon: MapPin,          module: "core" },
  { href: "/ayarlar",      label: "Ayarlar",      Icon: Settings,        module: "core" },
];

const BOTTOM_NAV = [
  { href: "/dashboard",    label: "Ana Sayfa", Icon: LayoutDashboard },
  { href: "/appointments", label: "Randevular", Icon: Calendar },
  { href: "/customers",    label: "Müşteriler", Icon: Users },
  { href: "/takvim",       label: "Takvim",     Icon: CalendarDays },
  { href: "/services",     label: "Hizmetler",  Icon: Scissors },
];

/* ── Sidebar width ─────────────────────────────────────────────── */
const SIDEBAR_W_OPEN  = 240;
const SIDEBAR_W_CLOSED = 64;

/* ── AppShell ────────────────────────────────────────────────────── */
interface Props {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppShell({ title, description, actions, children }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();

  const [me,           setMe]           = useState<Me | null>(null);
  const [org,          setOrg]          = useState<Org | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);   // mobile drawer
  const [collapsed,    setCollapsed]    = useState(false);   // desktop collapse
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [notifs,       setNotifs]       = useState<Notification[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [supportOpen,  setSupportOpen]  = useState(false);
  const [trialDays,    setTrialDays]    = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // Load user data
  useEffect(() => {
    apiFetch("/Auth/me").then(r => r.ok ? r.json() : null).then(setMe);
    apiFetch("/Settings/organization").then(r => r.ok ? r.json() : null).then(d => {
      setOrg(d);
      if (d?.primaryColor) {
        document.documentElement.style.setProperty("--primary", d.primaryColor);
      }
    });
    apiFetch("/AppointmentRequests/count-pending").then(r => r.ok ? r.json() : 0).then(setPendingCount);
    apiFetch("/Notifications?limit=8").then(r => r.ok ? r.json() : []).then(setNotifs);
    apiFetch("/Announcements/active").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.message) setAnnouncement(d.message);
    });
    const stored = localStorage.getItem("trialDaysLeft");
    if (stored) setTrialDays(Number(stored));
  }, []);

  // Ctrl+K → search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  const unreadCount = notifs.filter(n => !n.isRead).length;
  const sidebarW = isMobile ? 0 : (collapsed ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN);

  /* ── Sidebar content ── */
  const SidebarContent = () => (
    <div style={{
      width: collapsed && !isMobile ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN,
      height: "100%", display: "flex", flexDirection: "column",
      background: "var(--sidebar-bg,#0f172a)", overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{
        height: 64, display: "flex", alignItems: "center",
        padding: "0 16px", gap: 10,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        {org?.logoUrl ? (
          <img src={org.logoUrl} alt="logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "var(--primary,#7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, flexShrink: 0,
          }}>✂️</div>
        )}
        {(!collapsed || isMobile) && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {org?.name ?? "xCut"}
            </div>
            <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, marginTop: 1 }}>
              {org?.plan ?? "Salon"} Planı
            </div>
          </div>
        )}
        {!isMobile && (
          <button onClick={() => setCollapsed(c => !c)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#475569",
            padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, marginLeft: collapsed ? 0 : "auto", flexShrink: 0,
          }}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#475569",
            padding: 4, marginLeft: "auto", flexShrink: 0,
          }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Search bar (full sidebar only) */}
      {(!collapsed || isMobile) && (
        <div style={{ padding: "12px 12px 4px" }}>
          <button onClick={() => { setSearchOpen(true); setSidebarOpen(false); }} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "9px 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer", color: "#64748b", fontSize: 13, textAlign: "left",
          }}>
            <Search size={14} />
            <span style={{ flex: 1 }}>Ara...</span>
            <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.07)", color: "#475569" }}>⌘K</kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {ALL_NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          const hasBadge = href === "/appointments" && pendingCount > 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              style={{
                display: "flex", alignItems: "center",
                gap: 10, padding: "10px 14px",
                margin: "1px 8px", borderRadius: 10,
                textDecoration: "none",
                background: active ? "rgba(124,58,237,0.25)" : "transparent",
                color: active ? "#fff" : "#94a3b8",
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                transition: "background 0.12s, color 0.12s",
                position: "relative",
                justifyContent: collapsed && !isMobile ? "center" : undefined,
              }}
            >
              <Icon size={18} style={{ flexShrink: 0, color: active ? "var(--primary,#7c3aed)" : undefined }} />
              {(!collapsed || isMobile) && <span style={{ flex: 1, whiteSpace: "nowrap" }}>{label}</span>}
              {hasBadge && (!collapsed || isMobile) && (
                <span style={{
                  background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800,
                  padding: "1px 6px", borderRadius: 999, flexShrink: 0,
                }}>{pendingCount}</span>
              )}
              {hasBadge && collapsed && !isMobile && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, background: "#ef4444", borderRadius: "50%",
                }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User area */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "12px 12px",
        flexShrink: 0,
      }}>
        {me && (!collapsed || isMobile) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "var(--primary,#7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 13,
            }}>
              {me.firstName[0]}{me.lastName[0]}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {me.firstName} {me.lastName}
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>{me.role}</div>
            </div>
          </div>
        )}
        <button onClick={logout} style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: 8, padding: "9px 10px", borderRadius: 10,
          background: "rgba(239,68,68,0.08)", border: "none",
          color: "#f87171", cursor: "pointer", fontWeight: 600, fontSize: 13,
          justifyContent: collapsed && !isMobile ? "center" : undefined,
        }}>
          <LogOut size={15} />
          {(!collapsed || isMobile) && "Çıkış Yap"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg,#f6f7fb)" }}>

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{
          width: collapsed ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN,
          flexShrink: 0, position: "sticky", top: 0, height: "100vh",
          transition: "width 0.2s",
        }}>
          <SidebarContent />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <>
          <div onClick={() => setSidebarOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 400,
          }} />
          <div style={{
            position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 401,
            boxShadow: "4px 0 32px rgba(0,0,0,0.25)",
            animation: "slideIn 0.2s ease",
          }}>
            <SidebarContent />
          </div>
        </>
      )}

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* Trial banner */}
        {trialDays !== null && trialDays <= 14 && (
          <div style={{
            background: trialDays <= 3 ? "#fef2f2" : "#fffbeb",
            borderBottom: `1px solid ${trialDays <= 3 ? "#fee2e2" : "#fde68a"}`,
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            color: trialDays <= 3 ? "#b42318" : "#92400e",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {trialDays <= 3 ? "🚨" : "⚠️"}&nbsp;
            Deneme süreniz {trialDays <= 0 ? "doldu" : `${trialDays} gün içinde dolacak`}.
            <a href="/ayarlar" style={{ color: "inherit", textDecoration: "underline", marginLeft: 4 }}>Planı yükselt →</a>
          </div>
        )}

        {/* Announcement banner */}
        {announcement && (
          <div style={{
            background: "var(--primary,#7c3aed)", color: "#fff",
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            📢 {announcement}
            <button onClick={() => setAnnouncement(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#fff", cursor: "pointer", opacity: 0.7, fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Top header */}
        <header style={{
          height: 64, display: "flex", alignItems: "center",
          padding: "0 20px", gap: 12,
          background: "var(--surface,#fff)",
          borderBottom: "1px solid var(--border,#eaecf0)",
          position: "sticky", top: 0, zIndex: 100, flexShrink: 0,
        }}>
          {isMobile && (
            <button onClick={() => setSidebarOpen(true)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-2,#344054)", padding: 6, borderRadius: 8,
              display: "flex", alignItems: "center",
            }}>
              <Menu size={22} />
            </button>
          )}

          {title && (
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--text,#101828)", letterSpacing: "-0.4px", lineHeight: 1.2 }}>
                {title}
              </h1>
              {description && (
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{description}</p>
              )}
            </div>
          )}
          {!title && <div style={{ flex: 1 }} />}

          {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}

          {/* Search */}
          <button onClick={() => setSearchOpen(true)} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 10,
            border: "1px solid var(--border,#e4e7ec)",
            background: "var(--surface-2,#f8fafc)",
            cursor: "pointer", color: "#94a3b8", fontSize: 13,
          }}>
            <Search size={15} />
            {!isMobile && <span>Ara</span>}
            {!isMobile && <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--border,#e4e7ec)", marginLeft: 4 }}>⌘K</kbd>}
          </button>

          {/* Dark mode toggle */}
          <button onClick={toggleTheme} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border,#e4e7ec)",
            background: "var(--surface-2,#f8fafc)", cursor: "pointer", fontSize: 17,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {/* Support */}
          <button onClick={() => setSupportOpen(true)} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border,#e4e7ec)",
            background: "var(--surface-2,#f8fafc)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#64748b",
          }}>
            <HeadphonesIcon size={17} />
          </button>

          {/* Notifications */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setNotifOpen(o => !o)} style={{
              width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border,#e4e7ec)",
              background: "var(--surface-2,#f8fafc)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#64748b", position: "relative",
            }}>
              <Bell size={17} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  width: 8, height: 8, background: "#ef4444", borderRadius: "50%",
                }} />
              )}
            </button>

            {notifOpen && (
              <>
                <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 8px)",
                  width: 320, background: "var(--surface,#fff)",
                  borderRadius: 14, border: "1px solid var(--border,#eaecf0)",
                  boxShadow: "0 8px 32px rgba(15,23,42,0.12)", zIndex: 201,
                  overflow: "hidden",
                }}>
                  <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border,#eaecf0)", fontWeight: 800, fontSize: 14 }}>
                    Bildirimler {unreadCount > 0 && <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 999, background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 700 }}>{unreadCount}</span>}
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Bildirim yok</div>
                    ) : notifs.map(n => (
                      <div key={n.id} style={{
                        padding: "12px 16px", borderBottom: "1px solid var(--border,#f2f4f7)",
                        background: n.isRead ? "transparent" : "var(--primary-light,#ede9fe)" + "44",
                        fontSize: 13,
                      }}>
                        <div style={{ fontWeight: n.isRead ? 400 : 700, color: "var(--text,#101828)" }}>{n.message}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{new Date(n.createdAt).toLocaleString("tr-TR")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User chip */}
          {me && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px 6px 6px", borderRadius: 10,
              border: "1px solid var(--border,#e4e7ec)",
              background: "var(--surface-2,#f8fafc)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "var(--primary,#7c3aed)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 800, fontSize: 11,
              }}>
                {me.firstName[0]}{me.lastName[0]}
              </div>
              {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2,#344054)" }}>{me.firstName}</span>}
            </div>
          )}
        </header>

        {/* Page content */}
        <main style={{
          flex: 1,
          padding: isMobile ? "16px 16px 80px" : "24px 28px",
          maxWidth: "100%",
          overflowX: "hidden",
        }}>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {BOTTOM_NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, textDecoration: "none",
              color: active ? "var(--primary,#7c3aed)" : "#94a3b8",
              fontSize: 10, fontWeight: active ? 700 : 500,
              padding: "8px 4px",
            }}>
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Global Search */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Support Modal */}
      {supportOpen && (
        <>
          <div onClick={() => setSupportOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 500 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: "min(420px, 92vw)", zIndex: 501,
            background: "var(--surface,#fff)", borderRadius: 20,
            boxShadow: "0 24px 64px rgba(15,23,42,0.18)",
            border: "1px solid var(--border,#eaecf0)",
            padding: 28,
          }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>💬 Destek</div>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
              Sorun veya öneriniz için bizimle iletişime geçin.
            </p>
            <a href="mailto:destek@xshield.com.tr" style={{
              display: "flex", alignItems: "center", gap: 10, padding: "13px 16px",
              borderRadius: 12, background: "var(--primary-light,#ede9fe)",
              color: "var(--primary,#7c3aed)", fontWeight: 700, fontSize: 14,
              textDecoration: "none", marginBottom: 10,
            }}>
              📧 destek@xshield.com.tr
            </a>
            <button onClick={() => setSupportOpen(false)} style={{
              width: "100%", padding: "12px 0", borderRadius: 12,
              border: "1px solid var(--border,#e4e7ec)", background: "transparent",
              color: "var(--text-2,#344054)", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 8,
            }}>
              Kapat
            </button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, clearToken } from "@/lib/api";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/hooks/useTheme";
import GlobalSearch from "@/components/GlobalSearch";
import PanelAssistant from "@/components/PanelAssistant";
import {
  LayoutDashboard, Calendar, CalendarDays, Users, Scissors,
  ShoppingCart, CheckSquare, DollarSign, Globe,
  Settings, Bell, Search, Menu, X, LogOut, ChevronLeft,
  ChevronRight, Sparkles, HeadphonesIcon, CreditCard, ShieldCheck,
  BarChart3, ClipboardList, UserCog, Monitor, Mail, Tv,
} from "lucide-react";
import { exitImpersonation, getImpersonatingSalon, setToken } from "@/lib/api";

/* ── Types ───────────────────────────────────────────────────────── */
type AnnItem = { id: string; title: string; body?: string; type: string };

type SMsg    = { id: string; body: string; isFromAdmin: boolean; authorName: string; createdAtUtc: string };
type STicket = { id: string; subject: string; status: string; pageContext?: string; createdAtUtc: string; messageCount: number; messages: SMsg[]; userName: string };

type Me = {
  userId: string;
  salonId: string;
  salonName: string;
  userName: string;
  fullName: string;
  email: string;
  role: string;
  activeModules: string[];
  permissionModules: string[];
  isSelfOnly: boolean;
  stylistId?: string;
  profilePhotoUrl?: string;
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
  title?: string;
  message: string;
  type?: string;
  link?: string;
  createdAt: string;
  isRead: boolean;
};

type SalonAccess = { salonId: string; salonName: string; isHome: boolean };

/* ── Navigation ──────────────────────────────────────────────────── */
type NavItem = { href: string; label: string; Icon: React.ElementType; module: string };
type NavGroup = { label?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/dashboard",    label: "Dashboard",       Icon: LayoutDashboard, module: "core" },
    ],
  },
  {
    label: "Randevu & Operasyon",
    items: [
      { href: "/appointments", label: "Randevular",      Icon: Calendar,        module: "appointments" },
      { href: "/takvim",       label: "Takvim",          Icon: CalendarDays,    module: "appointments" },
      { href: "/sira",         label: "Sıra Yönetimi",   Icon: Monitor,         module: "appointments" },
      { href: "/bekleme",      label: "Bekleme Listesi", Icon: ClipboardList,   module: "appointments" },
      { href: "/kiosk",        label: "Kiosk",           Icon: Tv,              module: "appointments" },
    ],
  },
  {
    label: "Müşteri",
    items: [
      { href: "/customers",    label: "Müşteriler",      Icon: Users,           module: "customers" },
      { href: "/crm",          label: "CRM",             Icon: Mail,            module: "whatsapp" },
    ],
  },
  {
    label: "Personel & Hizmetler",
    items: [
      { href: "/stylists",     label: "Stilistler",      Icon: Scissors,        module: "staff" },
      { href: "/personel",     label: "Personel",        Icon: UserCog,         module: "staff" },
      { href: "/services",     label: "Hizmetler",       Icon: Sparkles,        module: "services" },
    ],
  },
  {
    label: "Finans",
    items: [
      { href: "/kasa",         label: "Kasa",            Icon: CreditCard,      module: "kasa" },
      { href: "/finance",      label: "Finans",          Icon: DollarSign,      module: "finance" },
      { href: "/stock",        label: "Stok",            Icon: ShoppingCart,    module: "stock" },
    ],
  },
  {
    label: "Büyüme",
    items: [
      { href: "/raporlar",     label: "Raporlar",        Icon: BarChart3,       module: "reports" },
      { href: "/tasks",        label: "Görevler",        Icon: CheckSquare,     module: "tasks" },
      { href: "/website",      label: "Web Sitesi",      Icon: Globe,           module: "website" },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { href: "/denetim",      label: "Denetim",         Icon: ShieldCheck,     module: "audit" },
      { href: "/ayarlar",      label: "Ayarlar",         Icon: Settings,        module: "core" },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap(g => g.items);

const ADMIN_ROLES = ["SuperAdmin", "SalonYonetici", "Admin"];
const ALL_MODULES = ["appointments","customers","staff","services","stock","tasks","kasa","finance","reports","whatsapp","audit","website","settings"];

const BOTTOM_NAV = [
  { href: "/appointments", label: "Randevular", Icon: Calendar },
  { href: "/takvim",       label: "Takvim",     Icon: CalendarDays },
  { href: "/sira",         label: "Sıra",       Icon: Monitor },
  { href: "/kasa",         label: "Kasa",       Icon: CreditCard },
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

  const [me,               setMe]               = useState<Me | null>(null);
  const [permChecked,      setPermChecked]      = useState(false);
  const [org,              setOrg]              = useState<Org | null>(null);
  const [sidebarOpen,      setSidebarOpen]      = useState(false);   // mobile drawer
  const [collapsed,        setCollapsed]        = useState(false);   // desktop collapse
  const [searchOpen,       setSearchOpen]       = useState(false);
  const [notifOpen,        setNotifOpen]        = useState(false);
  const [notifs,           setNotifs]           = useState<Notification[]>([]);
  const [pendingCount,     setPendingCount]     = useState(0);
  const [supportOpen,      setSupportOpen]      = useState(false);
  const [supportTickets,   setSupportTickets]   = useState<STicket[]>([]);
  const [supportView,      setSupportView]      = useState<"list"|"create"|"detail">("list");
  const [selectedTicket,   setSelectedTicket]   = useState<STicket | null>(null);
  const [ticketForm,       setTicketForm]       = useState({ subject: "", body: "" });
  const [ticketReply,      setTicketReply]      = useState("");
  const [ticketLoading,    setTicketLoading]    = useState(false);
  const [ticketSending,    setTicketSending]    = useState(false);
  const [trialDays,        setTrialDays]        = useState<number | null>(null);
  const [allAnnouncements, setAllAnnouncements] = useState<AnnItem[]>([]);
  const [annPopupOpen,     setAnnPopupOpen]     = useState(false);
  const [dismissedAnns,    setDismissedAnns]    = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("dismissedAnns") ?? "[]")); }
    catch { return new Set<string>(); }
  });
  const [impersonatingSalon, setImpersonatingSalon] = useState<string | null>(null);
  const [salonList,          setSalonList]          = useState<SalonAccess[]>([]);
  const [salonSwitchOpen,    setSalonSwitchOpen]    = useState(false);
  const [salonSwitching,     setSalonSwitching]     = useState(false);

  // Load user data + permission guard
  useEffect(() => {
    apiFetch("/Auth/me").then(r => {
      if (r.status === 401) { clearToken(); router.replace("/login"); return null; }
      return r.ok ? r.json() : null;
    }).then((d: Me | null) => {
      setMe(d);
      setPermChecked(true);
    });
    apiFetch("/Settings/organization").then(r => r.ok ? r.json() : null).then(d => {
      setOrg(d);
      if (d?.primaryColor) {
        document.documentElement.style.setProperty("--primary", d.primaryColor);
      }
      if (d?.trialEndsAtUtc && d?.plan !== "pro") {
        const days = Math.max(0, Math.ceil((new Date(d.trialEndsAtUtc).getTime() - Date.now()) / 86400000));
        setTrialDays(days);
        localStorage.setItem("trialDaysLeft", String(days));
      } else if (d?.plan === "pro") {
        setTrialDays(null);
        localStorage.removeItem("trialDaysLeft");
      }
    });
    apiFetch("/AppointmentRequests/count-pending").then(r => r.ok ? r.json() : 0).then(setPendingCount);
    apiFetch("/Notifications?limit=20").then(r => r.ok ? r.json() : []).then(setNotifs);
    apiFetch("/Announcements/active").then(r => r.ok ? r.json() : []).then((list: AnnItem[]) => {
      if (!Array.isArray(list) || list.length === 0) return;
      setAllAnnouncements(list);
      const dismissed = (() => {
        try { return new Set<string>(JSON.parse(localStorage.getItem("dismissedAnns") ?? "[]")); }
        catch { return new Set<string>(); }
      })();
      if (list.some(a => !dismissed.has(a.id))) setAnnPopupOpen(true);
    });
    const stored = localStorage.getItem("trialDaysLeft");
    if (stored) setTrialDays(Number(stored));
    setImpersonatingSalon(getImpersonatingSalon());
    apiFetch("/Auth/my-salons").then(r => r.ok ? r.json() : []).then((list: SalonAccess[]) => {
      if (list.length > 1) setSalonList(list);
    });
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

  const switchSalon = useCallback(async (targetSalonId: string) => {
    setSalonSwitching(true);
    try {
      const r = await apiFetch("/Auth/switch-salon", {
        method: "POST",
        body: JSON.stringify({ targetSalonId }),
      });
      if (r.ok) {
        const data = await r.json();
        setToken(data.accessToken);
        setSalonSwitchOpen(false);
        window.location.href = "/dashboard";
      }
    } finally {
      setSalonSwitching(false);
    }
  }, []);

  const dismissAnn = useCallback((id: string) => {
    setDismissedAnns(prev => {
      const next = new Set(prev).add(id);
      localStorage.setItem("dismissedAnns", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const undismissAnn = useCallback((id: string) => {
    setDismissedAnns(prev => {
      const next = new Set(prev);
      next.delete(id);
      localStorage.setItem("dismissedAnns", JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const openSupport = useCallback(async () => {
    setSupportOpen(true);
    setSupportView("list");
    setTicketLoading(true);
    const r = await apiFetch("/Support/my");
    if (r.ok) setSupportTickets(await r.json());
    setTicketLoading(false);
  }, []);

  const createTicket = useCallback(async () => {
    if (!ticketForm.subject.trim() || !ticketForm.body.trim()) return;
    setTicketSending(true);
    const r = await apiFetch("/Support", {
      method: "POST",
      body: JSON.stringify({
        subject: ticketForm.subject,
        body: ticketForm.body,
        pageContext: pathname,
      }),
    });
    setTicketSending(false);
    if (r.ok) {
      setTicketForm({ subject: "", body: "" });
      setSupportView("list");
      const r2 = await apiFetch("/Support/my");
      if (r2.ok) setSupportTickets(await r2.json());
    }
  }, [ticketForm, pathname]);

  const sendReplyToTicket = useCallback(async () => {
    if (!ticketReply.trim() || !selectedTicket) return;
    setTicketSending(true);
    const r = await apiFetch(`/Support/${selectedTicket.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: ticketReply }),
    });
    setTicketSending(false);
    if (r.ok) {
      setTicketReply("");
      const r2 = await apiFetch("/Support/my");
      if (r2.ok) {
        const list: STicket[] = await r2.json();
        setSupportTickets(list);
        const updated = list.find(t => t.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      }
    }
  }, [ticketReply, selectedTicket]);

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
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter(({ module }) => {
            if (module === "core") return true;
            if (!me) return true;
            const isAdmin = ADMIN_ROLES.includes(me.role ?? "");
            const perms = me.permissionModules ?? [];
            if (isAdmin && perms.length === 0) return true;
            return perms.includes(module);
          });
          if (visibleItems.length === 0) return null;
          return (
            <div key={gi}>
              {gi > 0 && (
                <div style={{ margin: collapsed && !isMobile ? "8px 12px" : "8px 16px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  {(!collapsed || isMobile) && group.label && (
                    <div style={{ paddingTop: 8, fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.09em", textTransform: "uppercase" }}>
                      {group.label}
                    </div>
                  )}
                </div>
              )}
              {visibleItems.map(({ href, label, Icon }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                const hasBadge = href === "/appointments" && pendingCount > 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    style={{
                      display: "flex", alignItems: "center",
                      gap: 10, padding: "9px 14px",
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
            </div>
          );
        })}

        {/* SuperAdmin-only link */}
        {me?.role === "SuperAdmin" && (() => {
          const active = pathname.startsWith("/superadmin");
          return (
            <>
              <div style={{ margin: collapsed && !isMobile ? "8px 12px" : "8px 16px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                {(!collapsed || isMobile) && (
                  <div style={{ paddingTop: 8, fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.09em", textTransform: "uppercase" }}>
                    Platform
                  </div>
                )}
              </div>
              <Link
                href="/superadmin"
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: "flex", alignItems: "center",
                  gap: 10, padding: "10px 14px",
                  margin: "1px 8px", borderRadius: 10,
                  textDecoration: "none",
                  background: active ? "rgba(234,179,8,0.2)" : "transparent",
                  color: active ? "#fbbf24" : "#78716c",
                  fontWeight: active ? 700 : 500,
                  fontSize: 14,
                  transition: "background 0.12s, color 0.12s",
                  justifyContent: collapsed && !isMobile ? "center" : undefined,
                }}
              >
                <ShieldCheck size={18} style={{ flexShrink: 0, color: active ? "#fbbf24" : undefined }} />
                {(!collapsed || isMobile) && <span style={{ flex: 1, whiteSpace: "nowrap" }}>Platform Yönetimi</span>}
              </Link>
            </>
          );
        })()}
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
              {me.fullName[0] ?? "?"}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {me.fullName}
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
    <div style={{ display: "flex", alignItems: "flex-start", background: "var(--bg,#f6f7fb)" }}>

      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{
          width: collapsed ? SIDEBAR_W_CLOSED : SIDEBAR_W_OPEN,
          flexShrink: 0, position: "sticky", top: 0, height: "100dvh",
          alignSelf: "flex-start",
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
      <div style={{ flex: 1, minWidth: 0, minHeight: "100dvh" }}>

        {/* Impersonation banner */}
        {impersonatingSalon && (
          <div style={{
            background: "#7f1d1d", color: "#fecaca",
            padding: "8px 20px", fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 10,
            borderBottom: "2px solid #991b1b",
          }}>
            <ShieldCheck size={16} />
            <span><strong>{impersonatingSalon}</strong> salonu adına bağlısınız</span>
            <button
              onClick={() => {
                exitImpersonation();
                window.location.href = "/superadmin";
              }}
              style={{
                marginLeft: "auto", padding: "4px 14px", borderRadius: 8,
                background: "#991b1b", border: "1px solid #b91c1c",
                color: "#fecaca", cursor: "pointer", fontWeight: 700, fontSize: 12,
              }}
            >
              Bağlantıyı Kes
            </button>
          </div>
        )}

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
              {description && !isMobile && (
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{description}</p>
              )}
            </div>
          )}
          {!title && <div style={{ flex: 1 }} />}

          {!isMobile && actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}

          {/* Salon switcher — only if user has access to multiple salons */}
          {salonList.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setSalonSwitchOpen(o => !o)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 10,
                  border: "1px solid var(--border,#e4e7ec)",
                  background: "var(--surface-2,#f8fafc)",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                  color: "var(--text-2,#344054)", maxWidth: 180,
                }}
              >
                <span style={{ fontSize: 14 }}>🏪</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {me?.salonName ?? "Salon"}
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 2 }}>▾</span>
              </button>

              {salonSwitchOpen && (
                <>
                  <div onClick={() => setSalonSwitchOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
                  <div style={{
                    position: "fixed", top: 72, zIndex: 201,
                    background: "var(--surface,#fff)",
                    borderRadius: 12, border: "1px solid var(--border,#eaecf0)",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                    minWidth: 220, overflow: "hidden",
                  }}>
                    <div style={{ padding: "10px 14px 6px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Salon Geçişi
                    </div>
                    {salonList.map(s => {
                      const isActive = s.salonId === me?.salonId;
                      return (
                        <button
                          key={s.salonId}
                          onClick={() => !isActive && switchSalon(s.salonId)}
                          disabled={salonSwitching || isActive}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            width: "100%", padding: "10px 14px", border: "none",
                            background: isActive ? "var(--primary-light,#ede9fe)" : "transparent",
                            cursor: isActive ? "default" : "pointer", textAlign: "left",
                            fontSize: 13, fontWeight: isActive ? 700 : 500,
                            color: isActive ? "#7c3aed" : "var(--text,#101828)",
                          }}
                        >
                          <span style={{ fontSize: 15 }}>{s.isHome ? "🏠" : "🏪"}</span>
                          <span style={{ flex: 1 }}>{s.salonName}</span>
                          {isActive && <span style={{ fontSize: 10, color: "#7c3aed" }}>✓</span>}
                        </button>
                      );
                    })}
                    {salonSwitching && (
                      <div style={{ padding: "8px 14px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
                        Geçiş yapılıyor...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Search — desktop only */}
          {!isMobile && (
            <button onClick={() => setSearchOpen(true)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 10,
              border: "1px solid var(--border,#e4e7ec)",
              background: "var(--surface-2,#f8fafc)",
              cursor: "pointer", color: "#94a3b8", fontSize: 13,
            }}>
              <Search size={15} />
              <span>Ara</span>
              <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--border,#e4e7ec)", marginLeft: 4 }}>⌘K</kbd>
            </button>
          )}

          {/* Dark mode */}
          <button onClick={toggleTheme} style={{
            width: 40, height: 40, borderRadius: 10, border: "1px solid var(--border,#e4e7ec)",
            background: "var(--surface-2,#f8fafc)", cursor: "pointer", fontSize: 17,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {/* Support */}
          <button onClick={openSupport} style={{
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
                  position: "absolute", top: -4, right: -4,
                  minWidth: 18, height: 18, padding: "0 5px",
                  background: "#ef4444", borderRadius: 999,
                  color: "#fff", fontSize: 10, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "2px solid var(--surface-2,#f8fafc)",
                }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
                <div style={{
                  position: "fixed", right: 12, top: 72,
                  width: "min(380px, calc(100vw - 24px))", background: "var(--surface,#fff)",
                  borderRadius: 14, border: "1px solid var(--border,#eaecf0)",
                  boxShadow: "0 8px 32px rgba(15,23,42,0.12)", zIndex: 201,
                  overflow: "hidden",
                }}>
                  {/* Announcements section */}
                  {allAnnouncements.length > 0 && (
                    <>
                      <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.06em" }}>Duyurular</span>
                        {allAnnouncements.some(a => !dismissedAnns.has(a.id)) && (
                          <button onClick={() => setAnnPopupOpen(true)} style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                            Tümünü Gör
                          </button>
                        )}
                      </div>
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {allAnnouncements.map(a => {
                          const isDismissed = dismissedAnns.has(a.id);
                          const ANN_DOT: Record<string, string> = { Info: "#3b82f6", Warning: "#f59e0b", Error: "#ef4444", Success: "#22c55e" };
                          const dot = ANN_DOT[a.type] ?? ANN_DOT.Info;
                          return (
                            <div key={a.id} style={{
                              padding: "10px 16px", borderBottom: "1px solid var(--border,#f2f4f7)",
                              display: "flex", alignItems: "flex-start", gap: 10,
                              opacity: isDismissed ? 0.55 : 1,
                            }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dot, marginTop: 5, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text,#101828)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                                {isDismissed && <span style={{ fontSize: 10, color: "#94a3b8" }}>Okundu</span>}
                              </div>
                              {isDismissed ? (
                                <button onClick={() => { undismissAnn(a.id); setAnnPopupOpen(true); setNotifOpen(false); }}
                                  style={{ fontSize: 10, color: "#7c3aed", background: "none", border: "1px solid #ddd6fe", borderRadius: 6, padding: "2px 7px", cursor: "pointer", flexShrink: 0 }}>
                                  Yeniden Göster
                                </button>
                              ) : (
                                <button onClick={() => dismissAnn(a.id)}
                                  style={{ fontSize: 16, lineHeight: 1, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: "0 2px", flexShrink: 0 }}>×</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ height: 1, background: "var(--border,#eaecf0)" }} />
                    </>
                  )}

                  {/* Notifications header */}
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>
                      Bildirimler
                      {unreadCount > 0 && (
                        <span style={{ marginLeft: 6, padding: "1px 7px", borderRadius: 999, background: "#7c3aed", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                          {unreadCount}
                        </span>
                      )}
                    </span>
                    {unreadCount > 0 && (
                      <button onClick={async () => {
                        await apiFetch("/Notifications/read-all", { method: "PATCH" });
                        setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
                      }} style={{ fontSize: 11, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                        Tümünü oku
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: 360, overflowY: "auto" }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Bildirim yok</div>
                    ) : notifs.map(n => {
                      const TYPE_COLOR: Record<string, string> = {
                        warning: "#f59e0b",
                        error:   "#ef4444",
                        success: "#22c55e",
                        info:    "#3b82f6",
                      };
                      const borderColor = TYPE_COLOR[n.type ?? "info"] ?? "#3b82f6";
                      return (
                        <div key={n.id}
                          onClick={async () => {
                            if (!n.isRead) {
                              await apiFetch(`/Notifications/${n.id}/read`, { method: "PATCH" });
                              setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
                            }
                            if (n.link) { setNotifOpen(false); router.push(n.link); }
                          }}
                          style={{
                            padding: "11px 16px 11px 14px",
                            borderBottom: "1px solid var(--border,#f2f4f7)",
                            borderLeft: `3px solid ${n.isRead ? "transparent" : borderColor}`,
                            background: n.isRead ? "transparent" : "var(--surface-2,#f8fafc)",
                            fontSize: 13, cursor: n.link ? "pointer" : "default",
                            display: "flex", gap: 10, alignItems: "flex-start",
                            transition: "background 0.15s",
                          }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: n.isRead ? "#cbd5e1" : borderColor,
                            marginTop: 5, flexShrink: 0,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {n.title && (
                              <div style={{ fontWeight: 700, fontSize: 12, color: n.isRead ? "#64748b" : "var(--text,#101828)", marginBottom: 2 }}>
                                {n.title}
                              </div>
                            )}
                            <div style={{ fontWeight: n.isRead ? 400 : 500, color: n.isRead ? "#64748b" : "var(--text,#101828)", lineHeight: 1.45 }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                              {new Date(n.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {n.link && !n.isRead && (
                                <span style={{ marginLeft: 8, color: "#7c3aed", fontWeight: 600 }}>Görüntüle →</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                {me.fullName[0] ?? "?"}
              </div>
              {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2,#344054)" }}>{me.fullName.split(" ")[0]}</span>}
            </div>
          )}
        </header>

        {/* Page content */}
        <main style={{
          padding: isMobile ? "16px 16px 80px" : "24px 28px",
          maxWidth: "100%",
          overflowX: "clip",
        }}>
          {isMobile && actions && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              {actions}
            </div>
          )}
          {!permChecked ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
              <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : (() => {
            if (!me) return children;
            const navEntry = ALL_NAV.find(n => pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href)));
            if (navEntry && navEntry.module !== "core") {
              const isAdmin = ADMIN_ROLES.includes(me.role ?? "");
              const perms   = me.permissionModules ?? [];
              const allowed = (isAdmin && perms.length === 0) || perms.includes(navEntry.module);
              if (!allowed) return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 48 }}>🔒</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text,#101828)" }}>Erişim Yetkiniz Yok</div>
                  <div style={{ fontSize: 14, color: "#64748b", maxWidth: 340 }}>Bu sayfayı görüntülemek için gerekli yetkiye sahip değilsiniz. Yöneticinizle iletişime geçin.</div>
                </div>
              );
            }
            return children;
          })()}
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
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: active ? "var(--primary-light,#ede9fe)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}>
                <Icon size={19} />
              </div>
              {label}
            </Link>
          );
        })}
        {/* Menü — sidebar açar */}
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 3, border: "none", background: "none",
            cursor: "pointer", color: "#94a3b8", fontSize: 10, fontWeight: 500,
            padding: "8px 4px",
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Menu size={19} />
          </div>
          Menü
        </button>
      </nav>

      {/* Global Search */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Support Drawer */}
      {supportOpen && (
        <>
          <div onClick={() => setSupportOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 500 }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: "min(480px, 100vw)", zIndex: 501,
            background: "var(--surface,#fff)",
            boxShadow: "-8px 0 40px rgba(15,23,42,0.14)",
            display: "flex", flexDirection: "column",
            borderLeft: "1px solid var(--border,#eaecf0)",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              {supportView !== "list" && (
                <button onClick={() => setSupportView("list")}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, borderRadius: 6 }}>
                  ← Geri
                </button>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {supportView === "list" ? "💬 Destek" : supportView === "create" ? "Yeni Destek Talebi" : selectedTicket?.subject ?? "Talep Detayı"}
                </div>
                {supportView === "list" && <div style={{ fontSize: 12, color: "#64748b" }}>Taleplerinizi buradan takip edebilirsiniz.</div>}
              </div>
              <button onClick={() => setSupportOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              {supportView === "list" && (
                <>
                  <button onClick={() => setSupportView("create")} style={{
                    width: "100%", padding: "11px 16px", borderRadius: 12, border: "none",
                    background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 16,
                  }}>+ Yeni Talep Oluştur</button>

                  {ticketLoading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Yükleniyor...</div>
                  ) : supportTickets.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🎫</div>
                      <div style={{ fontSize: 13 }}>Henüz destek talebiniz yok.</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {supportTickets.map(t => {
                        const ST: Record<string, { color: string; bg: string; label: string }> = {
                          Open:       { color: "#b42318", bg: "#fef3f2", label: "Açık" },
                          InProgress: { color: "#d97706", bg: "#fffbeb", label: "İşlemde" },
                          Resolved:   { color: "#059669", bg: "#f0fdf4", label: "Çözüldü" },
                        };
                        const s = ST[t.status] ?? ST.Open;
                        return (
                          <div key={t.id} onClick={() => { setSelectedTicket(t); setSupportView("detail"); }}
                            style={{ background: "var(--surface-2,#f8fafc)", border: "1px solid #e4e7ec", borderRadius: 12, padding: 14, cursor: "pointer" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text,#101828)", flex: 1 }}>{t.subject}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color, flexShrink: 0 }}>{s.label}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "flex", gap: 10 }}>
                              <span>{new Date(t.createdAtUtc).toLocaleDateString("tr-TR")}</span>
                              {t.messageCount > 0 && <span>💬 {t.messageCount} mesaj</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {supportView === "create" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Konu *</label>
                    <input value={ticketForm.subject}
                      onChange={e => setTicketForm(p => ({ ...p, subject: e.target.value }))}
                      placeholder="Örn: Randevu sayfası açılmıyor"
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#344054", display: "block", marginBottom: 4 }}>Açıklama *</label>
                    <textarea value={ticketForm.body}
                      onChange={e => setTicketForm(p => ({ ...p, body: e.target.value }))}
                      placeholder="Sorunu veya önerinizi detaylıca anlatın..."
                      rows={6}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#64748b" }}>
                    📍 Bulunduğunuz sayfa otomatik olarak kaydedilecek: <strong>{pathname}</strong>
                  </div>
                  <button onClick={createTicket} disabled={ticketSending || !ticketForm.subject.trim() || !ticketForm.body.trim()}
                    style={{
                      padding: "12px 20px", borderRadius: 12, border: "none",
                      background: ticketSending ? "#e9d5ff" : "#7c3aed", color: "#fff",
                      fontWeight: 700, fontSize: 14, cursor: ticketSending ? "not-allowed" : "pointer",
                    }}>
                    {ticketSending ? "Gönderiliyor..." : "Talebi Gönder"}
                  </button>
                </div>
              )}

              {supportView === "detail" && selectedTicket && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {selectedTicket.pageContext && (
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#64748b" }}>
                      📍 Sayfa: <strong>{selectedTicket.pageContext}</strong>
                    </div>
                  )}
                  {selectedTicket.messages.map(m => (
                    <div key={m.id} style={{
                      background: m.isFromAdmin ? "#eff8ff" : "var(--surface-2,#f8fafc)",
                      border: `1px solid ${m.isFromAdmin ? "#bfdbfe" : "#e4e7ec"}`,
                      borderRadius: 12, padding: 14,
                      marginLeft: m.isFromAdmin ? 16 : 0,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: m.isFromAdmin ? "#1d4ed8" : "#64748b", marginBottom: 6, display: "flex", gap: 8, alignItems: "center" }}>
                        {m.authorName}
                        {m.isFromAdmin && <span style={{ background: "#bfdbfe", color: "#1d4ed8", padding: "1px 6px", borderRadius: 999, fontSize: 10 }}>Destek</span>}
                        <span style={{ marginLeft: "auto", opacity: 0.7 }}>{new Date(m.createdAtUtc).toLocaleString("tr-TR")}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text,#101828)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.body}</div>
                    </div>
                  ))}
                  {selectedTicket.status !== "Resolved" && (
                    <div style={{ marginTop: 8 }}>
                      <textarea value={ticketReply}
                        onChange={e => setTicketReply(e.target.value)}
                        placeholder="Yanıt yaz..."
                        rows={3}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #e4e7ec", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
                      <button onClick={sendReplyToTicket} disabled={ticketSending || !ticketReply.trim()}
                        style={{
                          marginTop: 8, padding: "10px 20px", borderRadius: 10, border: "none",
                          background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 13,
                          cursor: ticketSending ? "not-allowed" : "pointer",
                        }}>
                        {ticketSending ? "Gönderiliyor..." : "Gönder"}
                      </button>
                    </div>
                  )}
                  {selectedTicket.status === "Resolved" && (
                    <div style={{ textAlign: "center", padding: "12px 0", color: "#059669", fontWeight: 600, fontSize: 13 }}>
                      ✅ Bu talep çözüme kavuşturulmuştur.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Announcement Popup */}
      {annPopupOpen && allAnnouncements.filter(a => !dismissedAnns.has(a.id)).length > 0 && (
        <>
          <div onClick={() => setAnnPopupOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 600 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(500px, calc(100vw - 32px))",
            maxHeight: "80vh",
            background: "var(--surface,#fff)",
            borderRadius: 18,
            boxShadow: "0 16px 64px rgba(15,23,42,0.22)",
            zIndex: 601,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Bell size={18} style={{ color: "#7c3aed", flexShrink: 0 }} />
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Duyurular</span>
              <button
                onClick={() => {
                  allAnnouncements.filter(a => !dismissedAnns.has(a.id)).forEach(a => dismissAnn(a.id));
                  setAnnPopupOpen(false);
                }}
                style={{ fontSize: 12, color: "#64748b", background: "none", border: "1px solid var(--border,#e4e7ec)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", marginRight: 4 }}
              >Tümünü Kapat</button>
              <button onClick={() => setAnnPopupOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {allAnnouncements.filter(a => !dismissedAnns.has(a.id)).map(a => {
                const ANN_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
                  Info:    { bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
                  Warning: { bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
                  Error:   { bg: "#fef2f2", border: "#fee2e2", dot: "#ef4444" },
                  Success: { bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e" },
                };
                const clr = ANN_COLORS[a.type] ?? ANN_COLORS.Info;
                return (
                  <div key={a.id} style={{ background: clr.bg, border: `1px solid ${clr.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: clr.dot, marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text,#101828)", marginBottom: a.body ? 6 : 0 }}>{a.title}</div>
                        {a.body && <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{a.body}</div>}
                      </div>
                      <button onClick={() => dismissAnn(a.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "2px 4px", borderRadius: 6, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <PanelAssistant />
    </div>
  );
}

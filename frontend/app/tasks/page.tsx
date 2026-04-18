"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */
type Task = {
  id: string; title: string; description?: string;
  status: "Todo"|"InProgress"|"Done";
  priority?: "Low"|"Medium"|"High"|"Urgent";
  dueDate?: string; assigneeId?: string; assigneeName?: string;
  createdAt?: string;
};
type User = { id: string; firstName: string; lastName: string };

/* ── Constants ──────────────────────────────────────────────────── */
const COLUMNS: { key: Task["status"]; label: string; color: string; bg: string }[] = [
  { key: "Todo",       label: "Yapılacak",   color: "#64748b", bg: "#f8fafc" },
  { key: "InProgress", label: "Devam Ediyor", color: "#7c3aed", bg: "#ede9fe" },
  { key: "Done",       label: "Tamamlandı",  color: "#22c55e", bg: "#f0fdf4" },
];

const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  Low:    { label: "Düşük",  color: "#64748b", bg: "#f8fafc" },
  Medium: { label: "Orta",   color: "#f59e0b", bg: "#fef3c7" },
  High:   { label: "Yüksek", color: "#ef4444", bg: "#fee2e2" },
  Urgent: { label: "Acil",   color: "#7c3aed", bg: "#ede9fe" },
};

/* ── Page ───────────────────────────────────────────────────────── */
export default function TasksPage() {
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [users,     setUsers]     = useState<User[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTask,  setEditTask]  = useState<Task | null>(null);
  const [dragging,  setDragging]  = useState<string | null>(null);
  const [dragOver,  setDragOver]  = useState<Task["status"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, uRes] = await Promise.all([
        apiFetch("/Tasks?pageSize=200"),
        apiFetch("/Users"),
      ]);
      if (tRes.ok) setTasks(await tRes.json());
      if (uRes.ok) setUsers(await uRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (taskId: string, status: Task["status"]) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    await apiFetch(`/Tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  };

  const del = async (id: string) => {
    if (!confirm("Bu görevi silmek istediğinizden emin misiniz?")) return;
    await apiFetch(`/Tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  /* ── Drag handlers ── */
  const onDragStart = (taskId: string) => setDragging(taskId);
  const onDragOver  = (e: React.DragEvent, col: Task["status"]) => { e.preventDefault(); setDragOver(col); };
  const onDrop      = (col: Task["status"]) => {
    if (dragging && dragging !== col) updateStatus(dragging, col);
    setDragging(null);
    setDragOver(null);
  };

  return (
    <AppShell
      title="Görevler"
      description="Ekip görevlerini takip edin"
      actions={
        <button onClick={() => { setEditTask(null); setShowModal(true); }} className="btn btn-primary">+ Görev</button>
      }
    >
      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #ede9fe", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            const isOver   = dragOver === col.key;
            return (
              <div key={col.key}
                onDragOver={e => onDragOver(e, col.key)}
                onDrop={() => onDrop(col.key)}
                onDragLeave={() => setDragOver(null)}
                style={{
                  minWidth: 290, maxWidth: 320, flexShrink: 0,
                  transition: "background 0.15s",
                  background: isOver ? col.bg : "transparent",
                  borderRadius: 16,
                }}>
                {/* Column header */}
                <div style={{ padding: "10px 12px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, fontSize: 14, color: col.color }}>{col.label}</span>
                  <span className="badge" style={{ background: col.bg, color: col.color, marginLeft: "auto" }}>{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
                  {colTasks.map(task => {
                    const prio = PRIORITY_META[task.priority ?? "Medium"];
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "Done";
                    return (
                      <div key={task.id}
                        draggable
                        onDragStart={() => onDragStart(task.id)}
                        className="card"
                        style={{ padding: "14px 14px", cursor: "grab", display: "flex", flexDirection: "column", gap: 8, userSelect: "none" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{task.title}</div>
                            {task.description && (
                              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {task.description}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { setEditTask(task); setShowModal(true); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, padding: 2, flexShrink: 0 }}>⋮</button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span className="badge" style={{ background: prio.bg, color: prio.color, fontSize: 10 }}>{prio.label}</span>
                          {task.dueDate && (
                            <span style={{ fontSize: 11, color: isOverdue ? "#ef4444" : "#94a3b8", fontWeight: isOverdue ? 700 : 400 }}>
                              {isOverdue ? "⚠ " : "📅 "}{task.dueDate.slice(0, 10)}
                            </span>
                          )}
                          {task.assigneeName && (
                            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>👤 {task.assigneeName}</span>
                          )}
                        </div>
                        {/* Status quick move */}
                        <div style={{ display: "flex", gap: 4, paddingTop: 4, borderTop: "1px solid var(--border,#f2f4f7)" }}>
                          {COLUMNS.filter(c => c.key !== col.key).map(c => (
                            <button key={c.key} onClick={() => updateStatus(task.id, c.key)}
                              style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: `1px solid ${c.color}30`, background: c.bg, color: c.color, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                              → {c.label}
                            </button>
                          ))}
                          <button onClick={() => del(task.id)}
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #fee2e2", background: "#fef2f2", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add button */}
                <button
                  onClick={() => { setEditTask({ id: "", title: "", status: col.key }); setShowModal(true); }}
                  style={{
                    width: "calc(100% - 8px)", margin: "4px 4px 0", padding: "10px 14px",
                    borderRadius: 12, border: `2px dashed ${col.color}40`,
                    background: "transparent", color: col.color, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", textAlign: "center",
                  }}>
                  + Ekle
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editTask}
          users={users}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

/* ── Task Modal ─────────────────────────────────────────────────── */
function TaskModal({ task, users, onClose, onSaved }: { task: Task | null; users: User[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!(task?.id);
  const [form, setForm] = useState({
    title:       task?.title ?? "",
    description: task?.description ?? "",
    status:      task?.status ?? "Todo",
    priority:    task?.priority ?? "Medium",
    dueDate:     task?.dueDate?.slice(0, 10) ?? "",
    assigneeId:  task?.assigneeId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) { setError("Görev başlığı zorunludur."); return; }
    setSaving(true);
    try {
      const res = isEdit
        ? await apiFetch(`/Tasks/${task!.id}`, { method: "PUT", body: JSON.stringify(form) })
        : await apiFetch("/Tasks", { method: "POST", body: JSON.stringify(form) });
      if (res.ok) onSaved();
      else { const d = await res.json().catch(() => ({})); setError(d.message ?? "Kayıt hatası"); }
    } finally { setSaving(false); }
  };

  const s: React.CSSProperties = { width: "100%", padding: "11px 14px", borderRadius: 10, minHeight: 44, border: "1px solid var(--border,#d0d5dd)", fontSize: 14, background: "var(--surface,#fff)", color: "var(--text,#101828)", WebkitAppearance: "none" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, backdropFilter: "blur(3px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(460px, 94vw)", zIndex: 301, maxHeight: "92vh", overflowY: "auto", background: "var(--surface,#fff)", borderRadius: 20, boxShadow: "0 24px 64px rgba(15,23,42,0.22)", border: "1px solid var(--border,#eaecf0)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border,#eaecf0)", display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{isEdit ? "Görevi Düzenle" : "Yeni Görev"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Başlık *</label><input value={form.title} onChange={set("title")} style={s} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Açıklama</label><textarea value={form.description} onChange={set("description")} rows={3} style={{ ...s, resize: "vertical" }} /></div>
          <div className="form-grid">
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Durum</label>
              <select value={form.status} onChange={set("status")} style={s}>
                {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Öncelik</label>
              <select value={form.priority} onChange={set("priority")} style={s}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Bitiş Tarihi</label><input type="date" value={form.dueDate} onChange={set("dueDate")} style={s} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#344054", display: "block", marginBottom: 6 }}>Atanan Kişi</label>
              <select value={form.assigneeId} onChange={set("assigneeId")} style={s}>
                <option value="">Seçiniz</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", color: "#b42318", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>İptal</button>
            <button onClick={save} disabled={saving} className="btn btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

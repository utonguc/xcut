"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";

type WaitingType = "flexible" | "fixed_slot";
type Status = "Waiting" | "Notified" | "OfferSent" | "Booked" | "Declined" | "Cancelled" | "Expired";

interface WaitlistEntry {
  id: string;
  waitingType: WaitingType;
  status: Status;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerId?: string;
  stylistId?: string;
  stylistName?: string;
  serviceName?: string;
  preferredDate?: string;
  preferredTimeFrom?: string;
  preferredTimeTo?: string;
  offeredStartAt?: string;
  offeredEndAt?: string;
  offerExpiresAt?: string;
  declineNote?: string;
  notes?: string;
  source: string;
  createdAtUtc: string;
}

interface Stylist { id: string; fullName: string; }

const STATUS_LABEL: Record<Status, string> = {
  Waiting:"Bekliyor", Notified:"Bildirildi", OfferSent:"Teklif Gönderildi",
  Booked:"Randevu Oluşturuldu", Declined:"Reddedildi", Cancelled:"İptal", Expired:"Süresi Doldu",
};
const STATUS_COLOR: Record<Status, string> = {
  Waiting:"#f59e0b", Notified:"#3b82f6", OfferSent:"#8b5cf6",
  Booked:"#22c55e", Declined:"#ef4444", Cancelled:"#6b7280", Expired:"#9ca3af",
};

const fmt = (iso?: string) => iso ? new Date(iso).toLocaleString("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric",weekday:"long"}) : "—";

const inp: React.CSSProperties = { width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box" };
const mkBtn = (color:string): React.CSSProperties => ({ background:color,color:"#fff",border:"none",borderRadius:6,padding:"7px 14px",cursor:"pointer",fontWeight:600,fontSize:13 });

// ── Offer Modal ───────────────────────────────────────────────────────────────

function OfferModal({ entry, stylists, onClose, onDone }: { entry:WaitlistEntry; stylists:Stylist[]; onClose:()=>void; onDone:()=>void }) {
  const { toast } = useToast();
  const [date, setDate] = useState(entry.preferredDate ? entry.preferredDate.slice(0,10) : "");
  const [time, setTime] = useState("10:00");
  const [dur,  setDur]  = useState(60);
  const [stylistId, setStylistId] = useState(entry.stylistId ?? "");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!date || !time) { toast.warning("Tarih ve saat zorunludur."); return; }
    if (!entry.customerEmail) { toast.error("Müşterinin e-posta adresi yok."); return; }
    setBusy(true);
    try {
      if (stylistId && stylistId !== entry.stylistId)
        await apiFetch(`/Waitlist/${entry.id}/stylist`,{ method:"PATCH",body:JSON.stringify({ stylistId }) });
      await apiFetch(`/Waitlist/${entry.id}/offer`,{ method:"POST",body:JSON.stringify({ offeredDate:date, offeredTime:time, durationMinutes:dur }) });
      toast.success("Teklif e-postası gönderildi."); onDone();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"24px 12px" }}>
      <div style={{ background:"#fff",borderRadius:12,padding:28,width:"100%",maxWidth:420,marginBottom:24 }}>
        <div style={{ fontWeight:800,fontSize:17,marginBottom:16 }}>⏰ Saat Teklifi Gönder</div>
        <div style={{ fontSize:14,color:"#374151",marginBottom:16 }}>
          <strong>{entry.customerName}</strong> — {entry.serviceName||"Genel"}<br/>
          {entry.customerEmail ? <span style={{ color:"#6b7280" }}>📧 {entry.customerEmail}</span>
            : <span style={{ color:"#ef4444" }}>⚠️ E-posta yok — teklif gönderilemez</span>}
        </div>
        {stylists.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Stilist</div>
            <select value={stylistId} onChange={e=>setStylistId(e.target.value)} style={inp}>
              <option value="">Seçiniz</option>
              {stylists.map(s=><option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
          </div>
        )}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12 }}>
          <div>
            <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Teklif Tarihi</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/>
          </div>
          <div>
            <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Saat</div>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={inp}/>
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Süre (dakika)</div>
          <select value={dur} onChange={e=>setDur(Number(e.target.value))} style={inp}>
            {[30,45,60,90,120].map(d=><option key={d} value={d}>{d} dk</option>)}
          </select>
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end",gap:8 }}>
          <button onClick={onClose} style={mkBtn("#6b7280")}>İptal</button>
          <button onClick={send} disabled={busy||!entry.customerEmail} style={mkBtn("#6366f1")}>
            {busy?"Gönderiliyor...":"📧 Teklif Gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Decline Modal ─────────────────────────────────────────────────────────────

function DeclineModal({ entry, onClose, onDone }: { entry:WaitlistEntry; onClose:()=>void; onDone:()=>void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("Doluluk nedeniyle işleme alınamadı.");
  const [busy, setBusy] = useState(false);

  const decline = async () => {
    setBusy(true);
    try {
      await apiFetch(`/Waitlist/${entry.id}/decline`,{ method:"POST",body:JSON.stringify({ reason }) });
      toast.info("Reddedildi. Müşteri kaydı pasif olarak oluşturuldu."); onDone();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"24px 12px" }}>
      <div style={{ background:"#fff",borderRadius:12,padding:28,width:"100%",maxWidth:400,marginBottom:24 }}>
        <div style={{ fontWeight:800,fontSize:17,marginBottom:12 }}>❌ Reddet</div>
        <div style={{ fontSize:14,marginBottom:16 }}>
          <strong>{entry.customerName}</strong> talebini reddediyorsunuz.<br/>
          <span style={{ color:"#6b7280",fontSize:13 }}>Müşteri pasif olarak kaydedilecek.</span>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Red Notu</div>
          <input value={reason} onChange={e=>setReason(e.target.value)} style={inp}/>
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end",gap:8 }}>
          <button onClick={onClose} style={mkBtn("#6b7280")}>İptal</button>
          <button onClick={decline} disabled={busy} style={mkBtn("#ef4444")}>{busy?"İşleniyor...":"Reddet"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Stylist Modal ──────────────────────────────────────────────────────

function AssignStylistModal({ entry, stylists, onClose, onDone }: { entry:WaitlistEntry; stylists:Stylist[]; onClose:()=>void; onDone:()=>void }) {
  const { toast } = useToast();
  const [stylistId, setStylistId] = useState(entry.stylistId ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!stylistId){ toast.warning("Stilist seçiniz."); return; }
    setBusy(true);
    try {
      await apiFetch(`/Waitlist/${entry.id}/stylist`,{ method:"PATCH",body:JSON.stringify({ stylistId }) });
      toast.success("Stilist atandı."); onDone();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"24px 12px" }}>
      <div style={{ background:"#fff",borderRadius:12,padding:28,width:"100%",maxWidth:360,marginBottom:24 }}>
        <div style={{ fontWeight:800,fontSize:17,marginBottom:16 }}>Stilist Ata — {entry.customerName}</div>
        <select value={stylistId} onChange={e=>setStylistId(e.target.value)} style={{ ...inp,marginBottom:20 }}>
          <option value="">Stilist seçiniz</option>
          {stylists.map(s=><option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
        <div style={{ display:"flex",justifyContent:"flex-end",gap:8 }}>
          <button onClick={onClose} style={mkBtn("#6b7280")}>İptal</button>
          <button onClick={save} disabled={busy||!stylistId} style={mkBtn("#6366f1")}>Kaydet</button>
        </div>
      </div>
    </div>
  );
}

// ── Entry Card ────────────────────────────────────────────────────────────────

function EntryCard({ entry, stylists, onRefresh }: { entry:WaitlistEntry; stylists:Stylist[]; onRefresh:()=>void }) {
  const { toast } = useToast();
  const [showOffer,   setShowOffer]   = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [showAssign,  setShowAssign]  = useState(false);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    if (!entry.stylistId){ setShowAssign(true); return; }
    setBusy(true);
    try {
      await apiFetch(`/Waitlist/${entry.id}/approve`,{ method:"POST" });
      toast.success("Onaylandı, randevu takvime eklendi."); onRefresh();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  const isActive   = ["Waiting","Notified","OfferSent"].includes(entry.status);
  const canApprove = entry.waitingType === "fixed_slot" && ["Waiting","Notified"].includes(entry.status);
  const canOffer   = entry.waitingType === "flexible"   && ["Waiting","Notified"].includes(entry.status);

  return (
    <>
      <div style={{ background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:16,marginBottom:10 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8 }}>
          <div>
            <div style={{ fontWeight:700,fontSize:15 }}>{entry.customerName}</div>
            <div style={{ fontSize:13,color:"#6b7280",marginTop:2 }}>
              {entry.customerPhone && <span>📞 {entry.customerPhone}&nbsp;&nbsp;</span>}
              {entry.customerEmail && <span>📧 {entry.customerEmail}</span>}
            </div>
            {entry.serviceName && <div style={{ fontSize:13,color:"#4b5563",marginTop:4 }}>✂️ {entry.serviceName}</div>}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            <span style={{ background:STATUS_COLOR[entry.status],color:"#fff",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600 }}>
              {STATUS_LABEL[entry.status]}
            </span>
            {entry.source === "public" && (
              <span style={{ background:"#ede9fe",color:"#7c3aed",borderRadius:20,padding:"3px 8px",fontSize:11 }}>Online</span>
            )}
          </div>
        </div>

        <div style={{ marginTop:10,fontSize:13,color:"#374151" }}>
          {entry.waitingType === "fixed_slot"
            ? <span>📅 <strong>{fmtDate(entry.preferredDate)}</strong>{entry.preferredTimeFrom && <span>&nbsp; ⏰ {entry.preferredTimeFrom}{entry.preferredTimeTo ? ` – ${entry.preferredTimeTo}` : ""}</span>}</span>
            : <span>📅 <strong>{fmtDate(entry.preferredDate)}</strong> <span style={{ color:"#9ca3af" }}>(Herhangi bir saat)</span></span>
          }
        </div>

        {entry.offeredStartAt && (
          <div style={{ marginTop:6,fontSize:13,color:"#8b5cf6" }}>
            🕐 Teklif: {fmt(entry.offeredStartAt)}{entry.offeredEndAt ? ` – ${new Date(entry.offeredEndAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}` : ""}
            {entry.offerExpiresAt && <span style={{ color:"#9ca3af",fontSize:12 }}>&nbsp; Son: {fmt(entry.offerExpiresAt)}</span>}
          </div>
        )}

        <div style={{ marginTop:8,fontSize:13 }}>
          {entry.stylistId
            ? <span style={{ color:"#374151" }}>💇 {entry.stylistName}</span>
            : <span style={{ color:"#f59e0b" }}>⚠️ Stilist atanmamış
                {isActive && <button onClick={()=>setShowAssign(true)} style={{ marginLeft:8,fontSize:12,color:"#6366f1",background:"none",border:"none",cursor:"pointer",textDecoration:"underline" }}>Ata</button>}
              </span>
          }
        </div>

        {entry.declineNote && (
          <div style={{ marginTop:8,fontSize:13,color:"#6b7280",background:"#f9fafb",borderRadius:6,padding:"6px 10px" }}>📝 {entry.declineNote}</div>
        )}

        {isActive && (
          <div style={{ marginTop:12,display:"flex",gap:8,flexWrap:"wrap" }}>
            {canApprove && <button onClick={approve} disabled={busy} style={mkBtn("#22c55e")}>{busy?"İşleniyor...":"✅ Onayla"}</button>}
            {canOffer   && <button onClick={()=>setShowOffer(true)} style={mkBtn("#6366f1")}>📧 Saat Teklifi Gönder</button>}
            <button onClick={()=>setShowDecline(true)} style={mkBtn("#ef4444")}>❌ Reddet</button>
          </div>
        )}
      </div>

      {showOffer   && <OfferModal   entry={entry} stylists={stylists} onClose={()=>setShowOffer(false)}   onDone={()=>{ setShowOffer(false);   onRefresh(); }}/>}
      {showDecline && <DeclineModal entry={entry}                     onClose={()=>setShowDecline(false)} onDone={()=>{ setShowDecline(false); onRefresh(); }}/>}
      {showAssign  && <AssignStylistModal entry={entry} stylists={stylists} onClose={()=>setShowAssign(false)} onDone={()=>{ setShowAssign(false); onRefresh(); }}/>}
    </>
  );
}

function EmptyState({ icon, text }: { icon:string; text:string }) {
  return <div style={{ textAlign:"center",padding:"48px 20px",color:"#9ca3af" }}><div style={{ fontSize:40,marginBottom:8 }}>{icon}</div><div style={{ fontSize:15 }}>{text}</div></div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BeklemePage() {
  const [entries,  setEntries]  = useState<WaitlistEntry[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [tab, setTab] = useState<"flexible"|"fixed_slot"|"done">("flexible");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        apiFetch("/Waitlist").then(r=>r.json()),
        apiFetch("/Stylists?activeOnly=true").then(r=>r.json()).catch(()=>[]),
      ]);
      setEntries(Array.isArray(e) ? e : []);
      setStylists(Array.isArray(s) ? s : (s?.items ?? []));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const ACTIVE = ["Waiting","Notified","OfferSent"];
  const DONE   = ["Booked","Declined","Cancelled","Expired"];

  const flexible  = entries.filter(e => e.waitingType === "flexible"   && ACTIVE.includes(e.status));
  const fixedSlot = entries.filter(e => e.waitingType === "fixed_slot" && ACTIVE.includes(e.status));
  const finished  = entries.filter(e => DONE.includes(e.status));

  const tabSt = (on:boolean): React.CSSProperties => ({
    padding:"8px 18px",border:"none",cursor:"pointer",fontWeight:600,fontSize:14,
    borderBottom: on ? "3px solid #6366f1" : "3px solid transparent",
    background:"none", color: on ? "#6366f1" : "#6b7280",
  });
  const badge = (n:number,c="#6366f1") => n > 0 ? <span style={{ marginLeft:6,background:c,color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:11 }}>{n}</span> : null;

  const info = (text:string) => (
    <div style={{ fontSize:13,color:"#6b7280",background:"#f3f4f6",borderRadius:8,padding:"10px 14px",marginBottom:14 }} dangerouslySetInnerHTML={{ __html: text }}/>
  );

  return (
    <AppShell>
      <div style={{ padding:"24px 20px",maxWidth:800,margin:"0 auto" }}>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:22,fontWeight:800 }}>Bekleme Listesi</div>
          <div style={{ fontSize:14,color:"#6b7280",marginTop:4 }}>Esnek bekleyenlere saat teklifi gönderin · Sabit saatlileri doğrudan onaylayın</div>
        </div>

        <div style={{ display:"flex",borderBottom:"1px solid #e5e7eb",marginBottom:20 }}>
          <button style={tabSt(tab==="flexible")}   onClick={()=>setTab("flexible")}>🕐 Esnek {badge(flexible.length)}</button>
          <button style={tabSt(tab==="fixed_slot")} onClick={()=>setTab("fixed_slot")}>📌 Sabit Saat {badge(fixedSlot.length,"#f59e0b")}</button>
          <button style={tabSt(tab==="done")}       onClick={()=>setTab("done")}>✅ Tamamlananlar {badge(finished.length,"#6b7280")}</button>
        </div>

        {loading ? (
          <div style={{ textAlign:"center",padding:40,color:"#6b7280" }}>Yükleniyor...</div>
        ) : (
          <>
            {tab === "flexible" && (
              flexible.length === 0 ? <EmptyState icon="🕐" text="Esnek bekleme listesi boş"/> : (
                <>{info("Bu müşteriler o gün <strong>herhangi bir boşluğu</strong> kabul eder. Uygun saat açıldığında <strong>Saat Teklifi Gönder</strong> — müşteri e-posta ile onaylarsa randevu otomatik oluşur.")}
                  {flexible.map(e=><EntryCard key={e.id} entry={e} stylists={stylists} onRefresh={load}/>)}</>
              )
            )}
            {tab === "fixed_slot" && (
              fixedSlot.length === 0 ? <EmptyState icon="📌" text="Sabit saat bekleme listesi boş"/> : (
                <>{info("Bu müşteriler yalnızca <strong>belirtilen saat aralığında</strong> gelebilir. O saatte iptal oluşursa <strong>Onayla</strong> — randevu stilist ile otomatik oluşturulur.")}
                  {fixedSlot.map(e=><EntryCard key={e.id} entry={e} stylists={stylists} onRefresh={load}/>)}</>
              )
            )}
            {tab === "done" && (
              finished.length === 0 ? <EmptyState icon="✅" text="Tamamlanan kayıt yok"/>
                : finished.map(e=><EntryCard key={e.id} entry={e} stylists={stylists} onRefresh={load}/>)
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

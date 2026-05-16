"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PackageItem {
  id?: string;
  itemType: "service" | "product";
  referenceId?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
}

interface Package {
  id: string;
  name: string;
  description?: string;
  totalPrice: number;
  isActive: boolean;
  isTimeLimited: boolean;
  validFrom?: string;
  validTo?: string;
  createdAtUtc: string;
  items: PackageItem[];
}

interface Service  { id: string; name: string; price: number; }
interface StockItem { id: string; name: string; salePrice?: number; unitPrice?: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = { width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #d1d5db",fontSize:14,boxSizing:"border-box" };
const mkBtn = (color:string,disabled=false): React.CSSProperties => ({
  background:disabled?"#d1d5db":color, color:"#fff", border:"none", borderRadius:6,
  padding:"8px 16px", cursor:disabled?"not-allowed":"pointer", fontWeight:600, fontSize:13,
});

const fmtPrice = (n:number) => n.toLocaleString("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:0});
const fmtDate  = (iso?:string) => iso ? new Date(iso).toLocaleDateString("tr-TR") : "—";

function originPrice(items: PackageItem[]) {
  return items.reduce((s,i) => s + i.unitPrice * i.quantity, 0);
}

// ── Package Form Modal ────────────────────────────────────────────────────────

function PackageModal({ pkg, services, stockItems, onClose, onDone }: {
  pkg: Package | null; services: Service[]; stockItems: StockItem[];
  onClose: ()=>void; onDone: ()=>void;
}) {
  const { toast } = useToast();
  const isEdit = !!pkg;

  const [name,          setName]          = useState(pkg?.name ?? "");
  const [description,   setDescription]   = useState(pkg?.description ?? "");
  const [totalPrice,    setTotalPrice]     = useState(pkg?.totalPrice ?? 0);
  const [isActive,      setIsActive]       = useState(pkg?.isActive ?? true);
  const [isTimeLimited, setIsTimeLimited]  = useState(pkg?.isTimeLimited ?? false);
  const [validFrom,     setValidFrom]      = useState(pkg?.validFrom ? pkg.validFrom.slice(0,10) : "");
  const [validTo,       setValidTo]        = useState(pkg?.validTo   ? pkg.validTo.slice(0,10)   : "");
  const [items,         setItems]          = useState<PackageItem[]>(pkg?.items ?? []);
  const [busy,          setBusy]           = useState(false);

  // Add item helpers
  const [addType,      setAddType]      = useState<"service"|"product">("service");
  const [addRefId,     setAddRefId]     = useState("");

  const addItem = () => {
    if (!addRefId) { toast.warning("Bir öğe seçiniz."); return; }
    if (addType === "service") {
      const svc = services.find(s => s.id === addRefId);
      if (!svc) return;
      if (items.some(i => i.referenceId === svc.id && i.itemType === "service")) {
        toast.warning("Bu hizmet zaten eklendi."); return;
      }
      setItems(prev => [...prev, { itemType:"service", referenceId:svc.id, itemName:svc.name, quantity:1, unitPrice:svc.price }]);
    } else {
      const stk = stockItems.find(s => s.id === addRefId);
      if (!stk) return;
      if (items.some(i => i.referenceId === stk.id && i.itemType === "product")) {
        toast.warning("Bu ürün zaten eklendi."); return;
      }
      const price = stk.salePrice ?? stk.unitPrice ?? 0;
      setItems(prev => [...prev, { itemType:"product", referenceId:stk.id, itemName:stk.name, quantity:1, unitPrice:price }]);
    }
    setAddRefId("");
  };

  const removeItem = (idx:number) => setItems(prev => prev.filter((_,i) => i !== idx));
  const updateQty  = (idx:number, qty:number) => setItems(prev => prev.map((it,i) => i===idx ? { ...it, quantity: Math.max(1,qty) } : it));

  const suggestPrice = () => setTotalPrice(originPrice(items));

  const save = async () => {
    if (!name.trim()) { toast.warning("Paket adı zorunludur."); return; }
    if (items.length === 0) { toast.warning("En az bir öğe ekleyin."); return; }
    setBusy(true);
    try {
      const body = {
        name: name.trim(), description: description.trim() || undefined,
        totalPrice, isActive, isTimeLimited,
        validFrom: isTimeLimited && validFrom ? new Date(validFrom).toISOString() : undefined,
        validTo:   isTimeLimited && validTo   ? new Date(validTo).toISOString()   : undefined,
        items: items.map(i => ({ itemType:i.itemType, referenceId:i.referenceId, itemName:i.itemName, quantity:i.quantity, unitPrice:i.unitPrice })),
      };
      if (isEdit) await apiFetch(`/Packages/${pkg!.id}`,{ method:"PUT",  body:JSON.stringify(body) });
      else        await apiFetch(`/Packages`,            { method:"POST", body:JSON.stringify(body) });
      toast.success(isEdit ? "Paket güncellendi." : "Paket oluşturuldu.");
      onDone();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  const origin = originPrice(items);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"24px 12px" }}>
      <div style={{ background:"#fff",borderRadius:12,padding:28,width:"100%",maxWidth:640,marginBottom:24 }}>
        <div style={{ fontWeight:800,fontSize:18,marginBottom:20 }}>{isEdit ? "Paketi Düzenle" : "Yeni Paket Oluştur"}</div>

        {/* Temel bilgiler */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14 }}>
          <div style={{ gridColumn:"1 / -1" }}>
            <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Paket Adı *</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="ör. Yaz Kampanyası" style={inp}/>
          </div>
          <div style={{ gridColumn:"1 / -1" }}>
            <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Açıklama</div>
            <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Kısa açıklama..." style={inp}/>
          </div>
        </div>

        {/* Öğeler */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:14,fontWeight:700,marginBottom:10 }}>Paket İçeriği</div>

          <div style={{ display:"flex",gap:8,marginBottom:10,flexWrap:"wrap" }}>
            <select value={addType} onChange={e=>{ setAddType(e.target.value as "service"|"product"); setAddRefId(""); }}
              style={{ ...inp,width:"auto",flex:"0 0 130px" }}>
              <option value="service">Hizmet</option>
              <option value="product">Ürün</option>
            </select>
            <select value={addRefId} onChange={e=>setAddRefId(e.target.value)} style={{ ...inp,flex:"1 1 200px" }}>
              <option value="">Seçiniz</option>
              {addType === "service"
                ? services.map(s=><option key={s.id} value={s.id}>{s.name} — {fmtPrice(s.price)}</option>)
                : stockItems.map(s=><option key={s.id} value={s.id}>{s.name} — {fmtPrice(s.salePrice ?? s.unitPrice ?? 0)}</option>)
              }
            </select>
            <button onClick={addItem} style={mkBtn("#6366f1")}>+ Ekle</button>
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign:"center",padding:"20px",color:"#9ca3af",border:"1px dashed #d1d5db",borderRadius:8,fontSize:13 }}>
              Henüz öğe eklenmedi
            </div>
          ) : (
            <div style={{ border:"1px solid #e5e7eb",borderRadius:8,overflow:"hidden" }}>
              {items.map((item,idx) => (
                <div key={idx} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:idx<items.length-1?"1px solid #f3f4f6":"none",background:idx%2===0?"#fff":"#fafafa" }}>
                  <span style={{ fontSize:11,background:item.itemType==="service"?"#ede9fe":"#dcfce7",color:item.itemType==="service"?"#7c3aed":"#15803d",borderRadius:12,padding:"2px 8px" }}>
                    {item.itemType === "service" ? "Hizmet" : "Ürün"}
                  </span>
                  <span style={{ flex:1,fontSize:14,fontWeight:600 }}>{item.itemName}</span>
                  <input type="number" min={1} value={item.quantity} onChange={e=>updateQty(idx,Number(e.target.value))}
                    style={{ width:56,padding:"4px 8px",borderRadius:6,border:"1px solid #d1d5db",fontSize:13,textAlign:"center" }}/>
                  <span style={{ fontSize:13,color:"#6b7280",width:90,textAlign:"right" }}>
                    {fmtPrice(item.unitPrice * item.quantity)}
                  </span>
                  <button onClick={()=>removeItem(idx)} style={{ background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16,padding:4 }}>✕</button>
                </div>
              ))}
              <div style={{ padding:"10px 14px",background:"#f9fafb",display:"flex",justifyContent:"flex-end",fontSize:13,color:"#374151" }}>
                Orijinal toplam: <strong style={{ marginLeft:6 }}>{fmtPrice(origin)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Fiyat */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:14,fontWeight:700,marginBottom:10 }}>Kampanya Fiyatı</div>
          <div style={{ display:"flex",gap:10,alignItems:"center" }}>
            <input type="number" min={0} step={0.01} value={totalPrice} onChange={e=>setTotalPrice(Number(e.target.value))}
              style={{ ...inp,flex:1 }} placeholder="0.00"/>
            {origin > 0 && (
              <button onClick={suggestPrice} style={{ ...mkBtn("#6b7280"),whiteSpace:"nowrap",fontSize:12 }}>
                Orijinal fiyatı kullan
              </button>
            )}
          </div>
          {origin > 0 && totalPrice > 0 && totalPrice < origin && (
            <div style={{ fontSize:12,color:"#22c55e",marginTop:6 }}>
              ✅ %{Math.round((1-totalPrice/origin)*100)} indirim — {fmtPrice(origin - totalPrice)} tasarruf
            </div>
          )}
        </div>

        {/* Süre kısıtı */}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"flex",alignItems:"center",gap:8,fontSize:14,fontWeight:600,cursor:"pointer" }}>
            <input type="checkbox" checked={isTimeLimited} onChange={e=>setIsTimeLimited(e.target.checked)}/>
            Süreli Kampanya
          </label>
          {isTimeLimited && (
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10 }}>
              <div>
                <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Başlangıç</div>
                <input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)} style={inp}/>
              </div>
              <div>
                <div style={{ fontSize:13,color:"#6b7280",marginBottom:4 }}>Bitiş</div>
                <input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)} style={inp}/>
              </div>
            </div>
          )}
        </div>

        <label style={{ display:"flex",alignItems:"center",gap:8,fontSize:14,cursor:"pointer",marginBottom:24 }}>
          <input type="checkbox" checked={isActive} onChange={e=>setIsActive(e.target.checked)}/>
          Aktif (kasada görünsün)
        </label>

        <div style={{ display:"flex",justifyContent:"flex-end",gap:10 }}>
          <button onClick={onClose} style={mkBtn("#6b7280")}>İptal</button>
          <button onClick={save} disabled={busy} style={mkBtn("#6366f1",busy)}>
            {busy ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Package Card ──────────────────────────────────────────────────────────────

function PackageCard({ pkg, onEdit, onRefresh }: { pkg:Package; onEdit:()=>void; onRefresh:()=>void }) {
  const { toast, confirm } = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await apiFetch(`/Packages/${pkg.id}/toggle`,{ method:"PATCH" });
      onRefresh();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  const del = async () => {
    const ok = await confirm({ message: `"${pkg.name}" paketini silmek istediğinizden emin misiniz?`, danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/Packages/${pkg.id}`,{ method:"DELETE" });
      toast.success("Paket silindi."); onRefresh();
    } catch(e:unknown){ toast.error(e instanceof Error ? e.message : "Hata."); }
    finally{ setBusy(false); }
  };

  const origin   = pkg.items.reduce((s,i) => s+i.unitPrice*i.quantity,0);
  const discount = origin > 0 && pkg.totalPrice < origin ? Math.round((1-pkg.totalPrice/origin)*100) : 0;
  const expired  = pkg.isTimeLimited && pkg.validTo && new Date(pkg.validTo) < new Date();

  return (
    <div style={{ background:"#fff",border:`1px solid ${pkg.isActive && !expired ? "#e5e7eb" : "#f3f4f6"}`,borderRadius:12,padding:20,opacity:pkg.isActive && !expired ? 1 : 0.65 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10 }}>
        <div>
          <div style={{ fontWeight:700,fontSize:16 }}>{pkg.name}</div>
          {pkg.description && <div style={{ fontSize:13,color:"#6b7280",marginTop:2 }}>{pkg.description}</div>}
        </div>
        <div style={{ display:"flex",gap:6,flexShrink:0 }}>
          {expired
            ? <span style={{ background:"#fee2e2",color:"#dc2626",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600 }}>Süresi Doldu</span>
            : pkg.isActive
              ? <span style={{ background:"#dcfce7",color:"#15803d",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600 }}>Aktif</span>
              : <span style={{ background:"#f3f4f6",color:"#6b7280",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600 }}>Pasif</span>
          }
          {pkg.isTimeLimited && (
            <span style={{ background:"#fef3c7",color:"#d97706",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:600 }}>Süreli</span>
          )}
        </div>
      </div>

      {/* Items */}
      <div style={{ marginTop:14,display:"flex",flexWrap:"wrap",gap:6 }}>
        {pkg.items.map((item,i) => (
          <span key={i} style={{ background:item.itemType==="service"?"#ede9fe":"#dcfce7",color:item.itemType==="service"?"#7c3aed":"#15803d",borderRadius:20,padding:"4px 10px",fontSize:12 }}>
            {item.quantity > 1 ? `${item.quantity}× ` : ""}{item.itemName}
          </span>
        ))}
      </div>

      {/* Pricing */}
      <div style={{ marginTop:14,display:"flex",alignItems:"center",gap:16 }}>
        <div>
          <span style={{ fontSize:20,fontWeight:800,color:"#1f2937" }}>{fmtPrice(pkg.totalPrice)}</span>
          {origin > pkg.totalPrice && (
            <span style={{ marginLeft:8,fontSize:13,color:"#9ca3af",textDecoration:"line-through" }}>{fmtPrice(origin)}</span>
          )}
        </div>
        {discount > 0 && (
          <span style={{ background:"#fee2e2",color:"#dc2626",borderRadius:8,padding:"3px 10px",fontSize:13,fontWeight:700 }}>%{discount} indirim</span>
        )}
        {pkg.isTimeLimited && (
          <span style={{ fontSize:12,color:"#6b7280" }}>
            {fmtDate(pkg.validFrom)} – {fmtDate(pkg.validTo)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ marginTop:14,display:"flex",gap:8 }}>
        <button onClick={onEdit} style={mkBtn("#6366f1")}>✏️ Düzenle</button>
        <button onClick={toggle} disabled={busy} style={mkBtn("#f59e0b")}>
          {pkg.isActive ? "Pasife Al" : "Aktif Et"}
        </button>
        <button onClick={del} disabled={busy} style={mkBtn("#ef4444")}>🗑 Sil</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaketlerPage() {
  const [packages,    setPackages]    = useState<Package[]>([]);
  const [services,    setServices]    = useState<Service[]>([]);
  const [stockItems,  setStockItems]  = useState<StockItem[]>([]);
  const [showModal,   setShowModal]   = useState(false);
  const [editPkg,     setEditPkg]     = useState<Package | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState<"all"|"active"|"inactive">("all");

  const load = async () => {
    setLoading(true);
    try {
      const [pkgs, svcs, stk] = await Promise.all([
        apiFetch("/Packages").then(r=>r.json()),
        apiFetch("/Services?pageSize=200").then(r=>r.json()).catch(()=>({ items:[] })),
        apiFetch("/Stock?pageSize=200").then(r=>r.json()).catch(()=>({ items:[] })),
      ]);
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setServices(svcs?.items ?? (Array.isArray(svcs) ? svcs : []));
      setStockItems(stk?.items ?? (Array.isArray(stk) ? stk : []));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = packages.filter(p => {
    if (filter === "active")   return p.isActive;
    if (filter === "inactive") return !p.isActive;
    return true;
  });

  const openCreate = () => { setEditPkg(null); setShowModal(true); };
  const openEdit   = (p:Package) => { setEditPkg(p); setShowModal(true); };

  const tabSt = (on:boolean): React.CSSProperties => ({
    padding:"6px 14px",border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
    borderRadius:6, background: on ? "#6366f1" : "#f3f4f6", color: on ? "#fff" : "#374151",
  });

  return (
    <AppShell>
      <div style={{ padding:"24px 20px",maxWidth:900,margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:20 }}>
          <div>
            <div style={{ fontSize:22,fontWeight:800 }}>Paketler & Kampanyalar</div>
            <div style={{ fontSize:14,color:"#6b7280",marginTop:4 }}>
              Hizmet ve ürünleri bir araya getirerek kampanya paketleri oluşturun
            </div>
          </div>
          <button onClick={openCreate} style={mkBtn("#6366f1")}>+ Yeni Paket</button>
        </div>

        {/* Filters */}
        <div style={{ display:"flex",gap:6,marginBottom:20 }}>
          <button style={tabSt(filter==="all")}      onClick={()=>setFilter("all")}>Tümü ({packages.length})</button>
          <button style={tabSt(filter==="active")}   onClick={()=>setFilter("active")}>Aktif</button>
          <button style={tabSt(filter==="inactive")} onClick={()=>setFilter("inactive")}>Pasif</button>
        </div>

        {loading ? (
          <div style={{ textAlign:"center",padding:40,color:"#6b7280" }}>Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center",padding:"60px 20px",color:"#9ca3af" }}>
            <div style={{ fontSize:40,marginBottom:8 }}>📦</div>
            <div style={{ fontSize:16,fontWeight:600,marginBottom:8 }}>Henüz paket oluşturulmamış</div>
            <div style={{ fontSize:14 }}>Hizmet ve ürünleri birleştirerek kampanya paketleri oluşturun.</div>
            <button onClick={openCreate} style={{ ...mkBtn("#6366f1"),marginTop:16 }}>İlk Paketi Oluştur</button>
          </div>
        ) : (
          <div style={{ display:"grid",gap:14 }}>
            {filtered.map(p => (
              <PackageCard key={p.id} pkg={p} onEdit={()=>openEdit(p)} onRefresh={load}/>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <PackageModal
          pkg={editPkg}
          services={services}
          stockItems={stockItems}
          onClose={()=>setShowModal(false)}
          onDone={()=>{ setShowModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

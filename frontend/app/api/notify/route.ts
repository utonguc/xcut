import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/mailer";

type D = Record<string, string>;

const YEAR = new Date().getFullYear();

const base = (body: string) => `<!DOCTYPE html><html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;padding:0;font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#1e293b;}
.wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);}
.hd{padding:28px 32px;}.hd h1{color:#fff;margin:0;font-size:22px;font-weight:800;letter-spacing:-.5px;}.hd p{color:rgba(255,255,255,.8);margin:4px 0 0;font-size:13px;}
.bd{padding:32px;}
.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;}
.row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:14px;}
.row:last-child{border-bottom:none;}.lbl{color:#64748b;font-weight:600;}.val{color:#1e293b;font-weight:700;text-align:right;max-width:55%;}
.btn{display:inline-block;background:#7c3aed;color:#fff!important;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:14px;margin:8px 0;}
.ft{padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;}
</style></head>
<body><div style="padding:24px 16px;">
<div class="wrap">${body}
<div class="ft">Bu mail otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.<br>© ${YEAR} xCut — Powered by xShield</div>
</div></div></body></html>`;

function esc(s: string | undefined | null) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtUtc(utc: string) {
  try {
    const d = new Date(utc);
    const local = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const days = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
    const months = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
    return `${days[local.getUTCDay()]}, ${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()} — ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  } catch { return utc; }
}

/* ─── Templates ─────────────────────────────────────────────────── */

function tplBookingCustomer(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>✅ Randevu Talebiniz Alındı</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.customerFirstName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:14px;">Randevu talebiniz alındı. Salonumuz en kısa sürede onaylayacak ve size bilgi verecektir.</p>
<div class="box">
<div class="row"><span class="lbl">Salon</span><span class="val">${esc(d.salonName)}</span></div>
<div class="row"><span class="lbl">Stilist</span><span class="val">${esc(d.stylistName)}</span></div>
<div class="row"><span class="lbl">Hizmet</span><span class="val">${esc(d.serviceName)}</span></div>
<div class="row"><span class="lbl">Tarih &amp; Saat</span><span class="val">${fmtUtc(d.startUtc)}</span></div>
</div>
${d.salonPhone ? `<p style="font-size:13px;color:#64748b;">Sorularınız için: <strong>${esc(d.salonPhone)}</strong></p>` : ""}
</div>`);
}

function tplBookingSalon(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>📅 Yeni Randevu Talebi</h1><p>Müşteriden yeni bir randevu isteği geldi</p></div>
<div class="bd">
<div class="box">
<div class="row"><span class="lbl">Müşteri</span><span class="val">${esc(d.customerFirstName)} ${esc(d.customerLastName)}</span></div>
${d.customerPhone ? `<div class="row"><span class="lbl">Telefon</span><span class="val">${esc(d.customerPhone)}</span></div>` : ""}
${d.customerEmail ? `<div class="row"><span class="lbl">E-posta</span><span class="val">${esc(d.customerEmail)}</span></div>` : ""}
<div class="row"><span class="lbl">Stilist</span><span class="val">${esc(d.stylistName)}</span></div>
<div class="row"><span class="lbl">Hizmet</span><span class="val">${esc(d.serviceName)}</span></div>
<div class="row"><span class="lbl">Tarih &amp; Saat</span><span class="val">${fmtUtc(d.startUtc)}</span></div>
${d.customerNotes ? `<div class="row"><span class="lbl">Not</span><span class="val">${esc(d.customerNotes)}</span></div>` : ""}
</div>
<a class="btn" href="${esc(d.panelUrl || "https://xcut.xshield.com.tr/appointments")}">Randevu Taleplerini Gör →</a>
</div>`);
}

function tplBookingStatus(d: D) {
  const approved = d.status === "approved";
  const hdrColor = approved ? "#166534" : "#991b1b";
  return base(`
<div class="hd" style="background:${hdrColor};"><h1>${approved ? "✅ Randevunuz Onaylandı" : "❌ Randevu Talebiniz Reddedildi"}</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.customerFirstName)},</p>
${approved
  ? `<p style="color:#64748b;margin:0 0 20px;font-size:14px;">Randevunuz onaylandı. Sizi bekliyoruz!</p>`
  : `<p style="color:#64748b;margin:0 0 20px;font-size:14px;">Randevu talebiniz bu sefer kabul edilemedi.${d.rejectionReason ? ` <strong>Neden: ${esc(d.rejectionReason)}</strong>` : ""}</p>`}
<div class="box">
<div class="row"><span class="lbl">Salon</span><span class="val">${esc(d.salonName)}</span></div>
<div class="row"><span class="lbl">Stilist</span><span class="val">${esc(d.stylistName)}</span></div>
<div class="row"><span class="lbl">Hizmet</span><span class="val">${esc(d.serviceName)}</span></div>
<div class="row"><span class="lbl">Tarih &amp; Saat</span><span class="val">${fmtUtc(d.startUtc)}</span></div>
</div>
${!approved ? `<p style="font-size:13px;color:#64748b;">Yeni bir randevu oluşturmak için salonumuzu ziyaret edebilirsiniz.</p>` : ""}
</div>`);
}

function tplDemoWelcome(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>🎉 xCut'a Hoş Geldiniz!</h1><p>Demo hesabınız oluşturuldu</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.fullName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:14px;"><strong>${esc(d.salonName)}</strong> için xCut demo hesabınız hazır. Aşağıdaki bilgilerle giriş yapabilirsiniz.</p>
<div class="box">
<div class="row"><span class="lbl">Kullanıcı Adı</span><span class="val" style="font-family:monospace">${esc(d.userName)}</span></div>
<div class="row"><span class="lbl">Şifre</span><span class="val" style="font-family:monospace">${esc(d.tempPassword)}</span></div>
<div class="row"><span class="lbl">Demo Bitiş</span><span class="val">${esc(d.trialEndsAt)}</span></div>
</div>
<a class="btn" href="${esc(d.loginUrl || "https://xcut.xshield.com.tr/login")}">Hemen Giriş Yap →</a>
<p style="font-size:12px;color:#94a3b8;margin-top:16px;">Güvenliğiniz için ilk girişte şifrenizi değiştirmenizi öneririz.</p>
</div>`);
}

function tplNewAccount(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>🔐 Hesabınız Oluşturuldu</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.fullName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:14px;"><strong>${esc(d.salonName)}</strong> için xCut hesabınız oluşturuldu.</p>
<div class="box">
<div class="row"><span class="lbl">Kullanıcı Adı</span><span class="val" style="font-family:monospace">${esc(d.userName)}</span></div>
<div class="row"><span class="lbl">Şifre</span><span class="val" style="font-family:monospace">${esc(d.password)}</span></div>
</div>
<a class="btn" href="${esc(d.loginUrl || "https://xcut.xshield.com.tr/login")}">Giriş Yap →</a>
<p style="font-size:12px;color:#94a3b8;margin-top:16px;">Güvenliğiniz için ilk girişte şifrenizi değiştirmenizi öneririz.</p>
</div>`);
}

function tplReceipt(d: D) {
  const items: { name: string; qty: number; price: number }[] = (() => {
    try { return JSON.parse(d.itemsJson ?? "[]"); } catch { return []; }
  })();
  const rowsHtml = items.map(it => `
<div class="row"><span class="lbl">${esc(it.name)}${it.qty > 1 ? ` x${it.qty}` : ""}</span><span class="val">₺${(it.price * it.qty).toLocaleString("tr-TR")}</span></div>`).join("");
  return base(`
<div class="hd" style="background:#1d4ed8;"><h1>🧾 Adisyon</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.customerName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:14px;">Bugünkü ziyaretinizin adisyonunu bulabilirsiniz.</p>
<div class="box">
${rowsHtml}
${d.discountAmount && Number(d.discountAmount) > 0 ? `<div class="row"><span class="lbl">İndirim</span><span class="val" style="color:#16a34a;">-₺${Number(d.discountAmount).toLocaleString("tr-TR")}</span></div>` : ""}
<div class="row" style="font-size:16px;"><span class="lbl">Toplam</span><span class="val" style="color:#1d4ed8;font-size:16px;">₺${Number(d.total).toLocaleString("tr-TR")}</span></div>
<div class="row"><span class="lbl">Ödeme</span><span class="val">${esc(d.paymentMethod)}</span></div>
</div>
${d.salonPhone ? `<p style="font-size:13px;color:#64748b;">Sorularınız için: <strong>${esc(d.salonPhone)}</strong></p>` : ""}
<p style="font-size:13px;color:#94a3b8;margin-top:16px;">Teşekkür ederiz, sizi tekrar görmek dileriz.</p>
</div>`);
}

function tplBirthday(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>🎂 Doğum Günün Kutlu Olsun!</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 12px;">Merhaba ${esc(d.customerFirstName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:15px;">Doğum günün kutlu olsun! ${d.salonName} ailesi olarak en içten dileklerimizi sunuyoruz.${d.giftNote ? `<br><br><strong>${esc(d.giftNote)}</strong>` : ""}</p>
${d.bookingUrl ? `<a class="btn" href="${esc(d.bookingUrl)}">Randevu Al →</a>` : ""}
</div>`);
}

function tplWelcome(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>👋 Hoş Geldiniz!</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.customerFirstName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:14px;">Sizi aramızda görmekten mutluluk duyduk! ${esc(d.salonName)}'e hoş geldiniz.</p>
${d.bookingUrl ? `<a class="btn" href="${esc(d.bookingUrl)}">Tekrar Randevu Al →</a>` : ""}
<p style="font-size:13px;color:#64748b;margin-top:16px;">Sorularınız için: <strong>${esc(d.salonPhone ?? "")}</strong></p>
</div>`);
}

function tplWinBack(d: D) {
  return base(`
<div class="hd" style="background:#7c3aed;"><h1>💜 Sizi Özledik!</h1><p>${esc(d.salonName)}</p></div>
<div class="bd">
<p style="font-size:16px;font-weight:700;margin:0 0 4px;">Merhaba ${esc(d.customerFirstName)},</p>
<p style="color:#64748b;margin:0 0 20px;font-size:14px;">Bir süredir göremiyoruz. ${esc(d.salonName)} ailesi olarak sizi tekrar aramızda görmek isteriz!${d.offerNote ? `<br><br><strong>${esc(d.offerNote)}</strong>` : ""}</p>
${d.bookingUrl ? `<a class="btn" href="${esc(d.bookingUrl)}">Randevu Al →</a>` : ""}
</div>`);
}

const TEMPLATES: Record<string, (d: D) => string> = {
  booking_customer: tplBookingCustomer,
  booking_salon:    tplBookingSalon,
  booking_status:   tplBookingStatus,
  demo_welcome:     tplDemoWelcome,
  new_account:      tplNewAccount,
  receipt:          tplReceipt,
  birthday:         tplBirthday,
  welcome:          tplWelcome,
  win_back:         tplWinBack,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { template: string; to: string; subject: string; data: D & { html?: string } };
    if (!body.to || !body.subject) return NextResponse.json({ error: "to ve subject zorunlu." }, { status: 400 });

    let html: string;
    if (body.template === "custom_html") {
      html = body.data?.html ?? "";
    } else {
      const tpl = TEMPLATES[body.template];
      if (!tpl) return NextResponse.json({ error: "Bilinmeyen şablon." }, { status: 400 });
      html = tpl(body.data ?? {});
    }
    await sendEmail({ to: body.to, subject: body.subject, html });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notify error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Mail gönderilemedi." }, { status: 500 });
  }
}

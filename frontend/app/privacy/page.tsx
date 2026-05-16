import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik Politikası — xCut",
  description: "xCut salon yönetim platformunun gizlilik politikası ve kişisel veri işleme ilkeleri.",
};

const LAST_UPDATED = "14 Mayıs 2025";
const COMPANY      = "xShield Bilişim Hizmetleri";
const EMAIL        = "privacy@xshield.com.tr";
const SITE         = "https://xcut.xshield.com.tr";

export default function PrivacyPage() {
  return (
    <div style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#0f172a", background: "#fff", minHeight: "100vh" }}>

      {/* Navbar */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(255,255,255,0.94)", backdropFilter: "blur(12px)", borderBottom: "1px solid #f1f5f9", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", textDecoration: "none", color: "#0f172a" }}>
          <span style={{ color: "#7c3aed" }}>x</span>Cut
        </Link>
        <Link href="/" style={{ fontSize: 14, color: "#64748b", textDecoration: "none", fontWeight: 500 }}>← Ana Sayfa</Link>
      </nav>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f172a, #1e1130)", padding: "60px 24px 48px", textAlign: "center", color: "#fff" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 999, background: "rgba(124,58,237,0.2)", border: "1px solid rgba(167,139,250,0.3)", fontSize: 12, fontWeight: 700, color: "#c4b5fd", marginBottom: 20 }}>
          🔒 Gizlilik Politikası
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, letterSpacing: "-1px" }}>Gizlilik Politikası</h1>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 14 }}>Son güncelleme: {LAST_UPDATED}</p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "56px 24px 80px" }}>

        <Section title="1. Giriş">
          <p>{COMPANY} olarak ("Şirket", "biz", "bizim"), xCut salon yönetim platformu (<strong>{SITE}</strong>) aracılığıyla sunduğumuz hizmetlerde kişisel verilerinizin güvenliğine büyük önem veriyoruz. Bu Gizlilik Politikası, hizmetlerimizi kullanırken hangi verileri topladığımızı, bu verileri nasıl kullandığımızı ve haklarınızın neler olduğunu açıklar.</p>
          <p>Hizmetimizi kullanarak bu politikayı kabul etmiş sayılırsınız. Politikayı kabul etmiyorsanız lütfen hizmetimizi kullanmayınız.</p>
        </Section>

        <Section title="2. Topladığımız Veriler">
          <SubTitle>2.1 Hesap ve Kimlik Bilgileri</SubTitle>
          <ul>
            <li>Ad, soyad, e-posta adresi ve şifre</li>
            <li>Salon adı, adresi, şehri ve iletişim bilgileri</li>
            <li>Fatura ve ödeme bilgileri (ödeme işlemleri üçüncü taraf sağlayıcılar aracılığıyla gerçekleştirilir)</li>
          </ul>

          <SubTitle>2.2 Google ile Giriş / Google Takvim</SubTitle>
          <p>Google OAuth entegrasyonu aracılığıyla giriş yaptığınızda veya Google Takvim'i bağladığınızda şu verilere erişiriz:</p>
          <ul>
            <li>Google hesabınıza ait e-posta adresi ve profil adı (kimlik doğrulama için)</li>
            <li>Google Takvim'e etkinlik ekleme, güncelleme ve silme yetkisi (<code>calendar.events</code> kapsamı)</li>
          </ul>
          <p>Google üzerinden edindiğimiz veriler yalnızca randevu etkinliklerini takviminizle senkronize etmek amacıyla kullanılır; üçüncü taraflarla paylaşılmaz, profil oluşturma veya reklam amacıyla işlenmez.</p>

          <SubTitle>2.3 Müşteri ve Randevu Verileri</SubTitle>
          <ul>
            <li>Salonunuza ait müşteri kayıtları (ad, telefon, e-posta, notlar)</li>
            <li>Randevu bilgileri, hizmet geçmişi ve ödeme kayıtları</li>
            <li>Stilist profilleri ve çalışma saatleri</li>
          </ul>

          <SubTitle>2.4 Teknik Veriler</SubTitle>
          <ul>
            <li>IP adresi, tarayıcı türü ve cihaz bilgisi</li>
            <li>Oturum verileri ve çerezler</li>
            <li>Platform kullanım istatistikleri (anonim)</li>
          </ul>
        </Section>

        <Section title="3. Verilerin Kullanım Amaçları">
          <p>Topladığımız verileri aşağıdaki amaçlarla kullanırız:</p>
          <ul>
            <li>Hesabınızı oluşturmak ve kimliğinizi doğrulamak</li>
            <li>Randevu yönetimi, faturalandırma ve raporlama hizmetlerini sunmak</li>
            <li>Google Takvim'e randevu etkinliği eklemek, güncellemek ve silmek</li>
            <li>WhatsApp ve e-posta ile randevu hatırlatmaları göndermek</li>
            <li>Teknik sorunları tespit etmek ve güvenliği sağlamak</li>
            <li>Yasal yükümlülüklerimizi yerine getirmek</li>
          </ul>
        </Section>

        <Section title="4. Verilerin Paylaşılması">
          <p>Kişisel verilerinizi aşağıdaki durumlar dışında üçüncü taraflarla satmaz veya kiralamayız:</p>
          <ul>
            <li><strong>Hizmet sağlayıcılar:</strong> Altyapı, ödeme işleme ve e-posta gönderimi gibi hizmetler için güvenilir iş ortaklarımız (bu ortaklar yalnızca hizmet sunumu için yetkilendirilmiştir)</li>
            <li><strong>Google:</strong> Google OAuth ve Google Calendar API entegrasyonu kapsamında, yalnızca bağladığınız hizmetler için gerekli olan veriler</li>
            <li><strong>Yasal zorunluluk:</strong> Mahkeme kararı veya yasal düzenleme gerektirdiğinde yetkili mercilerle paylaşım</li>
          </ul>
        </Section>

        <Section title="5. Google API Hizmetleri Kullanımı">
          <p>xCut'ın Google API Hizmetleri kullanımı ve bunlardan alınan bilgilerin aktarımı, <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed" }}>Google API Hizmetleri Kullanıcı Verisi Politikası</a>'na (Sınırlı Kullanım gereksinimleri dahil) uygundur.</p>
          <p>Özellikle:</p>
          <ul>
            <li>Google API'lerinden elde edilen veriler yalnızca kullanıcıya hizmet sunmak amacıyla kullanılır</li>
            <li>Veriler, kullanıcının açık onayı olmaksızın reklam amacıyla kullanılmaz</li>
            <li>Veriler üçüncü taraflara satılmaz veya aktarılmaz</li>
            <li>Veriler kişisel veya hassas nitelikteki bilgileri belirlemek amacıyla kullanılmaz</li>
          </ul>
        </Section>

        <Section title="6. Veri Güvenliği">
          <ul>
            <li>Tüm veriler Türkiye'deki güvenli sunucularda saklanır</li>
            <li>Veri iletimi SSL/TLS şifreleme ile korunur</li>
            <li>Şifreler BCrypt algoritmasıyla hashlenerek saklanır; düz metin olarak tutulmaz</li>
            <li>Yetkisiz erişimi önlemek için erişim kontrolleri uygulanır</li>
            <li>Düzenli yedekleme yapılır</li>
          </ul>
        </Section>

        <Section title="7. Çerezler">
          <p>Platformumuz oturum yönetimi ve kullanıcı deneyimini iyileştirmek amacıyla çerezler kullanır. Çerezleri tarayıcı ayarlarınızdan yönetebilirsiniz; ancak bazı çerezlerin devre dışı bırakılması platformun işlevselliğini etkileyebilir.</p>
        </Section>

        <Section title="8. Veri Saklama Süresi">
          <p>Verilerinizi hesabınız aktif olduğu sürece saklarız. Hesabınızı silmeniz durumunda kişisel verileriniz 30 gün içinde sistemlerimizden kaldırılır. Yasal yükümlülükler kapsamında saklanması gereken veriler bu sürenin dışında tutulabilir.</p>
        </Section>

        <Section title="9. Haklarınız">
          <p>6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında aşağıdaki haklara sahipsiniz:</p>
          <ul>
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
            <li>İşlenen veriler hakkında bilgi talep etme</li>
            <li>Verilerin işlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme</li>
            <li>Eksik veya yanlış verilerin düzeltilmesini talep etme</li>
            <li>Verilerin silinmesini veya yok edilmesini talep etme</li>
            <li>Verilerin aktarıldığı üçüncü kişilere yukarıdaki işlemlerin bildirilmesini isteme</li>
            <li>Otomatik sistemler aracılığıyla aleyhinize bir sonuç ortaya çıkmasına itiraz etme</li>
          </ul>
          <p>Bu haklarınızı kullanmak için <a href={`mailto:${EMAIL}`} style={{ color: "#7c3aed" }}>{EMAIL}</a> adresine başvurabilirsiniz.</p>
        </Section>

        <Section title="10. Üçüncü Taraf Bağlantıları">
          <p>Platformumuz üçüncü taraf web sitelerine bağlantılar içerebilir. Bu sitelerin gizlilik uygulamalarından sorumlu değiliz. Üçüncü taraf siteleri ziyaret etmeden önce kendi gizlilik politikalarını incelemenizi tavsiye ederiz.</p>
        </Section>

        <Section title="11. Çocukların Gizliliği">
          <p>Hizmetlerimiz 18 yaşın altındaki bireylere yönelik değildir ve bilerek bu yaş grubundan kişisel veri toplamayız. Böyle bir durumun farkına varırsanız lütfen bizimle iletişime geçin.</p>
        </Section>

        <Section title="12. Politika Değişiklikleri">
          <p>Bu Gizlilik Politikası'nı zaman zaman güncelleyebiliriz. Önemli değişiklikler olduğunda kayıtlı e-posta adresinize bildirim göndeririz ve bu sayfada güncelleme tarihini belirtiriz. Değişikliklerden haberdar olmak için politikayı düzenli olarak incelemenizi öneririz.</p>
        </Section>

        <Section title="13. İletişim">
          <p>Bu Gizlilik Politikası ile ilgili sorularınız için:</p>
          <ul>
            <li><strong>E-posta:</strong> <a href={`mailto:${EMAIL}`} style={{ color: "#7c3aed" }}>{EMAIL}</a></li>
            <li><strong>Şirket:</strong> {COMPANY}</li>
            <li><strong>Web:</strong> <a href={SITE} style={{ color: "#7c3aed" }}>{SITE}</a></li>
          </ul>
        </Section>

        {/* Footer links */}
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid #f1f5f9", display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Link href="/terms" style={{ color: "#7c3aed", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Kullanım Şartları →</Link>
          <Link href="/"     style={{ color: "#64748b", fontSize: 14, textDecoration: "none" }}>Ana Sayfa →</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 14, letterSpacing: "-0.3px" }}>{title}</h2>
      <div style={{ fontSize: 15, color: "#334155", lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontWeight: 700, color: "#1e293b", marginTop: 16, marginBottom: 6 }}>{children}</p>;
}

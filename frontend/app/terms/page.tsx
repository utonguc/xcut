import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Şartları — xCut",
  description: "xCut salon yönetim platformunun kullanım şartları ve hizmet koşulları.",
};

const LAST_UPDATED = "14 Mayıs 2025";
const COMPANY      = "xShield Bilişim Hizmetleri";
const EMAIL        = "legal@xshield.com.tr";
const SITE         = "https://xcut.xshield.com.tr";

export default function TermsPage() {
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
          📋 Kullanım Şartları
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(26px,4vw,40px)", fontWeight: 900, letterSpacing: "-1px" }}>Kullanım Şartları</h1>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 14 }}>Son güncelleme: {LAST_UPDATED}</p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "56px 24px 80px" }}>

        <Section title="1. Taraflar ve Kapsam">
          <p>Bu Kullanım Şartları ("Şartlar"), <strong>{COMPANY}</strong> ("Şirket", "biz") ile <strong>{SITE}</strong> adresinde sunulan xCut salon yönetim platformunu ("Platform") kullanan gerçek veya tüzel kişiler ("Kullanıcı", "siz") arasında akdedilmiş bir sözleşme niteliği taşımaktadır.</p>
          <p>Platforma kaydolarak veya herhangi bir şekilde kullanarak bu Şartları kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız lütfen Platformu kullanmayınız.</p>
        </Section>

        <Section title="2. Hizmet Tanımı">
          <p>xCut; güzellik salonu, berber ve kişisel bakım işletmelerine yönelik aşağıdaki hizmetleri sunan bulut tabanlı bir yönetim platformudur:</p>
          <ul>
            <li>Randevu oluşturma, yönetme ve takip etme</li>
            <li>Müşteri ilişkileri yönetimi (CRM)</li>
            <li>Stilist ve personel yönetimi</li>
            <li>Finans, fatura ve stok takibi</li>
            <li>Web sitesi oluşturma ve online randevu formu</li>
            <li>Google Takvim entegrasyonu ve Google ile giriş</li>
            <li>WhatsApp bildirimleri ve hatırlatmalar</li>
            <li>Kiosk / TV ekranı modu</li>
            <li>Raporlama ve analitik araçları</li>
          </ul>
        </Section>

        <Section title="3. Hesap Oluşturma ve Güvenlik">
          <ul>
            <li>Platforma kayıt olmak için geçerli bir e-posta adresi gereklidir.</li>
            <li>Hesap bilgilerinizin (şifre dahil) gizliliğini korumak sizin sorumluluğunuzdadır.</li>
            <li>Hesabınız üzerinden gerçekleştirilen tüm işlemlerden siz sorumlusunuz.</li>
            <li>Hesabınıza yetkisiz bir erişim olduğunu fark ettiğinizde derhal <a href={`mailto:${EMAIL}`} style={{ color: "#7c3aed" }}>{EMAIL}</a> adresine bildiriniz.</li>
            <li>Bir kişi veya kuruluş adına kayıt yaptırıyorsanız, o kişi veya kuruluş adına bu Şartları kabul etme yetkisine sahip olduğunuzu beyan etmiş sayılırsınız.</li>
          </ul>
        </Section>

        <Section title="4. Deneme Süresi ve Ücretlendirme">
          <SubTitle>4.1 Ücretsiz Deneme</SubTitle>
          <p>Yeni kullanıcılara platforma kayıt tarihinden itibaren <strong>30 gün ücretsiz deneme süresi</strong> tanınır. Bu süre zarfında kredi kartı bilgisi talep edilmez.</p>

          <SubTitle>4.2 Ücretli Planlar</SubTitle>
          <p>Deneme süresi sonunda hizmeti kullanmaya devam etmek için ücretli bir plana geçiş gereklidir. Mevcut planlar ve fiyatlandırma Platformun ana sayfasında belirtilmektedir. Şirket, fiyatlandırmayı önceden duyurmak kaydıyla değiştirme hakkını saklı tutar.</p>

          <SubTitle>4.3 İptal ve İade</SubTitle>
          <p>Aboneliğinizi istediğiniz zaman iptal edebilirsiniz. İptal işlemi mevcut ödeme döneminin sonunda geçerli olur; kalan süre için iade yapılmaz. Teknik bir hata veya çift ödeme durumunda iade taleplerinizi 7 gün içinde iletişime geçerek bildirebilirsiniz.</p>
        </Section>

        <Section title="5. Kullanım Kuralları">
          <p>Platformu kullanırken aşağıdaki kurallara uymayı kabul edersiniz:</p>
          <ul>
            <li>Platformu yalnızca yasal amaçlarla kullanmak</li>
            <li>Başkalarının gizlilik haklarına saygı göstermek</li>
            <li>Platformun güvenliğini tehdit edecek eylemlerden kaçınmak (kötü amaçlı yazılım, DDoS, vb.)</li>
            <li>Başkasının hesabına yetkisiz erişim sağlamamak</li>
            <li>Platformun kaynak kodunu tersine mühendislikle çözmeye çalışmamak</li>
            <li>Platformu yeniden satmak, kiralamak veya alt lisans vermek</li>
            <li>Spam veya yanıltıcı içerik göndermemek</li>
          </ul>
          <p>Bu kurallara aykırı davranış tespit edilmesi halinde Şirket, önceden bildirimde bulunmaksızın hesabı askıya alma veya sonlandırma hakkını saklı tutar.</p>
        </Section>

        <Section title="6. Google Hizmetleri Entegrasyonu">
          <p>xCut, Google OAuth ve Google Calendar API hizmetlerini kullanmaktadır. Bu entegrasyonları kullanırken ayrıca Google'ın <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed" }}>Hizmet Şartları</a> ve <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed" }}>Gizlilik Politikası</a>'na da tabi olduğunuzu kabul edersiniz.</p>
          <ul>
            <li>Google Takvim bağlantısı isteğe bağlıdır; dilediğiniz zaman Ayarlar bölümünden kaldırabilirsiniz.</li>
            <li>Google hesabınızdan geri çektiğiniz izinler, o andan itibaren takvim senkronizasyonunu devre dışı bırakır.</li>
            <li>Google API'lerinden edinilen veriler yalnızca randevu senkronizasyonu amacıyla kullanılır.</li>
          </ul>
        </Section>

        <Section title="7. Veri Sahipliği ve İçerik">
          <SubTitle>7.1 Kullanıcı Verileri</SubTitle>
          <p>Platforma yüklediğiniz müşteri verileri, randevular, belgeler ve diğer içerikler size aittir. Şirket bu verileri yalnızca hizmet sunumu amacıyla işler.</p>

          <SubTitle>7.2 Lisans</SubTitle>
          <p>İçeriklerinizi Platformda saklamamız, işlememiz ve gerektiğinde yedeklememiz için bize sınırlı, münhasır olmayan, devredilemez bir lisans vermiş sayılırsınız. Bu lisans yalnızca hizmet sunumuyla sınırlıdır.</p>

          <SubTitle>7.3 Platform İçeriği</SubTitle>
          <p>Platformun yazılımı, tasarımı, logolar, metinler ve diğer tüm unsurlar Şirketin fikri mülkiyetidir. İzinsiz kopyalanamaz veya kullanılamaz.</p>
        </Section>

        <Section title="8. Gizlilik">
          <p>Kişisel verilerinizin nasıl toplandığı ve işlendiği hakkında ayrıntılı bilgi için <Link href="/privacy" style={{ color: "#7c3aed" }}>Gizlilik Politikamızı</Link> inceleyiniz. Gizlilik Politikası bu Şartların ayrılmaz bir parçasını oluşturmaktadır.</p>
        </Section>

        <Section title="9. Hizmet Kesintileri ve Sorumluluk Sınırı">
          <SubTitle>9.1 Hizmet Sürekliliği</SubTitle>
          <p>Platformun kesintisiz çalışması için gerekli önlemleri alırız; ancak bakım, güncelleme veya öngörülemeyen teknik sorunlar nedeniyle geçici kesintiler yaşanabilir. Bu tür kesintilerden dolayı ortaya çıkan dolaylı zararlardan sorumlu değiliz.</p>

          <SubTitle>9.2 Sorumluluk Sınırı</SubTitle>
          <p>Yürürlükteki yasaların izin verdiği azami ölçüde, Şirketin sorumluluğu ödediğiniz son 3 aylık abonelik bedeli ile sınırlıdır. Kâr kaybı, veri kaybı veya dolaylı zararlardan sorumlu tutulamayız.</p>
        </Section>

        <Section title="10. Hesap Sonlandırma">
          <SubTitle>10.1 Kullanıcı Tarafından Sonlandırma</SubTitle>
          <p>Hesabınızı istediğiniz zaman Ayarlar bölümünden veya <a href={`mailto:${EMAIL}`} style={{ color: "#7c3aed" }}>{EMAIL}</a> adresine başvurarak sonlandırabilirsiniz.</p>

          <SubTitle>10.2 Şirket Tarafından Sonlandırma</SubTitle>
          <p>Şirket, bu Şartların ihlali veya hizmetin kötüye kullanılması durumunda hesabı önceden bildirim göndermeksizin askıya alabilir veya sonlandırabilir.</p>

          <SubTitle>10.3 Veri Sonrası</SubTitle>
          <p>Hesap sonlandırıldıktan sonra verileriniz 30 gün boyunca sistemde tutulur ve bu süre içinde dışa aktarma talebinde bulunabilirsiniz. Süre dolduğunda veriler kalıcı olarak silinir.</p>
        </Section>

        <Section title="11. Değişiklikler">
          <p>Şirket, bu Şartları önceden duyurarak güncelleme hakkını saklı tutar. Önemli değişikliklerde kayıtlı e-posta adresinize bildirim gönderilir. Değişikliklerden sonra Platformu kullanmaya devam etmeniz güncel Şartları kabul ettiğiniz anlamına gelir.</p>
        </Section>

        <Section title="12. Uygulanacak Hukuk ve Uyuşmazlık Çözümü">
          <p>Bu Şartlar Türk Hukuku'na tabidir. Şartlar kapsamında ortaya çıkabilecek uyuşmazlıklarda İstanbul Mahkemeleri ve İcra Daireleri yetkilidir. Uyuşmazlık önce karşılıklı müzakere ile çözülmeye çalışılır.</p>
        </Section>

        <Section title="13. İletişim">
          <p>Bu Şartlarla ilgili sorularınız için:</p>
          <ul>
            <li><strong>E-posta:</strong> <a href={`mailto:${EMAIL}`} style={{ color: "#7c3aed" }}>{EMAIL}</a></li>
            <li><strong>Şirket:</strong> {COMPANY}</li>
            <li><strong>Web:</strong> <a href={SITE} style={{ color: "#7c3aed" }}>{SITE}</a></li>
          </ul>
        </Section>

        {/* Footer links */}
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid #f1f5f9", display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Link href="/privacy" style={{ color: "#7c3aed", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Gizlilik Politikası →</Link>
          <Link href="/"        style={{ color: "#64748b", fontSize: 14, textDecoration: "none" }}>Ana Sayfa →</Link>
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

# Contributing to Construction Site Bot

Katkı için teşekkürler! Bu rehber geliştirme ortamını kurmaktan PR göndermeye kadar her adımı açıklar.

---

## Geliştirme Ortamı Kurulumu / Dev Setup

### Gereksinimler

- Node.js 18+
- Firebase projesi (Firestore etkin)
- Telegram bot tokeni (@BotFather'dan)
- OpenAI API anahtarı (AI özellikleri için)

### Adımlar

```bash
# 1. Fork'la ve klonla
git clone https://github.com/YOUR_USERNAME/blacksea-construction-bot.git
cd blacksea-construction-bot

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını kendi değerlerinle doldur

# 4. Çalıştır
npm start
```

### Telegram Webhook (Lokal)

Lokalde Telegram update almak için bir tunnel gereklidir:

```bash
# ngrok örneği
ngrok http 3000
# Alınan webhook URL'yi ayarla:
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://XXXX.ngrok.io"
```

### Webhook Olmadan Test

Webhook kurmak istemiyorsan, Firestore'u doğrudan seed scriptleriyle doldurabilir ve
`multitenant/test_full_flow.js` ile mantığı test edebilirsin:

```bash
node multitenant/test_full_flow.js
```

---

## Branch İsimlendirme / Branch Naming

| Tip | Format | Örnek |
|---|---|---|
| Yeni özellik | `feature/<kisa-aciklama>` | `feature/daily-report-pdf` |
| Bug düzeltme | `fix/<kisa-aciklama>` | `fix/malzeme-stok-negatif` |
| Refactor | `refactor/<kisa-aciklama>` | `refactor/session-manager` |
| Dokümantasyon | `docs/<kisa-aciklama>` | `docs/deployment-guide` |
| Test | `test/<kisa-aciklama>` | `test/onboarding-smoke` |

---

## Commit Mesajı Formatı / Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/) kullanırız:

```
<tip>: <kısa açıklama>

<isteğe bağlı detay>
```

**Tipler:**

| Tip | Ne Zaman |
|---|---|
| `feat` | Yeni özellik |
| `fix` | Bug düzeltme |
| `refactor` | Kod yeniden yapılandırma (davranış değişmiyor) |
| `docs` | Sadece doküman değişikliği |
| `test` | Test ekleme/düzeltme |
| `chore` | Bağımlılık, CI, konfigürasyon |
| `perf` | Performans iyileştirme |

**Örnekler:**

```bash
feat: daily PDF report generation via /rapor-pdf command
fix: malzeme stok negative value guard on depo transfer
refactor: extract session management to separate module
docs: add Render.com one-click deploy instructions
test: multi-tenant invite flow integration test
chore: bump firebase-admin to 12.1.0
```

---

## PR Süreci / Pull Request Workflow

1. Branch'inde çalış (`feature/...` veya `fix/...`)
2. Öncelikle smoke testi çalıştır:
   ```bash
   node smoke_test.mjs
   ```
3. Multi-tenant değişiklik yaptıysan entegrasyon testini çalıştır:
   ```bash
   node multitenant/test_full_flow.js
   ```
4. PR'ini `.github/pull_request_template.md` formatında aç
5. Reviewer atamadan önce CI geçmiş olmalı

---

## Test Gereksinimleri / Test Requirements

### Minimum

- `node smoke_test.mjs` — Her PR öncesi çalıştır. Tüm 5 kontrol geçmeli.
- `node multitenant/test_full_flow.js` — Multi-tenant koduna dokunan her değişiklik için.

### Mevcut Test Dosyaları

```
multitenant/test_full_flow.js      # Ana entegrasyon testi
multitenant/test_invite.js         # Davet sistemi
multitenant/test_multitenant.js    # Multi-tenant izolasyon
multitenant/test_onboarding.js     # Onboarding wizard state machine
multitenant/test_syntax_only.js    # Syntax doğrulama (Firebase gerektirmez)
smoke_test.mjs                     # Sistem sağlık kontrolü
```

### Test Ortamı

Testler için `.env` dosyanda gerçek Firebase ve Telegram bilgileri olmak zorunda.
CI testlerini dev/staging projesi üzerinde çalıştırın; production verisine dokunmayın.

---

## Kod Stili / Code Style

Projede formal bir linter kurulu değil. Mevcut kodun tarzını takip et:

- **Girintileme:** 2 boşluk
- **String:** tek tırnak (`'`) tercih edilir
- **Değişkenler:** camelCase
- **Sabitler:** UPPER_SNAKE_CASE
- **Async:** `async/await` tercih edilir, raw Promise chain kaçınılır
- **Hata yönetimi:** `try/catch` blokları, sessiz hata yutulmaz
- **Yorumlar:** Türkçe yorumlar kabul edilir (mevcut kod stiliyle uyumlu)
- **Fonksiyon uzunluğu:** 50 satırdan uzun fonksiyonları bölmek için çaba göster

### Kritik Kural: MAHAL_MAP

`index.js` içerisindeki `MAHAL_MAP` nesnesini arka-uyumluluk gerekçe gösterilmeden değiştirme.
Bu yapı mevcut Firestore kayıtlarıyla eşleşmekte; değişiklik eski verileri bozabilir.

### Multi-Tenant Kuralları

- Her yeni Firestore sorgusuna `firma_id` filtresi ekle
- Ham `db.collection(...)` yerine `multitenant/firestore_helpers.js` wrapper'larını kullan
- Cross-firma veri erişimini `multitenant/auth.js:canAccessFirma()` ile doğrula

---

## Yeni Komut Ekleme / Adding a New Bot Command

1. `index.js` içindeki handler bölümünü bul (yaklaşık 350+ satırdan itibaren `handleMessage` ve türev fonksiyonları)
2. Yeni komut için bir fonksiyon ekle; session state pattern'ine uy:
   ```js
   // Örnek yeni komut handler'ı
   async function handleYeniKomut(chatId, user) {
     await send(chatId, 'Yeni komut cevabı');
   }
   ```
3. `handleMessage` router'ına komutu ekle
4. Komut listesini `/yardim` handler'ında güncelle
5. `.env.example` değiştiyse güncelle

---

## Issue Bildirme / Reporting Issues

`.github/ISSUE_TEMPLATE/` altındaki şablonları kullan:

- **Bug:** `bug_report.md` — adım adım reproduction'la
- **Feature:** `feature_request.md` — problem + önerilen çözümle

---

## Claude Code ile Geliştirme / Using Claude Code

Bu proje `CLAUDE.md` içerir — Claude Code'u proje dizininde başlatırsan dosya otomatik yüklenir ve mimari, dosya indeksi, dikkat edilecekler dahil tam bağlamı alır.

```bash
claude
```

---

## Sorular / Questions

Issue aç veya PR yorumunda sor. Türkçe veya İngilizce ikisi de kabul edilir.

// Construction Site Telegram Bot — Node.js / Render.com
const express  = require('express');
const fetch    = require('node-fetch');
const admin    = require('firebase-admin');
const ExcelJS  = require('exceljs');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');

// ─── FIREBASE ────────────────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_CREDENTIALS)
  )
});
const db = admin.firestore();

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_TOKEN;
const API   = `https://api.telegram.org/bot${TOKEN}`;

// CONFIGURATION: Replace these placeholder Telegram chat IDs and names
// with your actual team members. Get chat IDs from @userinfobot on Telegram.
//
// Roles:
//   admin     — bot admin (developer)
//   patron    — owner / boss (sees all sites, can ask AI, assign tasks)
//   mudur     — site manager (sees all sites, can enter records)
//   sef       — site foreman (enters daily work logs for their site)
//   satinalma — procurement (manages material orders and warehouse)
const USERS = {
  'YOUR_ADMIN_CHAT_ID':    { name: 'Admin',            role: 'admin',     santiye: 'site1'     },
  'YOUR_SATINALMA_CHAT_ID': { name: 'Satinalma',       role: 'satinalma', santiye: 'hepsi'     },
  'YOUR_PATRON_CHAT_ID':   { name: 'Patron',            role: 'patron',    santiye: 'hepsi'     },
  'YOUR_SEF1_CHAT_ID':     { name: 'Şef 1',            role: 'sef',       santiye: 'site2'     },
  'YOUR_SEF2_CHAT_ID':     { name: 'Şef 2',            role: 'sef',       santiye: 'site3'     },
  'YOUR_MUDUR_CHAT_ID':    { name: 'Müdür',            role: 'mudur',     santiye: 'site4'     },
  // Add more team members as needed
};

// Multi-tenant compat mode — USERS dict + Firestore dual-source
// Existing users are not affected; new tenants load from Firestore
const { initCompat } = require('./multitenant/compat');
initCompat(USERS);

// Multi-tenant Faz C — Onboarding wizard ve invite handler
const onboarding = require('./multitenant/onboarding');
const inviteHandler = require('./multitenant/invite_handler');

// Expected foremen — auto-added to USERS on first message
// and admin + patron are notified
// Replace with the real name(s) you expect to join the bot
const BEKLEYEN_SEFLER = [
  // Example: { name: 'Ali Yılmaz', role: 'sef', santiye: 'site1' },
];

const IS_GUCU = [
  'Santiye Sefi',
  'Yardimci Elemanlar',
  'Kalip Ekibi',
  'Demir Ekibi',
  'Izolasyon Ekibi',
  'Tugla Ekibi',
  'Elektrik Ekibi',
  'Mekanik Ekibi',
  'Alci Boya Ekibi',
  'Dograma Ekibi',
  'Siva Ekibi',
  'Mermer Ekibi',
  'Seramik Ekibi',
  'Dis Cephe Ekibi',
  'Kapi Ekibi',
  'Ferforje-Cam-Korkuluk Ekibi',
  'Mutfak Banyo Dolap Ekibi',
  'Laminat Ekibi',
  'Alcipan Ekibi',
  'Kompozit Ekibi'
];

const BIRIM = ['m2', 'm3', 'ton', 'kg', 'adet', 'mt', 'saat'];

const MAHAL_MAP = {
  site1: [
    '1. Bodrum', '2. Bodrum', 'Zemin Kat', '1. Kat', '2. Kat',
    '3. Kat', '4. Kat', 'Çatı', 'Genel / Dış Saha'
  ],
  site2: [
    // A Blok (30 daire)
    'A Blok - Zemin',      'A Blok - 1. Kat',     'A Blok - 2. Kat',
    'A Blok - 3. Kat',     'A Blok - 4. Kat',     'A Blok - 5. Kat',
    'A Blok - Dublex (6-7.Kat)',
    // B Blok (24 + dublex)
    'B Blok - Zemin',      'B Blok - 1. Kat',     'B Blok - 2. Kat',
    'B Blok - 3. Kat',     'B Blok - 4. Kat',     'B Blok - 5. Kat',
    'B Blok - Dublex (6-7.Kat)',
    // C Blok
    'C Blok - Zemin',      'C Blok - 1. Kat',     'C Blok - 2. Kat',
    'C Blok - 3. Kat',     'C Blok - 4. Kat',     'C Blok - 5. Kat',
    'C Blok - Dublex (6-7.Kat)',
    // D Blok
    'D Blok - Zemin',      'D Blok - 1. Kat',     'D Blok - 2. Kat',
    'D Blok - 3. Kat',     'D Blok - 4. Kat',     'D Blok - 5. Kat',
    'D Blok - Dublex (6-7.Kat)',
    // Villalar (17 adet, 3 katlı — hangi kat olduğu açıklamaya yazılır)
    'Villa 1',  'Villa 2',  'Villa 3',  'Villa 4',  'Villa 5',
    'Villa 6',  'Villa 7',  'Villa 8',  'Villa 9',  'Villa 10',
    'Villa 11', 'Villa 12', 'Villa 13', 'Villa 14', 'Villa 15',
    'Villa 16', 'Villa 17',
    'Genel / Dış Saha'
  ],
  site3: [
    'Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5',
    'Genel / Dış Saha'
  ],
  site4: [
    'Engelli Rampası',
    'Merdiven',
    'Ek Bina',
    'Teknik Blok',
    'Çatı',
    'Genel / Dış Saha'
  ]
};

function getMahal(santiye) {
  return MAHAL_MAP[santiye] || MAHAL_MAP.site1;
}

function matchMahal(text, santiye) {
  const mahalList = getMahal(santiye);
  const t = text.trim();
  const n = parseInt(t);
  if (!isNaN(n) && n >= 1 && n <= mahalList.length) return mahalList[n - 1];
  const norm = s => trAscii(s).replace(/[^a-z0-9]/g, '');
  return mahalList.find(m => norm(m).includes(norm(t)) || norm(t).includes(norm(m))) || null;
}

// Ekip → İş planı kategori eşleşmesi
const EKIP_KATEGORI = {
  'Santiye Sefi':                 ['Genel'],
  'Yardimci Elemanlar':           [],
  'Kalip Ekibi':                  ['Kaba İşler'],
  'Demir Ekibi':                  ['Kaba İşler'],
  'Izolasyon Ekibi':              ['İzolasyon'],
  'Tugla Ekibi':                  ['Tuğla'],
  'Elektrik Ekibi':               ['Elektrik'],
  'Mekanik Ekibi':                ['Mekanik'],
  'Alci Boya Ekibi':              ['İnce İşler', 'Şap'],
  'Dograma Ekibi':                ['Doğrama'],
  'Siva Ekibi':                   ['İnce İşler', 'Dış Cephe'],
  'Mermer Ekibi':                 ['Mermer'],
  'Seramik Ekibi':                ['Seramik', 'Zemin Kaplama'],
  'Dis Cephe Ekibi':              ['Dış Cephe'],
  'Kapi Ekibi':                   ['Kapılar'],
  'Ferforje-Cam-Korkuluk Ekibi':  ['Korkuluklar'],
  'Mutfak Banyo Dolap Ekibi':     ['Dolaplar', 'Mermer'],
  'Laminat Ekibi':                ['Zemin Kaplama']
};

// ─── KISILER YUKLE (restart'ta Firestore'dan USERS'a geri yükle) ─────────────
async function kisileriYukle() {
  try {
    const snap = await db.collection('kisiler').get();
    let eklenen = 0;
    snap.forEach(doc => {
      const d = doc.data();
      const chatId = doc.id;
      if (!USERS[chatId] && d.name) {
        USERS[chatId] = { name: d.name, role: d.role || 'sef', santiye: d.santiye || 'hepsi' };
        eklenen++;
      }
    });
    console.log(`Kisiler yüklendi: ${eklenen} yeni kullanıcı eklendi (toplam USERS: ${Object.keys(USERS).length})`);
  } catch (e) {
    console.error('Kisiler yükleme hatası:', e.message);
  }
}

// ─── SESSION ─────────────────────────────────────────────────────────────────
const sessions = {};
// Media group buffer: birden fazla fotoğraf aynı anda gönderildiğinde toplar
const mediaGroupBuffer = {}; // media_group_id → { chatId, fileIds, timer }
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 dakika
const BOT_START_TIME = Date.now(); // Restart tespiti için
const RESTART_NOTIFIED = new Set(); // Restart sonrası bildirim gönderilen chatId'ler
const RESTART_GRACE_MS = 5 * 60 * 1000; // 5 dakika içinde restart bildirimi gönder
console.log('⚠️ Restart: Tüm aktif form oturumları (sessions) sıfırlandı.');

// Session timeout kontrolü — her okuyuşta _ts sıfırlanır (touch-on-read)
// Render restart'ta session kaybolur → boş {} döner → form başa alınır
function sessionAl(chatId) {
  const s = sessions[chatId];
  if (!s) return {};
  const now = Date.now();
  if (s._ts && now - s._ts > SESSION_TIMEOUT_MS) {
    delete sessions[chatId];
    console.log(`Session timeout temizlendi: ${chatId}`);
    return {};
  }
  s._ts = now; // aktiviteyi güncelle
  return s;
}

// ─── PLAN CACHE (per-santiye) ─────────────────────────────────────────────────
const planCacheMap     = {};
const planCacheTimeMap = {};

async function planYukle(santiye = 'site1') {
  const now = Date.now();
  if ((planCacheMap[santiye] || []).length > 0 &&
      now - (planCacheTimeMap[santiye] || 0) < 3600000) return;
  try {
    let snap;
    if (santiye === 'site1') {
      // Eski belgeler santiye field'ı olmayabilir — geriye dönük uyumluluk
      snap = await db.collection('is_plani').get();
      planCacheMap[santiye] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(d => !d.santiye || d.santiye === 'site1');
    } else {
      snap = await db.collection('is_plani').where('santiye', '==', santiye).get();
      planCacheMap[santiye] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    planCacheTimeMap[santiye] = now;
    console.log(`Plan cache [${santiye}]: ${planCacheMap[santiye].length} gorev yuklendi.`);
  } catch (err) {
    console.error('Plan yuklenemedi:', err.message);
  }
}

// ─── DEPO ────────────────────────────────────────────────────────────────────
async function depoStok() {
  try {
    const snap = await db.collection('depo_hareketleri').get();
    const stok = {};
    snap.docs.forEach(d => {
      const r = d.data();
      const key = `${r.malzeme}||${r.birim}`;
      if (!stok[key]) stok[key] = { malzeme: r.malzeme, birim: r.birim, miktar: 0 };
      stok[key].miktar += r.tip === 'giris' ? (r.miktar || 0) : -(r.miktar || 0);
    });
    return Object.values(stok).sort((a, b) => a.malzeme.localeCompare(b.malzeme, 'tr'));
  } catch(e) {
    console.error('depoStok hata:', e.message);
    return [];
  }
}

// Şantiye stoğu (şef bazlı giriş/kullanım takibi)
async function santiyeStoku(santiye) {
  try {
    const snap = await db.collection('santiye_stoku')
      .where('santiye', '==', santiye).get();
    const stok = {};
    snap.docs.forEach(d => {
      const r = d.data();
      const key = `${r.malzeme}||${r.birim}`;
      if (!stok[key]) stok[key] = { malzeme: r.malzeme, birim: r.birim, giren: 0, kullanilan: 0 };
      if (r.tip === 'giris')  stok[key].giren     += r.miktar || 0;
      if (r.tip === 'cikis')  stok[key].kullanilan += r.miktar || 0;
    });
    return Object.values(stok)
      .map(s => ({ ...s, kalan: s.giren - s.kullanilan }))
      .sort((a, b) => a.malzeme.localeCompare(b.malzeme, 'tr'));
  } catch(e) {
    console.error(`santiyeStoku(${santiye}) hata:`, e.message);
    return [];
  }
}

// Tüm şantiyeler + ana depo stok raporu (müdür / patron için)
async function tumStokRaporu() {
  const santiyeler = ['site1', 'site2', 'site3', 'site4'];
  const isimler   = { site1: 'Site 1', site2: 'Site 2', site3: 'Site 3', site4: 'Site 4' };
  let rapor = '';

  for (const snt of santiyeler) {
    const stok = await santiyeStoku(snt);
    const baslik = `▌ ${isimler[snt].toUpperCase()}\n`;
    if (stok.length === 0) {
      rapor += baslik + `  — Kayıt yok\n\n`;
    } else {
      const satirlar = stok.map(s =>
        `  • ${s.malzeme}: ${s.giren}${s.birim} geldi, ${s.kullanilan}${s.birim} kullanıldı → Kalan: ${s.kalan}${s.birim}`
      ).join('\n');
      rapor += baslik + satirlar + '\n\n';
    }
  }

  // Ana depo
  const depo = await depoStok();
  rapor += `▌ ANA DEPO\n`;
  if (depo.length === 0) {
    rapor += `  — Kayıt yok\n`;
  } else {
    rapor += depo.map(s => `  • ${s.malzeme}: ${s.miktar} ${s.birim}`).join('\n');
  }

  return rapor;
}

// Ekibe göre filtrelenmiş görevler — tamamlanmamış tüm görevler
function aktifGorevler(ekip, santiye = 'site1') {
  const cache = planCacheMap[santiye] || [];
  const kategoriler = EKIP_KATEGORI[ekip] || [];
  return cache.filter(g => {
    if ((g.ilerleme || 0) >= 100) return false;
    // Akyazı dışında kategori filtresi uygulanmaz (tamir/tadilat farklı kategoriler)
    if (santiye === 'site1' && kategoriler.length > 0 &&
        !kategoriler.some(k => g.kategori === k)) return false;
    return true;
  }).slice(0, 15);
}

// ─── GENERATIVE MEMORY (Uzun vadeli hafıza) ──────────────────────────────────
// Stanford Generative Agents mimarisinden ilham:
// Her mesaj → event olarak saklanır, önem skoru atanır, retrieval 3 faktörlü
const MEMORY_COLLECTION = 'agent_memory';
const MEMORY_IMPORTANCE_THRESHOLD = 150; // reflection tetikleyici eşik

async function memoryEkle(chatId, userName, description, poignancy = 5) {
  try {
    await db.collection(MEMORY_COLLECTION).add({
      chatId: String(chatId),
      userName,
      description,
      poignancy,
      type: 'event',
      timestamp: new Date(),
      createdAt: Date.now(),
    });
  } catch (e) {
    console.error('memoryEkle hata:', e.message);
  }
}

async function memoryGetir(chatId, query, topK = 5) {
  try {
    // Index gerektirmeyen sorgu — tüm kayıtları çek, JS'de sırala
    const snap = await db.collection(MEMORY_COLLECTION)
      .where('chatId', '==', String(chatId))
      .limit(50)
      .get();

    if (snap.empty) return '';

    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const scored = [];

    snap.forEach(doc => {
      const d = doc.data();
      const hoursAgo = (Date.now() - (d.createdAt || 0)) / 3600000;
      const recency = Math.pow(0.99, hoursAgo);
      const importance = (d.poignancy || 5) / 10;
      const descWords = new Set((d.description || '').toLowerCase().split(/\s+/));
      const overlap = [...queryWords].filter(w => descWords.has(w)).length;
      const relevance = queryWords.size > 0 ? overlap / queryWords.size : 0;
      const score = (0.5 * recency) + (3.0 * relevance) + (2.0 * importance);
      scored.push({ ...d, score });
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);

    if (top.length === 0) return '';

    const lines = top.map(m => {
      const h = Math.round((Date.now() - (m.createdAt || 0)) / 3600000);
      const zaman = h < 1 ? 'az önce' : h < 24 ? `${h} saat önce` : `${Math.round(h/24)} gün önce`;
      return `[${zaman}] ${m.description}`;
    });

    return `\n--- KULLANICI HAFIZASI (${top[0].userName || 'bilinmeyen'}) ---\n${lines.join('\n')}\n--- HAFIZA SONU ---`;
  } catch (e) {
    console.error('memoryGetir hata:', e.message);
    return '';
  }
}

// ─── AI CHATBOT (Patron için) ─────────────────────────────────────────────────
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Konuşma geçmişini tek dokümanda dizi olarak sakla (index gerektirmez)
async function gecmisYukle(chatId) {
  try {
    const doc = await db.collection('ai_gecmis').doc(chatId).get();
    if (!doc.exists) return [];
    return (doc.data().mesajlar || []).slice(-20); // son 20 mesaj
  } catch (e) {
    console.error('gecmisYukle hata:', chatId, e.message);
    return [];
  }
}

async function gecmisKaydet(chatId, kullaniciMesaj, asistanCevap) {
  try {
    const doc = await db.collection('ai_gecmis').doc(chatId).get();
    const eskiler = doc.exists ? (doc.data().mesajlar || []) : [];
    const yeniler = [
      ...eskiler,
      { role: 'user',      content: kullaniciMesaj },
      { role: 'assistant', content: asistanCevap   }
    ].slice(-10); // max 10 mesaj tut (5 tur) — daha fazlası veri sorgularını bozuyor
    await db.collection('ai_gecmis').doc(chatId).set({ mesajlar: yeniler });
  } catch (e) {
    console.error('gecmisKaydet hata:', chatId, e.message);
  }
}

// Firestore'dan şantiye verilerini topla (santiyeFilter: 'site1' | 'site3' | 'hepsi')
async function santiyeVerisiOzet(santiyeFilter = 'hepsi') {
  // Türkiye saatini kullan (UTC+3)
  const nowTR  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const bugun  = new Date(nowTR); bugun.setHours(0, 0, 0, 0);
  const haftaBasi = new Date(bugun); haftaBasi.setDate(bugun.getDate() - bugun.getDay() + 1);
  const ayBasi    = new Date(bugun.getFullYear(), bugun.getMonth(), 1);

  const [isSnap, planSnap, malSnap, notSnap] = await Promise.all([
    db.collection('is_takibi').orderBy('tarih', 'desc').limit(200).get(),
    db.collection('is_plani').get(),
    db.collection('malzeme_takibi').orderBy('tarih', 'desc').limit(300).get(),
    db.collection('gunluk_notlar').orderBy('tarih', 'desc').limit(20).get()
  ]);

  // Santiye filtresi — sadece ilgili santiyenin kayıtları
  const filtrele = (docs) => docs.map(d => d.data()).filter(r =>
    santiyeFilter === 'hepsi' || r.santiye === santiyeFilter
  );

  const isVeriler   = filtrele(isSnap.docs);
  const planVeriler = planSnap.docs.map(d => d.data()); // plan şimdilik sadece site1
  const malVeriler  = filtrele(malSnap.docs);
  const notVeriler  = filtrele(notSnap.docs);

  // Bu hafta özeti
  const haftaKayitlar = isVeriler.filter(r => r.tarih?.toDate() >= haftaBasi);
  const bugunKayitlar = isVeriler.filter(r => r.tarih?.toDate() >= bugun);

  // Ekip bazında bu ay çalışan adam toplamı
  const ekipAdamMap = {};
  isVeriler.forEach(r => {
    if (!ekipAdamMap[r.ekip]) ekipAdamMap[r.ekip] = 0;
    ekipAdamMap[r.ekip] += r.adam || 0;
  });

  // Plan durumu
  const planDurum = { tamam: 0, devam: 0, gecikmeli: 0, planli: 0 };
  const gecikmeliGorevler = [];
  const devamGorevler = [];
  planVeriler.forEach(g => {
    const bas = g.bas?.toDate ? g.bas.toDate() : null;
    const bit = g.bit?.toDate ? g.bit.toDate() : null;
    const il  = g.ilerleme || 0;
    if (il >= 100) { planDurum.tamam++; return; }
    if (!bas || !bit) { planDurum.planli++; return; }
    if (bit < bugun) { planDurum.gecikmeli++; gecikmeliGorevler.push(`${g.ad} (${g.kategori})`); return; }
    if (bas <= bugun) { planDurum.devam++; devamGorevler.push(`${g.ad} - %${il} (${g.kategori})`); return; }
    planDurum.planli++;
  });

  // Yevmiye hesapları
  const dun = new Date(bugun); dun.setDate(bugun.getDate() - 1);
  const ikiGunOnce = new Date(bugun); ikiGunOnce.setDate(bugun.getDate() - 2);

  const yevmiyeHesapla = (kayitlar) => kayitlar.reduce((t, r) => t + (r.adam || 0), 0);

  const bugunYevmiye   = yevmiyeHesapla(bugunKayitlar);
  const dunKayitlar    = isVeriler.filter(r => { const d = r.tarih?.toDate(); return d && d >= dun && d < bugun; });
  const dunYevmiye     = yevmiyeHesapla(dunKayitlar);
  const son2gunYevmiye = bugunYevmiye + dunYevmiye;
  const haftaYevmiye   = yevmiyeHesapla(haftaKayitlar);
  const ayVeriler      = isVeriler.filter(r => r.tarih?.toDate() >= ayBasi);
  const ayYevmiye      = yevmiyeHesapla(ayVeriler);

  // Ekip bazında bugün yevmiye
  const ekipYevmiye = {};
  bugunKayitlar.forEach(r => {
    ekipYevmiye[r.ekip] = (ekipYevmiye[r.ekip] || 0) + (r.adam || 0);
  });

  // Bugün kayıt giren şefler
  const bugunSefler = [...new Set(bugunKayitlar.map(r => r.kullanici).filter(Boolean))];

  // Son 7 günde her şefin en son kayıt tarihi
  const sefSonKayit = {};
  isVeriler.forEach(r => {
    if (!r.kullanici) return;
    const t = r.tarih?.toDate ? r.tarih.toDate() : null;
    if (!t) return;
    if (!sefSonKayit[r.kullanici] || t > sefSonKayit[r.kullanici]) {
      sefSonKayit[r.kullanici] = t;
    }
  });
  const sefDurum = Object.entries(sefSonKayit).map(([sef, tarih]) => {
    const gun = tarih.toLocaleDateString('tr-TR');
    const bugunMu = tarih >= bugun;
    return `${sef}: ${bugunMu ? '✅ BUGÜN SAHADAYDİ' : `Son kayıt ${gun}`}`;
  }).join('\n') || 'Kayıt yok';

  // Son 10 iş girişi
  const son10 = isVeriler.slice(0, 10).map(r => {
    const t = r.tarih?.toDate ? r.tarih.toDate().toLocaleDateString('tr-TR') : '?';
    const s = r.santiye ? `[${r.santiye.toUpperCase()}]` : '[AKYAZI]';
    return `${t} ${s} | ${r.kullanici || '?'} | ${r.ekip}, ${r.adam} kişi, ${r.imalat} ${r.miktar}${r.birim}, ${r.mahal}`;
  });

  // Malzeme özeti (son 30 gün)
  const malOzet = malVeriler.slice(0, 15).map(m => {
    const t = m.tarih?.toDate ? m.tarih.toDate().toLocaleDateString('tr-TR') : '?';
    const s = m.santiye ? `[${m.santiye.toUpperCase()}]` : '';
    return `${t} ${s}: ${m.malzeme} ${m.miktar}${m.birim}${m.firma ? ' (' + m.firma + ')' : ''}${m.not ? ' — ' + m.not : ''}`;
  });

  // Bugün gelen malzeme
  const bugunMal = malVeriler.filter(m => m.tarih?.toDate && m.tarih.toDate() >= bugun);

  // Şantiye bazlı son 10 gün gelen malzeme (tip='giris')
  const onGunOnce = new Date(bugun); onGunOnce.setDate(bugun.getDate() - 10);
  const son10GunMal = malVeriler.filter(m =>
    m.tarih?.toDate && m.tarih.toDate() >= onGunOnce && (!m.tip || m.tip === 'giris')
  );
  const malPerSantiye = {};
  son10GunMal.forEach(m => {
    const s = m.santiye || 'belirsiz';
    if (!malPerSantiye[s]) malPerSantiye[s] = [];
    const t = m.tarih?.toDate ? m.tarih.toDate().toLocaleDateString('tr-TR') : '?';
    malPerSantiye[s].push(`${t}: ${m.malzeme} ${m.miktar}${m.birim}${m.firma ? ' (' + m.firma + ')' : ''}${m.not ? ' — ' + m.not : ''}`);
  });
  const santiyeMalOzet = ['site1', 'site2', 'site3', 'site4'].map(s => {
    const kayitlar = malPerSantiye[s] || [];
    return `[${s.toUpperCase()}] Son 10 gün ${kayitlar.length} malzeme girişi:\n${kayitlar.length > 0 ? kayitlar.join('\n') : '  Kayıt yok'}`;
  }).join('\n\n');

  // Son notlar
  const sonNotlar = notVeriler.slice(0, 5).map(n => {
    const t = n.tarih?.toDate ? n.tarih.toDate().toLocaleDateString('tr-TR') : '?';
    return `${t} (${n.kullanici || '?'}): ${n.not}`;
  });

  // Şantiye bazlı bugün özeti
  const santiyeBugun = {};
  bugunKayitlar.forEach(r => {
    const s = r.santiye || 'site1';
    if (!santiyeBugun[s]) santiyeBugun[s] = [];
    santiyeBugun[s].push(`${r.ekip} ${r.adam}kişi ${r.imalat} ${r.miktar}${r.birim} @ ${r.mahal} (${r.kullanici})`);
  });
  const santiyeBugunOzet = ['site1', 'site2', 'site3', 'site4'].map(s => {
    const kayitlar = santiyeBugun[s] || [];
    return `[${s.toUpperCase()}] Bugün ${kayitlar.length} kayıt: ${kayitlar.length > 0 ? kayitlar.join(' | ') : 'Kayıt yok'}`;
  }).join('\n');

  return `
BUGÜN: ${new Date().toLocaleDateString('tr-TR')}

== ŞANTİYE BAZLI BUGÜN ÖZETİ ==
${santiyeBugunOzet}

== ŞEF DURUM (kayıt bazlı) ==
${sefDurum}
Bugün sahada olan şefler: ${bugunSefler.join(', ') || 'Henüz kayıt girilmedi'}

== YEVMİYE (1 yevmiye = 1 kişi 1 gün çalışması) ==
Bugün: ${bugunYevmiye} yevmiye (${bugunKayitlar.length} kayıt)
Dün: ${dunYevmiye} yevmiye
Son 2 gün toplam: ${son2gunYevmiye} yevmiye
Bu hafta: ${haftaYevmiye} yevmiye
Bu ay: ${ayYevmiye} yevmiye
Bugün ekip bazında: ${Object.entries(ekipYevmiye).map(([e,y]) => `${e} ${y} kişi`).join(', ') || 'Kayıt yok'}

== BU HAFTA ==
Toplam kayıt: ${haftaKayitlar.length}
Bugün kayıt sayısı: ${bugunKayitlar.length}
Çalışan ekipler: ${[...new Set(haftaKayitlar.map(r => r.ekip))].join(', ') || 'Yok'}

== BU AY EKİP BAZINDA TOPLAM ADAM ==
${Object.entries(ekipAdamMap).map(([e,a]) => `${e}: ${a} adam-gün`).join('\n') || 'Kayıt yok'}

== İŞ PLANI DURUMU ==
Tamamlandı: ${planDurum.tamam} görev
Devam ediyor: ${planDurum.devam} görev
Gecikmeli: ${planDurum.gecikmeli} görev
Planlanmış: ${planDurum.planli} görev
Gecikmeli görevler: ${gecikmeliGorevler.slice(0, 5).join('; ') || 'Yok'}
Aktif görevler: ${devamGorevler.slice(0, 5).join('; ') || 'Yok'}

== SON 10 İŞ GİRİŞİ ==
${son10.join('\n') || 'Kayıt yok'}

== MALZEME TAKİBİ (son 30 gün) ==
Bugün gelen: ${bugunMal.length > 0 ? bugunMal.map(m => `${m.malzeme} ${m.miktar}${m.birim}`).join(', ') : 'Yok'}
${malOzet.join('\n') || 'Kayıt yok'}

== ŞANTİYE BAZLI SON 10 GÜN GELEN MALZEME ==
${santiyeMalOzet}

== GÜNLÜK NOTLAR ==
${sonNotlar.join('\n') || 'Not yok'}

== AKTİF ŞANTİYELER ==
[SITE1] Site 1 | DD.MM.YYYY - DD.MM.YYYY | Şef: Şef 1
[SITE2] Site 2 | Tamamlanmış bina, tamir/tadilat/eksik giderme | Şef: Şef 2 | 4 blok + villalar
[SITE3] Site 3 | 5 villa | Şef: Şef 1
[SITE4] Site 4 | Proje tanımı | Müdür: Müdür
Dashboard: https://your-firebase-project.web.app
`.trim();
}

async function aiCevap(chatId, kullaniciMesaj) {
  try {
    if (!OPENAI_KEY) return 'OPENAI_API_KEY tanımlı değil.';

    const user = USERS[chatId];
    // Patron ve müdür tüm şantiyeleri görür; mudur'un santiye alanı iş girişi içindir
    const userSantiye = (user?.role === 'patron' || user?.role === 'mudur') ? 'hepsi' : (user?.santiye || 'hepsi');

    // 1. Şantiye verisini al (patron hepsini görür, diğerleri kendi şantiyesini)
    let santiyeOzet = 'Veri alınamadı.';
    try {
      santiyeOzet = await santiyeVerisiOzet(userSantiye);
      console.log('--- SANTIYE OZET ---\n', santiyeOzet.slice(0, 500));
    } catch(e) {
      santiyeOzet = `Veri hatası: ${e.message}`;
      console.error('santiyeVerisiOzet hata:', e.message);
    }

    // 2. Geçmişi al
    let gecmis = [];
    try { gecmis = await gecmisYukle(chatId); } catch(e) { gecmis = []; }

    // 2.5 Uzun vadeli hafızayı al (Generative Memory)
    let hafizaContext = '';
    try { hafizaContext = await memoryGetir(chatId, kullaniciMesaj, 5); } catch(e) { hafizaContext = ''; }

    // 3. OpenAI isteği
    const nowTR = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const bugunTR = nowTR.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dunTR = new Date(nowTR);
    dunTR.setDate(dunTR.getDate() - 1);
    const dunTRStr = dunTR.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content:
            `Sen inşaat şirketinin akıllı şantiye asistanısın. Patron ve müdüre şantiye hakkında net, kısa ve doğru bilgi verirsin. Türkçe konuşursun.

BUGÜNÜN TARİHİ: ${bugunTR}
DÜN: ${dunTRStr}

KURALLAR:
- Her sorguda kullanıcı mesajının BAŞINDA "[ANLIK VERİ]" bloğu gelir. SADECE bunu kullan, geçmiş konuşmalardaki verileri YOKSAY.
- "Bugün kayıt var mı / neler yapıldı" sorularında yalnızca [ANLIK VERİ] içindeki "ŞANTİYE BAZLI BUGÜN ÖZETİ"ne bak.
- Uydurma. Geçmiş cevaplara bakma.
- Kısa ve net cevap ver.

KADRO:
- Şef 1 görev yeri: Site 1
- Şef 2 görev yeri: Site 2
- Sistem Yöneticisi: Admin

SİSTEM YETKİLERİ:
- Fotoğraf isteklerine "yetkim yok" DEME. "Santiye Fotolari klasorunu kontrol et" veya "/dropbox fotolar" yaz de.
- Belge/dosya isteklerine de aynı şekilde yönlendir.
- Eğer [HAFIZA] bloğu varsa, kullanıcının geçmiş deneyimlerini bağlam olarak kullan. Kişiselleştirilmiş cevap ver. Geçmişte bahsettiği konulara referans ver.`
          },
          ...gecmis,
          { role: 'user', content: `[ANLIK VERİ — ${bugunTR}]\n${santiyeOzet}${hafizaContext}\n\n[SORU]\n${kullaniciMesaj}` }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (!resp.ok) {
      // Güvenlik fix (26 Nisan 2026): error text içinde Authorization header / API key
      // sızabilir. Sadece status code log'a, kullanıcıya generic mesaj.
      console.error('OpenAI HTTP hata:', resp.status);
      return `OpenAI hata ${resp.status} (detaylar log'da)`;
    }

    const data  = await resp.json();
    const cevap = data.choices?.[0]?.message?.content;
    if (!cevap) return `OpenAI boş cevap: ${JSON.stringify(data).slice(0, 200)}`;

    // 4. Geçmişe kaydet (hata olsa da devam et)
    try { await gecmisKaydet(chatId, kullaniciMesaj, cevap); } catch(e) { console.error('gecmisKaydet hata:', e.message); }

    // 5. Uzun vadeli hafızaya kaydet (Generative Memory)
    try {
      const userName = user?.name || 'bilinmeyen';
      await memoryEkle(chatId, userName, kullaniciMesaj, 5);
    } catch(e) { console.error('memoryEkle hata:', e.message); }

    return cevap;
  } catch (err) {
    console.error('AI hata:', err.message);
    return `Hata: ${err.message}`;
  }
}

// ─── TELEGRAM API ─────────────────────────────────────────────────────────────
const TELEGRAM_LIMIT = 4000; // güvenli sınır (max 4096)

async function sendOne(chatId, text) {
  const resp = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error(`send() hata [${chatId}] ${resp.status}: ${err.slice(0, 200)}`);
  }
}

async function send(chatId, text) {
  if (!text || text.length <= TELEGRAM_LIMIT) {
    return sendOne(chatId, text);
  }
  // Uzun mesajı satır sınırlarından böl
  const parcalar = [];
  let kalan = text;
  while (kalan.length > TELEGRAM_LIMIT) {
    let kes = kalan.lastIndexOf('\n', TELEGRAM_LIMIT);
    if (kes < TELEGRAM_LIMIT / 2) kes = TELEGRAM_LIMIT; // satır bulunamazsa sert kes
    parcalar.push(kalan.slice(0, kes));
    kalan = kalan.slice(kes).replace(/^\n/, '');
  }
  if (kalan.length) parcalar.push(kalan);
  for (const p of parcalar) {
    await sendOne(chatId, p);
  }
}

// Multi-tenant onboarding & invite handler init (send + API hazır olduktan sonra)
onboarding.init({ db, send, telegramApi: API, botUsername: process.env.BOT_USERNAME });
inviteHandler.init({ db, send });

async function sendDocument(chatId, filePath, caption) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', fs.createReadStream(filePath), path.basename(filePath));
  if (caption) form.append('caption', caption);
  await fetch(`${API}/sendDocument`, { method: 'POST', body: form });
}

// ─── EXCEL RAPORLARI ──────────────────────────────────────────────────────────

// Excel stil yardımcısı
function baslikSatiri(ws, cols) {
  const row = ws.addRow(cols.map(c => c.header));
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center' };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FF2D3F55' } } };
  });
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 18; });
}

async function excelIsTakibi(donem) {
  // donem: 'bugun' | 'hafta' | 'ay' | 'tumumu'
  const snap = await db.collection('is_takibi').orderBy('tarih', 'desc').limit(500).get();
  const tumVeriler = snap.docs.map(d => d.data());

  const bugun     = new Date(); bugun.setHours(0,0,0,0);
  const haftaBasi = new Date(bugun); haftaBasi.setDate(bugun.getDate() - bugun.getDay() + 1);
  const ayBasi    = new Date(bugun.getFullYear(), bugun.getMonth(), 1);

  let veriler = tumVeriler;
  let donemAd = 'Tüm Kayıtlar';
  if (donem === 'bugun')  { veriler = tumVeriler.filter(r => r.tarih?.toDate() >= bugun);     donemAd = 'Bugün'; }
  if (donem === 'hafta')  { veriler = tumVeriler.filter(r => r.tarih?.toDate() >= haftaBasi); donemAd = 'Bu Hafta'; }
  if (donem === 'ay')     { veriler = tumVeriler.filter(r => r.tarih?.toDate() >= ayBasi);    donemAd = 'Bu Ay'; }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Santiye Botu';

  // Sayfa 1: Detay
  const ws1 = wb.addWorksheet('İş Takibi');
  const cols1 = [
    { header: 'Tarih',      width: 18 },
    { header: 'Şef',        width: 22 },
    { header: 'Ekip',       width: 24 },
    { header: 'Kişi Sayısı',width: 14 },
    { header: 'İmalat',     width: 28 },
    { header: 'Miktar',     width: 12 },
    { header: 'Birim',      width: 10 },
    { header: 'Mahal',      width: 18 },
    { header: 'İş Planı',   width: 22 },
    { header: 'Açıklama',   width: 30 },
  ];
  baslikSatiri(ws1, cols1);
  veriler.forEach(r => {
    const t = r.tarih?.toDate ? r.tarih.toDate().toLocaleDateString('tr-TR') : '?';
    ws1.addRow([t, r.kullanici||'', r.ekip||'', r.adam||0, r.imalat||'', r.miktar||'', r.birim||'', r.mahal||'', r.gorev_ad||'', r.aciklama||'']);
  });

  // Sayfa 2: Yevmiye özeti
  const ws2 = wb.addWorksheet('Yevmiye Özeti');
  const ekipMap = {};
  veriler.forEach(r => {
    if (!ekipMap[r.ekip]) ekipMap[r.ekip] = 0;
    ekipMap[r.ekip] += r.adam || 0;
  });
  baslikSatiri(ws2, [{ header: 'Ekip', width: 28 }, { header: 'Toplam Yevmiye', width: 18 }]);
  Object.entries(ekipMap).sort((a,b) => b[1]-a[1]).forEach(([e,y]) => ws2.addRow([e, y]));
  ws2.addRow([]);
  const toplamRow = ws2.addRow(['TOPLAM', veriler.reduce((t,r) => t+(r.adam||0), 0)]);
  toplamRow.eachCell(c => { c.font = { bold: true }; });

  const dosya = `/tmp/is_takibi_${donem}_${Date.now()}.xlsx`;
  await wb.xlsx.writeFile(dosya);
  return { dosya, donemAd, sayi: veriler.length };
}

async function excelMalzeme() {
  const snap = await db.collection('malzeme_takibi').orderBy('tarih', 'desc').limit(200).get();
  const veriler = snap.docs.map(d => d.data());

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Malzeme Takibi');
  baslikSatiri(ws, [
    { header: 'Tarih',   width: 18 },
    { header: 'Malzeme', width: 28 },
    { header: 'Miktar',  width: 12 },
    { header: 'Birim',   width: 10 },
    { header: 'Firma',   width: 22 },
    { header: 'Not',     width: 35 },
    { header: 'Giren',   width: 22 },
  ]);
  veriler.forEach(r => {
    const t = r.tarih?.toDate ? r.tarih.toDate().toLocaleDateString('tr-TR') : '?';
    ws.addRow([t, r.malzeme||'', r.miktar||'', r.birim||'', r.firma||'', r.not||'', r.kullanici||'']);
  });

  const dosya = `/tmp/malzeme_${Date.now()}.xlsx`;
  await wb.xlsx.writeFile(dosya);
  return dosya;
}

// Patron mesajında Excel isteği var mı?
function excelIstegi(text) {
  const t = text.toLowerCase();
  const excelKelime = t.includes('excel') || t.includes('tablo') || t.includes('liste') || t.includes('rapor');
  if (!excelKelime) return null;
  if (t.includes('malzeme')) return 'malzeme';
  if (t.includes('bugün') || t.includes('bugun')) return 'is_bugun';
  if (t.includes('hafta')) return 'is_hafta';
  if (t.includes('ay'))    return 'is_ay';
  if (t.includes('iş') || t.includes('is') || t.includes('yevmiye') || t.includes('çalışan') || t.includes('calisan')) return 'is_tumumu';
  return null;
}

// ─── DROPBOX ─────────────────────────────────────────────────────────────────
const DBX_APP_KEY    = process.env.DROPBOX_APP_KEY;
const DBX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const DBX_REFRESH    = process.env.DROPBOX_REFRESH_TOKEN;
const DBX_API  = 'https://api.dropboxapi.com/2';
const DBX_CONT = 'https://content.dropboxapi.com/2';

let dbxAccessToken = null;
let dbxTokenExpiry = 0;

async function dbxGetToken() {
  if (dbxAccessToken && Date.now() < dbxTokenExpiry - 60000) return dbxAccessToken;
  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${DBX_REFRESH}&client_id=${DBX_APP_KEY}&client_secret=${DBX_APP_SECRET}`
  });
  if (!resp.ok) throw new Error('Dropbox token yenilenemedi');
  const data = await resp.json();
  dbxAccessToken = data.access_token;
  dbxTokenExpiry = Date.now() + (data.expires_in * 1000);
  console.log('Dropbox token yenilendi.');
  return dbxAccessToken;
}

async function dbxListele(klasor = '') {
  const token = await dbxGetToken();
  const resp = await fetch(`${DBX_API}/files/list_folder`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: klasor, limit: 30 })
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error(`Dropbox ${resp.status}: ${e.slice(0,200)}`); }
  return resp.json();
}

async function dbxAra(kelime) {
  const token = await dbxGetToken();
  const resp = await fetch(`${DBX_API}/files/search_v2`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: kelime, options: { max_results: 10 } })
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error(`Dropbox arama ${resp.status}: ${e.slice(0,200)}`); }
  return resp.json();
}

function dbxApiArg(obj) {
  return JSON.stringify(obj)
    .replace(/[^\x20-\x7E]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

async function dbxIndir(dosyaYol, dosyaAd) {
  const token = await dbxGetToken();
  const resp = await fetch(`${DBX_CONT}/files/download`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': dbxApiArg({ path: dosyaYol })
    }
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error(`İndirme ${resp.status}: ${e.slice(0,200)}`); }
  const buffer = await resp.buffer();
  const guvenliAd = dosyaAd.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tmpYol = `/tmp/dbx_${Date.now()}_${guvenliAd}`;
  fs.writeFileSync(tmpYol, buffer);
  return tmpYol;
}

async function dbxUpload(localPath, dropboxPath) {
  const token = await dbxGetToken();
  const fileBuffer = fs.readFileSync(localPath);
  const resp = await fetch(`${DBX_CONT}/files/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': dbxApiArg({ path: dropboxPath, mode: 'add', autorename: true }),
      'Content-Type': 'application/octet-stream'
    },
    body: fileBuffer
  });
  if (!resp.ok) { const e = await resp.text(); throw new Error(`Dropbox upload ${resp.status}: ${e.slice(0,200)}`); }
  return resp.json();
}

// Telegram file_id → geçici indirme URL'i
async function telegramFotoUrl(fileId) {
  const resp = await fetch(`${API}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await resp.json();
  if (!data.ok) throw new Error('getFile başarısız');
  return `https://api.telegram.org/file/bot${TOKEN}/${data.result.file_path}`;
}

// Türkçe karakterleri ASCII'ye çevirir — karşılaştırma için
function trAscii(s) {
  return s.normalize('NFC').toLowerCase()
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i').replace(/[çÇ]/g, 'c')
    .replace(/I/g, 'i');
}

// Dropbox isteği tespiti: { tip: 'liste'|'ara'|'foto_klasor', kelime: string }
// KURAL: Yalnızca açık bir dosya alma/gönderme niyeti varsa tetiklenir.
// Belge/foto adının geçmesi yetmez — eylem kelimesi de gerekir.
function dropboxIstegi(text) {
  const t = trAscii(text);

  // 1. Açık Dropbox komutu veya liste isteği
  if (t.includes('dropbox'))                              return { tip: 'liste', kelime: '' };
  if (t === 'belgeler' || t === 'dosyalar')               return { tip: 'liste', kelime: '' };
  if ((t.includes('belge') || t.includes('dosya')) &&
      (t.includes('listele') || t.includes('ne var') ||
       t.includes('hepsi')   || t.includes('hepsini')))   return { tip: 'liste', kelime: '' };

  // 2. Dosya uzantısı varsa → net dosya isteği, doğrudan ara
  const uzantiMatch = text.match(/([^\s/\\]+\.(pdf|docx?|xlsx?|jpg|png|zip))/i);
  if (uzantiMatch) {
    const kelime = uzantiMatch[1]
      .replace(/\.(pdf|docx?|xlsx?|jpg|png|zip)$/i, '')
      .replace(/[_-]/g, ' ')
      .trim();
    return { tip: 'ara', kelime };
  }

  // 3. Eylem kelimeleri — bunlar olmadan hiçbir şey tetiklenmez
  const eylemler = ['indir', 'gonder', 'yolla', 'getir', 'goster', 'ilet', 'paylas',
    'lazim', 'ver ', 'verir', 'at ', 'atar', 'atin', 'atiyor', 'atabilir', 'atarmis'];
  const eylemVar = eylemler.some(e => t.includes(e));
  if (!eylemVar) return null; // Eylem yok → kesinlikle AI'ya git

  // 4. Eylem var + fotoğraf isteği
  if (t.includes('fotograf') || t.includes('foto') || t.includes('resim') || t.includes('goruntu')) {
    return { tip: 'foto_klasor', kelime: '' };
  }

  // 5. Eylem var + eylemden önceki kısmı arama terimi al
  for (const eylem of eylemler) {
    const idx = t.indexOf(eylem);
    if (idx > 0) {
      let kelime = text.substring(0, idx).trim()
        .replace(/\s*(dosyasın[ıi]|dosyas[ıi]n[ıi]|belgesini|pdf[''']?ini|sirkusunu|sirküsünü|sini|sını|ini|ını|nu|nü|yi|yı|'i|'ı)\s*$/i, '')
        .replace(/^(bana|benim|o|bu|şu)\s+/i, '')
        .trim();
      if (kelime.length > 1) return { tip: 'ara', kelime };
    }
  }

  // 6. Eylem var + bilinen belge türü → sabit arama
  const turler = [
    { a: 'sozlesme', g: 'sözleşme' },
    { a: 'fatura',   g: 'fatura'   },
    { a: 'hakedis',  g: 'hakedis'  },
    { a: 'cizim',    g: 'çizim'    },
    { a: 'sartname', g: 'şartname' },
    { a: 'sirk',     g: 'sirküler' },
    { a: 'imza',     g: 'imza'     },
    { a: 'vekalet',  g: 'vekalet'  },
    { a: 'ruhsat',   g: 'ruhsat'   },
    { a: 'sigorta',  g: 'sigorta'  },
    { a: 'teklif',   g: 'teklif'   },
  ];
  for (const tur of turler) {
    if (t.includes(tur.a)) return { tip: 'ara', kelime: tur.g };
  }

  return null;
}

// ─── HIZLI KAYIT PARSER ──────────────────────────────────────────────────────
// /h [ekip] [adam]kişi [imalat] [miktar][birim] [mahal]
function hizliParse(text, santiye = 'site1') {
  const t = text.trim();

  // Ekip bul (IS_GUCU listesinden)
  let ekip = null;
  for (const g of IS_GUCU) {
    if (trAscii(t).includes(trAscii(g))) { ekip = g; break; }
  }
  if (!ekip) return { hata: `Ekip tanınamadı. Geçerli ekipler:\n${IS_GUCU.map((g,i) => `${i+1}. ${g}`).join('\n')}` };

  // Adam sayısı: "8 kişi", "8kişi", "8 adam"
  const adamMatch = t.match(/(\d+)\s*ki[sş]i/i) || t.match(/(\d+)\s*adam/i);
  if (!adamMatch) return { hata: 'Kişi sayısı bulunamadı. Örnek: "8 kişi"' };
  const adam = parseInt(adamMatch[1]);

  // Miktar+birim: metin içinde herhangi bir yerde
  const miktarMatch = t.match(/([\d.]+)\s*(m2|m3|ton|kg|adet|mt|saat)/i);
  if (!miktarMatch) return { hata: `Miktar/birim bulunamadı. Geçerli birimler: ${BIRIM.join(', ')}` };
  const miktar = parseFloat(miktarMatch[1]);
  const birim  = BIRIM.find(b => b.toLowerCase() === miktarMatch[2].toLowerCase()) || miktarMatch[2].toLowerCase();

  // Mahal bul — önce tam metni dene, sonra son 3 kelimeyi dene
  const mahalList = getMahal(santiye);
  const normStr = s => trAscii(s).replace(/[^a-z0-9]/g, '');
  let mahal = mahalList.find(m => normStr(t).includes(normStr(m))) || null;
  if (!mahal) mahal = matchMahal(t.split(/\s+/).slice(-3).join(' '), santiye);
  if (!mahal) return { hata: `Mahal tanınamadı. Geçerli mahaller:\n${mahalList.map((m,i) => `${i+1}. ${m}`).join('\n')}` };

  // İmalat: ekip, adam+kişi, miktar+birim, mahal çıkarılınca kalan
  let imalat = t;
  // Ekibi çıkar (büyük/küçük harf duyarsız)
  imalat = imalat.replace(new RegExp(ekip.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'), '');
  // Mahal çıkar
  imalat = imalat.replace(new RegExp(mahal.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'), '');
  // Adam+kişi çıkar
  imalat = imalat.replace(/\d+\s*ki[sş]i/gi, '').replace(/\d+\s*adam/gi, '');
  // Miktar+birim çıkar
  imalat = imalat.replace(/[\d.]+\s*(m2|m3|ton|kg|adet|mt|saat)/gi, '');
  // Noktalama ve fazla boşluk temizle
  imalat = imalat.replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim();

  if (imalat.length < 2) return { hata: 'İmalat açıklaması bulunamadı. Ekip, kişi sayısı ve mahalle ek olarak ne yapıldığını yaz.' };

  return { ekip, adam, imalat, miktar, birim, mahal };
}

// ─── EŞLEŞTİRME ─────────────────────────────────────────────────────────────
function matchIsGucu(text) {
  const t = text.trim().toLowerCase();
  const n = parseInt(t);
  if (!isNaN(n) && n >= 1 && n <= IS_GUCU.length) return IS_GUCU[n - 1];
  return IS_GUCU.find(g => g.toLowerCase().includes(t)) || null;
}

// "100m2", "50 m3", "10 adet", "5.5ton" → { miktar, birim }
function parseMiktarBirim(text) {
  const t = text.trim().toLowerCase()
    .replace(',', '.')
    .replace('²', '2')
    .replace('³', '3');
  const match = t.match(/^([\d.]+)\s*([a-z0-9]+)$/);
  if (!match) return null;
  const miktar = parseFloat(match[1]);
  if (isNaN(miktar) || miktar <= 0) return null;
  const birim = BIRIM.find(b => b.toLowerCase() === match[2]);
  if (!birim) return null;
  return { miktar, birim };
}

// "26.05.2025" → doğrulayıp döndürür, hatalıysa null
function parseTarih(text) {
  const match = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, g, a, y] = match;
  const dt = new Date(`${y}-${a.padStart(2,'0')}-${g.padStart(2,'0')}`);
  if (isNaN(dt.getTime())) return null;
  return `${g.padStart(2,'0')}.${a.padStart(2,'0')}.${y}`;
}

// ─── SATIŞ MODÜLÜ SORGULAMA ───────────────────────────────────────────────────
async function satisAyTahsilat(chatId) {
  try {
    const snap = await db.collection('sozlesmeler').get();
    const now  = new Date();
    const ay   = now.getMonth();      // 0-11
    const yil  = now.getFullYear();
    let toplamBeklenen = 0, toplamGelen = 0;
    const odenmemisler = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      for (const [idx, o] of (d.odemeler || []).entries()) {
        const parts = o.tarih.split('.');
        if (parts.length < 3) continue;
        if (parseInt(parts[1]) - 1 === ay && parseInt(parts[2]) === yil) {
          toplamBeklenen += o.tutar;
          if (o.odendi) { toplamGelen += o.tutar; }
          else { odenmemisler.push({ alici: d.alici_adi, daire: `${d.blok}${d.daire_no}`, tutar: o.tutar, tarih: o.tarih, docId: doc.id, idx }); }
        }
      }
    }

    const ayAd = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    if (toplamBeklenen === 0) {
      await send(chatId, `${ayAd}\n\nBu ay vadeli odeme yok.\n\n/satis — Ana menu`);
      return;
    }
    await send(chatId,
      `BU AY TAHSILAT — ${ayAd}\n` +
      `Beklenen:  ${toplamBeklenen.toLocaleString('tr-TR')} TL\n` +
      `Toplandi:  ${toplamGelen.toLocaleString('tr-TR')} TL\n` +
      `Bekleyen:  ${(toplamBeklenen - toplamGelen).toLocaleString('tr-TR')} TL`
    );
    for (const d of odenmemisler) {
      await fetch(`${API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Bekliyor: ${d.alici} (Daire ${d.daire}) — ${d.tarih}\n${d.tutar.toLocaleString('tr-TR')} TL`,
          reply_markup: { inline_keyboard: [[ { text: 'Odeme Alindi', callback_data: `odeme_al_${d.docId}_${d.idx}` } ]] }
        })
      });
    }
  } catch(e) { await send(chatId, `Hata: ${e.message}`); }
}

async function satisGecikenOdemeler(chatId) {
  try {
    const snap = await db.collection('sozlesmeler').get();
    const bugun = new Date(); bugun.setHours(0,0,0,0);
    const gecikenler = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      for (const [idx, o] of (d.odemeler || []).entries()) {
        if (o.odendi) continue;
        const parts = o.tarih.split('.');
        if (parts.length < 3) continue;
        const oTarih = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (oTarih < bugun) {
          const gecenGun = Math.floor((bugun - oTarih) / 86400000);
          gecikenler.push({ alici: d.alici_adi, daire: `${d.blok}${d.daire_no}`, tutar: o.tutar, tarih: o.tarih, gecenGun, docId: doc.id, idx });
        }
      }
    }

    if (gecikenler.length === 0) {
      await send(chatId, `Geciken odeme yok.\n\n/satis — Ana menu`);
      return;
    }
    gecikenler.sort((a,b) => b.gecenGun - a.gecenGun);
    const toplam = gecikenler.reduce((t,g) => t + g.tutar, 0);
    await send(chatId,
      `GECIKEN ODEMELER\n` +
      `Toplam: ${toplam.toLocaleString('tr-TR')} TL`
    );
    for (const g of gecikenler) {
      await fetch(`${API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `${g.gecenGun} gun gecikti\n${g.alici} (Daire ${g.daire}) — ${g.tarih}\n${g.tutar.toLocaleString('tr-TR')} TL`,
          reply_markup: { inline_keyboard: [[ { text: 'Odeme Alindi', callback_data: `odeme_al_${g.docId}_${g.idx}` } ]] }
        })
      });
    }
  } catch(e) { await send(chatId, `Hata: ${e.message}`); }
}

async function satisTumSozlesmeler(chatId) {
  try {
    const snap = await db.collection('sozlesmeler').orderBy('tarih', 'desc').get();
    if (snap.empty) {
      await send(chatId, `Kayitli sozlesme yok.\n\n/satis ile yeni ekleyebilirsin.`);
      return;
    }
    const liste = snap.docs.map(doc => {
      const d = doc.data();
      const odenen   = (d.odemeler || []).filter(o => o.odendi).reduce((t,o) => t+o.tutar, 0);
      const kalan    = d.satis_bedeli - odenen;
      const tamamlanan = (d.odemeler || []).filter(o => o.odendi).length;
      return `Daire ${d.blok}${d.daire_no} ${d.kat}.Kat (${d.tip || ''})\n` +
             `Alici: ${d.alici_adi}\n` +
             `${d.satis_bedeli.toLocaleString('tr-TR')} TL | Kalan: ${kalan.toLocaleString('tr-TR')} TL\n` +
             `Odeme: ${tamamlanan}/${(d.odemeler||[]).length}`;
    }).join('\n\n');
    await send(chatId, `TUM SOZLESMELER\n━━━━━━━━━━━━━━━\n\n${liste}\n\n/satis — Ana menu`);
  } catch(e) { await send(chatId, `Hata: ${e.message}`); }
}

// ─── GÖREV SİSTEMİ ───────────────────────────────────────────────────────────

// İsimden kullanıcı bul (USERS + Firestore kisiler)
async function kisiBul(isim) {
  const t = trAscii(isim);
  // Önce USERS'da ara
  for (const [chatId, u] of Object.entries(USERS)) {
    if (trAscii(u.name).includes(t) || t.includes(trAscii(u.name))) {
      return { chatId, ...u };
    }
  }
  // Firestore kisiler koleksiyonunda ara
  const snap = await db.collection('kisiler').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (trAscii(d.name || '').includes(t) || t.includes(trAscii(d.name || ''))) {
      return { chatId: doc.id, ...d };
    }
  }
  return null;
}

async function gorevMesajGonder(chatId, gorevId, gorev) {
  let tekrar = '';
  if (gorev.gunlukSaat)           tekrar = `\n⏰ Her gün ${gorev.gunlukSaat}'de hatırlatılacak`;
  else if (gorev.aralikDakika > 0) tekrar = gorev.aralikDakika < 60
    ? `\n⏰ Her ${gorev.aralikDakika} dakikada bir hatırlatılacak`
    : `\n⏰ Her ${gorev.aralikDakika/60} saatte bir hatırlatılacak`;

  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text:
        `📋 GÖREV\n━━━━━━━━━━━━\n` +
        `${gorev.aciklama}\n\n` +
        `📌 Patron tarafından atandı${tekrar}`,
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Tamamladım', callback_data: `tamam_${gorevId}` }
        ]]
      }
    })
  });
}

async function gorevHatirlaticilar() {
  try {
    const simdi    = Date.now();
    const nowTR    = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const simdiTR  = `${String(nowTR.getHours()).padStart(2,'0')}:${String(nowTR.getMinutes()).padStart(2,'0')}`;
    const snap     = await db.collection('gorevler').where('durum', '==', 'bekliyor').get();

    for (const doc of snap.docs) {
      const g = doc.data();
      const sonHatirlatma = g.sonHatirlatma?.toMillis?.() || g.olusturma?.toMillis?.() || 0;
      let gonder = false;

      if (g.gunlukSaat) {
        // Her gün belirli saatte — saati karşılaştır (dakika hassasiyetinde)
        if (simdiTR === g.gunlukSaat && simdi - sonHatirlatma > 60000) {
          gonder = true;
        }
      } else if (g.aralikDakika > 0) {
        // Dakika/saat aralığı
        if (simdi - sonHatirlatma >= g.aralikDakika * 60000) {
          gonder = true;
        }
      }

      if (gonder) {
        await gorevMesajGonder(g.atananChatId, doc.id, g);
        await doc.ref.update({ sonHatirlatma: admin.firestore.Timestamp.now() });
        console.log(`Hatırlatma: ${doc.id} → ${g.atanan}`);
      }
    }
  } catch(e) {
    console.error('Hatırlatıcı hata:', e.message);
  }
}

// ─── TEK SEFERLİK HATIRLATMALAR — kaldırıldı (8 Nisan 2026 geçti) ──────────────
// async function renderHatirlatmaKontrol() { ... }

// ─── BİLDİRİM DUPLICATE KONTROLÜ (Firestore'a yaz) ──────────────────────────
// key: 'sabah_YYYY-MM-DD' veya 'aksam_YYYY-MM-DD'
async function bildirimGonderildiMi(key) {
  try {
    const doc = await db.collection('_bildirimler').doc(key).get();
    return doc.exists;
  } catch(e) {
    console.error(`bildirimGonderildiMi(${key}) hata:`, e.message);
    return false;
  }
}
async function bildirimIsaretle(key) {
  try {
    await db.collection('_bildirimler').doc(key).set({ ts: admin.firestore.Timestamp.now() });
  } catch(e) {
    console.error(`bildirimIsaretle(${key}) hata:`, e.message);
  }
}

// ─── HAFTALIK RAPOR (Pazartesi 09:00 TR) ───────────────────────────────────
// Patron + Müdür rolüne son 7 günün özeti otomatik gider.
// Idempotent: aynı hafta 1 kez gönderir (bildirimGonderildiMi/Isaretle ile).
async function haftalikRaporKontrol() {
  try {
    const nowTR = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    if (nowTR.getDay() !== 1 || nowTR.getHours() !== 9 || nowTR.getMinutes() > 4) return;

    const tarihBugun = nowTR.toISOString().slice(0, 10);
    const key = `haftalik_rapor_${tarihBugun}`;
    if (await bildirimGonderildiMi(key)) return;
    await bildirimIsaretle(key);

    const yediGunOnce = new Date(nowTR.getTime() - 7 * 24 * 60 * 60 * 1000);
    const baslangic = yediGunOnce.toISOString().slice(0, 10);
    const baslangicTs = admin.firestore.Timestamp.fromDate(yediGunOnce);

    const [isSnap, malSnap, gorevSnap] = await Promise.all([
      db.collection('is_takibi').where('tarih', '>=', baslangicTs).get(),
      db.collection('malzeme_takibi').where('tarih', '>=', baslangicTs).get(),
      db.collection('gorevler').get(),
    ]);

    const isData = isSnap.docs.map(d => d.data());
    const santiyeler = new Set(isData.map(i => i.santiye).filter(Boolean));
    const kisiler = new Set(isData.map(i => i.kisi || i.ad).filter(Boolean));

    const malData = malSnap.docs.map(d => d.data());

    const gorevData = gorevSnap.docs.map(d => d.data());
    const tamamlanan = gorevData.filter(g => g.durum === 'tamamlandi' || g.durum === 'yapildi').length;
    const bekleyen = gorevData.filter(g => g.durum === 'bekliyor' || g.durum === 'beklemede').length;

    const rapor =
      `📊 *Haftalık Rapor*\n` +
      `📅 ${baslangic} → ${tarihBugun}\n\n` +
      `🔨 *İş Kayıtları*\n` +
      `   • ${isData.length} kayıt\n` +
      `   • ${santiyeler.size} şantiye${santiyeler.size ? ': ' + [...santiyeler].join(', ') : ''}\n` +
      `   • ${kisiler.size} farklı kişi çalıştı\n\n` +
      `📦 *Malzeme*\n` +
      `   • ${malData.length} hareket\n\n` +
      `✅ *Görevler*\n` +
      `   • ${tamamlanan} tamamlandı\n` +
      `   • ${bekleyen} bekliyor\n\n` +
      `_Otomatik haftalık rapor — Santiye Botu_`;

    // Send to all patron and mudur users (auto-resolved from USERS dict)
    for (const [id, u] of Object.entries(USERS)) {
      if (u.role === 'patron' || u.role === 'mudur') {
        await send(id, rapor);
      }
    }
    console.log(`Haftalik rapor gonderildi: ${key}`);
  } catch (e) {
    console.error('haftalikRaporKontrol hata:', e.message);
  }
}

// ─── SABAH OTOMATİK ÖZETİ (08:00 TR) ────────────────────────────────────────
async function sabahOzetiKontrol() {
  try {
    const nowTR  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const saat   = nowTR.getHours();
    const dakika = nowTR.getMinutes();
    if (saat !== 8 || dakika > 4) return;

    const tarih = nowTR.toISOString().slice(0, 10);
    const key   = `sabah_${tarih}`;
    if (await bildirimGonderildiMi(key)) return;
    await bildirimIsaretle(key);

    for (const [chatId, u] of Object.entries(USERS)) {
      if (u.role === 'patron' || u.role === 'admin' || u.role === 'mudur') {
        await ozetGonder(chatId);
        console.log(`Sabah özeti gönderildi → ${u.name}`);
      }
    }
  } catch(e) {
    console.error('Sabah özeti hata:', e.message);
  }
}

// ─── ÖĞLEDEN SONRA HATIRLATMA (16:30 TR) ──────────────────────────────────────
async function onAltiOtuzHatirlatici() {
  try {
    const nowTR  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const saat   = nowTR.getHours();
    const dakika = nowTR.getMinutes();
    if (saat !== 16 || dakika < 30 || dakika > 34) return;

    const tarih = nowTR.toISOString().slice(0, 10);
    const key   = `hat1630_${tarih}`;
    if (await bildirimGonderildiMi(key)) return;
    await bildirimIsaretle(key);

    const bugunBaslangic = new Date(nowTR); bugunBaslangic.setHours(0,0,0,0);
    const snap = await db.collection('is_takibi')
      .where('tarih', '>=', admin.firestore.Timestamp.fromDate(bugunBaslangic))
      .get();
    const girenler = new Set(snap.docs.map(d => {
      const k = d.data().kullanici;
      return Object.entries(USERS).find(([,u]) => u.name === k)?.[0];
    }).filter(Boolean));

    for (const [chatId, u] of Object.entries(USERS)) {
      if (u.role === 'satinalma' || u.role === 'patron' || u.role === 'admin') continue;
      if (girenler.has(chatId)) continue;
      await send(chatId,
        `🔔 Günlük Rapor Hatırlatması\n\nMerhaba ${u.name}, bugün henüz iş kaydı girmediniz.\n\nMesai bitimine 1,5 saat kaldı. Lütfen kaydınızı girin.\n\n/start → Kayıt gir`
      );
      console.log(`16:30 hatırlatma → ${u.name}`);
    }
  } catch(e) {
    console.error('16:30 hatırlatma hata:', e.message);
  }
}

// ─── AKŞAM AĞIR UYARI (17:00 TR) ─────────────────────────────────────────────
async function onYediUyarisi() {
  try {
    const nowTR  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const saat   = nowTR.getHours();
    const dakika = nowTR.getMinutes();
    if (saat !== 17 || dakika < 0 || dakika > 4) return;

    const tarih = nowTR.toISOString().slice(0, 10);
    const key   = `hat1700_${tarih}`;
    if (await bildirimGonderildiMi(key)) return;
    await bildirimIsaretle(key);

    const bugunBaslangic = new Date(nowTR); bugunBaslangic.setHours(0,0,0,0);
    const snap = await db.collection('is_takibi')
      .where('tarih', '>=', admin.firestore.Timestamp.fromDate(bugunBaslangic))
      .get();
    const girenler = new Set(snap.docs.map(d => {
      const k = d.data().kullanici;
      return Object.entries(USERS).find(([,u]) => u.name === k)?.[0];
    }).filter(Boolean));

    const giremeyenler = [];
    for (const [chatId, u] of Object.entries(USERS)) {
      if (u.role === 'satinalma' || u.role === 'patron' || u.role === 'admin') continue;
      if (girenler.has(chatId)) continue;
      await send(chatId,
        `⚠️ UYARI — Günlük Rapor Girilmedi\n\n${u.name}, mesai saati doldu ama bugün iş kaydı girmediniz.\n\nBu durum patrona bildirilmektedir. Kayıt girilmesi zorunludur.\n\n/start → Hemen gir`
      );
      giremeyenler.push(u.name);
      console.log(`17:00 uyarı → ${u.name}`);
    }

    // Patron'a da özet bildirim
    for (const [chatId, u] of Object.entries(USERS)) {
      if (u.role !== 'patron') continue;
      const isimler = giremeyenler.length > 0 ? giremeyenler.join(', ') : null;
      if (isimler) {
        await send(chatId,
          `📋 17:00 Rapor Durumu\n\nBugün kayıt girmeyen personel:\n• ${giremeyenler.join('\n• ')}\n\nKendilerine uyarı gönderildi.`
        );
      }
    }
  } catch(e) {
    console.error('17:00 uyarı hata:', e.message);
  }
}

// ─── AKŞAM ŞEF KAYIT HATIRLATMASI (17:30 TR) ─────────────────────────────────
async function aksamHatirlatmaKontrol() {
  try {
    const nowTR  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const saat   = nowTR.getHours();
    const dakika = nowTR.getMinutes();
    if (saat !== 17 || dakika < 30 || dakika > 34) return;

    const tarih = nowTR.toISOString().slice(0, 10);
    const key   = `aksam_${tarih}`;
    if (await bildirimGonderildiMi(key)) return;
    await bildirimIsaretle(key);

    const bugunBaslangic = new Date(nowTR); bugunBaslangic.setHours(0,0,0,0);

    // Bugün kayıt giren şefleri bul
    const snap = await db.collection('is_takibi')
      .where('tarih', '>=', admin.firestore.Timestamp.fromDate(bugunBaslangic))
      .get();
    const bugunKayitGirenler = new Set(snap.docs.map(d => {
      const k = d.data().kullanici;
      // USERS içinde eşleştir
      const chatId = Object.entries(USERS).find(([,u]) => u.name === k)?.[0];
      return chatId;
    }).filter(Boolean));

    // Şeflere: bugün kayıt girmediyse hatırlat
    for (const [chatId, u] of Object.entries(USERS)) {
      if (u.role === 'satinalma' || u.role === 'patron') continue;
      if (bugunKayitGirenler.has(chatId)) continue; // kayıt girmişse atla
      await send(chatId,
        `🔔 Hatırlatma\n\nBugün henüz iş kaydı girmediniz.\n\nKayıt girmek için /start yazın.`
      );
      console.log(`Akşam hatırlatma → ${u.name}`);
    }
  } catch(e) {
    console.error('Akşam hatırlatma hata:', e.message);
  }
}

// ─── PATRON / ADMİN ÖZETİ ───────────────────────────────────────────────────
async function ozetGonder(chatId) {
  try {
  const user      = USERS[chatId];
  const santiye   = user?.santiye || 'hepsi';
  const nowTR     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const bugun     = new Date(nowTR); bugun.setHours(0, 0, 0, 0);
  const haftaBasi = new Date(bugun);
  haftaBasi.setDate(bugun.getDate() - bugun.getDay() + 1);

  const snap = await db.collection('is_takibi')
    .where('tarih', '>=', admin.firestore.Timestamp.fromDate(haftaBasi))
    .orderBy('tarih', 'desc')
    .get();

  // Santiye filtresi — sadece ilgili santiyenin kayıtları
  const tumVeriler   = snap.docs.map(d => d.data());
  const veriler      = santiye === 'hepsi' ? tumVeriler
    : tumVeriler.filter(r => r.santiye === santiye);
  const bugunVeriler = veriler.filter(r => r.tarih.toDate() >= bugun);

  const ekipMap = {};
  bugunVeriler.forEach(r => {
    if (!ekipMap[r.ekip]) ekipMap[r.ekip] = { adam: 0 };
    ekipMap[r.ekip].adam += r.adam || 0;
  });
  const ekipSatir = Object.entries(ekipMap)
    .map(([e, v]) => `  • ${e}: ${v.adam} kisi`)
    .join('\n') || '  Henuz kayit yok';

  // Plan özeti (her santiye için)
  let gecSatir = '';
  const ozetSantiyeler = santiye === 'hepsi' ? ['site1', 'site2', 'site3'] : [santiye];
  for (const s2 of ozetSantiyeler) {
    await planYukle(s2);
  }
  const ozetCache = santiye === 'hepsi'
    ? ['site1', 'site2', 'site3'].flatMap(s2 => planCacheMap[s2] || [])
    : (planCacheMap[santiye] || []);
  if (ozetCache.length > 0) {
    const bugunTs = new Date(); bugunTs.setHours(0, 0, 0, 0);
    const gecikmeli = ozetCache.filter(g => {
      const bit = g.bit?.toDate ? g.bit.toDate() : null;
      return bit && bit < bugunTs && (g.ilerleme || 0) < 100;
    });
    gecSatir = gecikmeli.length > 0
      ? `\n⚠️ Gecikmeli: ${gecikmeli.length} gorev\n` +
        gecikmeli.slice(0, 3).map(g => `  • ${g.ad}`).join('\n') +
        (gecikmeli.length > 3 ? `\n  ...ve ${gecikmeli.length - 3} daha` : '')
      : '\n✅ Gecikmeli gorev yok';
  }

  const santiyeAd = santiye === 'hepsi'  ? 'TUM SANTIYELER' :
                    santiye === 'site1' ? 'AKYAZI' :
                    santiye === 'site2' ? 'ARAKLI' : 'KOSK';

  await send(chatId,
    `📊 SANTIYE OZETI — ${santiyeAd}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📅 Bugun: ${bugunVeriler.length} kayit\n` +
    `${ekipSatir}\n\n` +
    `📆 Bu hafta: ${veriler.length} kayit\n` +
    `👷 Aktif ekip: ${new Set(veriler.map(r => r.ekip)).size}` +
    `${gecSatir}\n\n` +
    `🔗 https://your-firebase-project.web.app`
  );
  } catch(e) {
    console.error('ozetGonder hata:', e.message);
    try { await send(chatId, `Özet alınamadı: ${e.message}`); } catch {}
  }
}

// ─── KAYDET ──────────────────────────────────────────────────────────────────
async function kaydet(chatId, s, user) {
  try {
    const kayitTarihi = new Date(Date.now() + (s._tarihOffset || 0) * 86400000);
    const doc = {
      tarih:     admin.firestore.Timestamp.fromDate(kayitTarihi),
      ekip:      s.is_gucu,
      adam:      s.adam,
      imalat:    s.imalat,
      miktar:    s.miktar,
      birim:     s.birim,
      mahal:     s.mahal,
      aciklama:  s.aciklama || '',
      kullanici: user.name,
      santiye:   user.santiye || 'site1',
      gorev_id:  s.gorev_id || '',
      gorev_ad:  s.gorev_ad || '',
      foto_yol:  ''
    };
    const ref = await db.collection('is_takibi').add(doc);

    // Generative Memory — iş kaydını yüksek önemle hafızaya ekle
    try {
      const memDesc = `${user.name} iş kaydı: ${s.aciklama || ''} (${(user.santiye||'').toUpperCase()}, ${s.adam||0} kişi, ${s.yevmiye||0}₺)`;
      await memoryEkle(chatId, user.name, memDesc, 7);
    } catch(e) { console.error('memory iş kaydı hata:', e.message); }

    // Admin + patron + müdüre bildirim
    const gunEtiketi = s._tarihOffset === -1 ? ' 📅 DÜN' : '';
    const bildirimMetni =
      `📋 Yeni iş kaydı${gunEtiketi} — ${user.name} (${(user.santiye || 'site1').toUpperCase()})\n` +
      `👷 ${s.is_gucu} — ${s.adam} kişi\n` +
      `🏗 ${s.imalat} — ${s.miktar} ${s.birim}\n` +
      `📍 ${s.mahal}` +
      (s.aciklama ? `\n📝 ${s.aciklama}` : '');
    for (const [id, u] of Object.entries(USERS)) {
      if (id !== chatId && (u.role === 'admin' || u.role === 'patron' || u.role === 'mudur')) {
        await send(id, bildirimMetni);
      }
    }

    // Fotoğraf adımına geç
    sessions[chatId] = { adim: 'foto', docId: ref.id };

    await send(chatId,
      `✅ Kaydedildi!\n\n` +
      `👷 ${s.is_gucu} — ${s.adam} kisi\n` +
      `🏗 ${s.imalat} — ${s.miktar} ${s.birim}\n` +
      `📍 ${s.mahal}` +
      (s.aciklama ? `\n📝 ${s.aciklama}` : '') +
      (s.gorev_ad ? `\n📋 ${s.gorev_ad}` : '') +
      `\n\n📷 Fotograf eklemek ister misin?\nFotograf gonder veya "yok" yaz.`
    );
  } catch(e) {
    console.error('Kaydet hata:', e.message);
    delete sessions[chatId];
    await send(chatId, `❌ Kayıt sırasında hata oluştu: ${e.message}\n\nTekrar denemek için /start yaz.`);
  }
}

// ─── MESAJ HANDLER ────────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id.toString();
  const text   = (msg.text || '').trim();

  // ── Multi-tenant Faz C: /start invite_TOKEN → davetiye kabul akışı ──
  if (text.startsWith('/start ') && /invite[_-]/i.test(text)) {
    try {
      const consumed = await inviteHandler.handleInviteStart(msg);
      if (consumed) return;
    } catch (e) {
      console.error('inviteHandler hata:', e.message);
    }
  }

  // ── Multi-tenant Faz C: onboarding wizard başlat ──
  if (text === '/yenifirma' || text === '/yeni_firma' || text === '/kurulum') {
    try {
      await onboarding.startOnboarding(chatId, chatId);
    } catch (e) {
      console.error('onboarding.startOnboarding hata:', e.message);
      await send(chatId, `⚠️ Kurulum başlatılamadı: ${e.message}`);
    }
    return;
  }

  // ── Multi-tenant Faz C: pending onboarding varsa text/iptal yönlendir ──
  // (Sadece USERS'da olmayan kullanıcılar için — mevcut kullanıcıları etkilemez)
  if (!USERS[chatId]) {
    try {
      const consumed = await onboarding.handleOnboardingMessage(msg);
      if (consumed) return;
    } catch (e) {
      console.error('onboarding.handleOnboardingMessage hata:', e.message);
    }
  }

  // ── Multi-tenant Faz C: invite linki ile gelen yeni kullanıcı ──
  // /kayit komutu — sistemde olmayan kişiler kendini ekler
  if (text.startsWith('/kayit')) {
    const ad = text.replace('/kayit', '').trim();
    if (!ad) { await send(chatId, 'İsminizi yazın: /kayit Ad Soyad'); return; }
    await db.collection('kisiler').doc(chatId).set({ name: ad, chatId });
    await send(chatId, `✅ Kayıt oldu: ${ad}\nArtık size görev atanabilir.`);
    // Adminlere bildir
    for (const [id, u] of Object.entries(USERS)) {
      if (u.role === 'admin' || u.role === 'patron' || u.role === 'mudur') {
        await send(id, `🆕 Yeni kayıt: ${ad} (Chat ID: ${chatId})`);
      }
    }
    return;
  }

  // /geribildirim komutu — her kullanıcı serbest yorum/şikayet gönderebilir
  if (text.startsWith('/geribildirim')) {
    const mesaj = text.replace('/geribildirim', '').trim();
    if (!mesaj) { await send(chatId, 'Geri bildiriminizi yazın: /geribildirim mesajınız'); return; }
    const isim = USERS[chatId]?.name || 'Bilinmeyen';
    await db.collection('geri_bildirimler').add({ chatId, isim, mesaj, tarih: new Date() });
    await send(chatId, '✅ Geri bildiriminiz kaydedildi. Teşekkürler!');
    // Notify admin users
    for (const [id, u] of Object.entries(USERS)) {
      if (u.role === 'admin') { await send(id, `📬 Yeni geri bildirim: ${isim} — ${mesaj}`); }
    }
    return;
  }

  // Görev tamamlama — Firestore'dan kayıtlı kişiler de kullanabilir
  if (text === '/gorevlerim' && !USERS[chatId]) {
    const snap = await db.collection('gorevler')
      .where('atananChatId', '==', chatId)
      .where('durum', '==', 'bekliyor').get();
    if (snap.empty) { await send(chatId, 'Bekleyen göreviniz yok.'); return; }
    const liste = snap.docs.map((d,i) => `${i+1}. ${d.data().aciklama}`).join('\n');
    await send(chatId, `📋 Görevleriniz:\n\n${liste}`);
    return;
  }

  if (!USERS[chatId]) {
    // Beklenen şef mi? (BEKLEYEN_SEFLER listesinden eşleşme ara)
    const tgUsername = msg.from?.username || '';
    const tgAd       = `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim();
    const eslesen = BEKLEYEN_SEFLER.find(s => {
      const parcalar = trAscii(s.name).split(' ');
      const ilk = parcalar[0];                        // e.g. "mehmet"
      const son = parcalar[parcalar.length - 1];      // e.g. "yilmaz"
      const tgNorm = trAscii(tgAd);
      // Ad VE soyad birlikte eşleşmeli — tek isim yeterli değil
      return (tgNorm.includes(ilk) && tgNorm.includes(son)) ||
             (tgUsername && trAscii(tgUsername).includes(ilk) && trAscii(tgUsername).includes(son));
    });
    if (eslesen) {
      USERS[chatId] = { name: eslesen.name, role: eslesen.role, santiye: eslesen.santiye };
      // Firestore'a kalıcı kaydet
      await db.collection('kisiler').doc(chatId).set({
        name: eslesen.name, chatId, role: eslesen.role, santiye: eslesen.santiye
      });
      // Admin + patron bildir
      for (const [id, u] of Object.entries(USERS)) {
        if (u.role === 'admin' || u.role === 'patron' || u.role === 'mudur') {
          await send(id, `✅ ${eslesen.name} sisteme bağlandı!\nChat ID: ${chatId}\nRol: ${eslesen.role} / ${eslesen.santiye}`);
        }
      }
      await send(chatId, `Merhaba ${eslesen.name}! Sisteme hoş geldiniz.\n\nŞef olarak kayıt oldunuz. Başlamak için /start yazın.`);
      return;
    }

    // Firestore'da kayıtlı mı?
    const kisiDoc = await db.collection('kisiler').doc(chatId).get();
    if (!kisiDoc.exists) {
      // Admin'e bildir — bilinmeyen kişi yazdı
      for (const [id, u] of Object.entries(USERS)) {
        if (u.role === 'admin') {
          await send(id, `⚠️ Bilinmeyen kişi bota yazdı:\nChat ID: ${chatId}\nTelegram Adı: ${tgAd || tgUsername || 'bilinmiyor'}\n\nEklemek için kodu güncelle.`);
        }
      }
      await send(chatId, `Sisteme kayıtlı değilsiniz.\nŞantiye şefinizle iletişime geçin.`);
      return;
    }
    // Kayıtlı kişi — sadece görev bildirimleri alabilir
    return;
  }

  const user = USERS[chatId];
  const s    = sessionAl(chatId);

  // Restart sonrası oturum kaybı bildirimi (5 dk içinde, bir kez)
  if (!s.adim && !RESTART_NOTIFIED.has(chatId) && (Date.now() - BOT_START_TIME < RESTART_GRACE_MS)) {
    RESTART_NOTIFIED.add(chatId);
    // Sadece /start veya komut değilse bildir (komutlar zaten kendi akışını başlatır)
    if (text && !text.startsWith('/')) {
      await send(chatId, '⚠️ Sistem yeniden başlatıldı, oturumunuz sıfırlandı. Lütfen /start ile tekrar başlayın.');
      return;
    }
  }

  // ── FOTOĞRAF mesajı (şef/admin, foto adımında) ──
  if (msg.photo && user.role !== 'patron' && s.adim === 'foto') {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const groupId = msg.media_group_id;

    // Media group: birden fazla fotoğraf aynı anda gönderildi
    if (groupId) {
      if (!mediaGroupBuffer[groupId]) {
        mediaGroupBuffer[groupId] = { chatId, docId: s.docId, userName: user.name, fileIds: [] };
      }
      mediaGroupBuffer[groupId].fileIds.push(fileId);

      // Önceki timer'ı iptal et, 1.5s sonra işle (son fotoğraf geldikten sonra)
      clearTimeout(mediaGroupBuffer[groupId].timer);
      mediaGroupBuffer[groupId].timer = setTimeout(async () => {
        const buf = mediaGroupBuffer[groupId];
        delete mediaGroupBuffer[groupId];
        delete sessions[chatId];
        await send(chatId, `⏳ ${buf.fileIds.length} fotograf yukleniyor...`);
        try {
          const tarih = new Date().toISOString().slice(0, 10);
          const fotYollar = [];
          for (let i = 0; i < buf.fileIds.length; i++) {
            // 26 Nisan 2026 fix: try/finally ile tmp dosya orphan riski çözüldü
            let tmpYol;
            try {
              const url    = await telegramFotoUrl(buf.fileIds[i]);
              const resp   = await fetch(url);
              const buffer = await resp.buffer();
              const ts     = Date.now() + i;
              tmpYol = `/tmp/foto_${ts}.jpg`;
              fs.writeFileSync(tmpYol, buffer);
              const dbxYol = `/Santiye Fotolari/${tarih}/${buf.userName}_${ts}.jpg`;
              const meta   = await dbxUpload(tmpYol, dbxYol);
              fotYollar.push(meta.path_display);
            } finally {
              if (tmpYol) { try { fs.unlinkSync(tmpYol); } catch(_) {} }
            }
          }
          await db.collection('is_takibi').doc(buf.docId).update({ foto_yollar: fotYollar });
          await send(chatId, `✅ ${fotYollar.length} fotograf kaydedildi!\n📁 ${fotYollar.join('\n')}\n\nYeni giris icin /start yaz.`);
        } catch(e) {
          await send(chatId, `Fotograf yuklenemedi: ${e.message}\n\nYeni giris icin /start yaz.`);
        }
      }, 1500);
      return;
    }

    // Tek fotoğraf (media group yok)
    await send(chatId, '⏳ Fotograf yukleniyor...');
    // 26 Nisan 2026 fix: try/finally ile tmp dosya orphan riski çözüldü
    let tmpYol;
    try {
      const url    = await telegramFotoUrl(fileId);
      const resp   = await fetch(url);
      const buffer = await resp.buffer();
      const ts     = Date.now();
      tmpYol = `/tmp/foto_${ts}.jpg`;
      fs.writeFileSync(tmpYol, buffer);

      const tarih   = new Date().toISOString().slice(0, 10);
      const dbxYol  = `/Santiye Fotolari/${tarih}/${user.name}_${ts}.jpg`;
      const meta    = await dbxUpload(tmpYol, dbxYol);

      await db.collection('is_takibi').doc(s.docId).update({ foto_yollar: [meta.path_display] });
      delete sessions[chatId];
      await send(chatId, `✅ Fotograf kaydedildi!\n📁 ${meta.path_display}\n\nYeni giris icin /start yaz.`);
    } catch(e) {
      delete sessions[chatId];
      await send(chatId, `Fotograf yuklenemedi: ${e.message}\n\nYeni giris icin /start yaz.`);
    } finally {
      if (tmpYol) { try { fs.unlinkSync(tmpYol); } catch(_) {} }
    }
    return;
  }

  // ── /yardim — tüm roller ──
  if (text === '/yardim' || text === '/help') {
    if (user.role === 'patron') {
      await send(chatId,
        `📖 KOMUTLAR — PATRON\n━━━━━━━━━━━━━━━━━━\n\n` +
        `💬 Serbest soru\nŞantiye hakkında her şeyi sorabilirsin.\nÖrnek: "Bugün kim çalıştı?", "Hangi işler gecikti?"\n\n` +
        `/gorev — Birine görev ata\n` +
        `/gorevlerim — Aktif görevleri gör / iptal et\n` +
        `/ozet — Şantiye özeti\n` +
        `/stok — Tüm şantiyeler + ana depo stok raporu\n` +
        `/satis — Satış sözleşmeleri ve tahsilat\n` +
        `/dropbox — Şirket belgelerine eriş\n` +
        `/gecmistemizle — AI konuşma geçmişini sıfırla\n\n` +
        `📊 Excel rapor için:\n"İş takibi excel", "Bu hafta rapor", "Malzeme tablosu" yaz.`
      );
    } else if (user.role === 'mudur') {
      await send(chatId,
        `📖 KOMUTLAR — MÜDÜR\n━━━━━━━━━━━━━━━━━━\n\n` +
        `/start — İş / malzeme / not girişi menüsü\n` +
        `/stok — Tüm şantiyeler + ana depo stok raporu\n\n` +
        `💬 Serbest soru\nTüm şantiyeleri sorabilirsin.\nÖrnek: "Bugün kim çalıştı?", "Araklı'da ne yapıldı?"\n\n` +
        `/gorev — Birine görev ata\n` +
        `/gorevlerim — Attığın görevleri gör / iptal et\n` +
        `/ozet — Şantiye özeti\n` +
        `/gecmistemizle — AI konuşma geçmişini sıfırla\n\n` +
        `📊 Excel rapor için:\n"İş takibi excel", "Bu hafta rapor", "Malzeme tablosu" yaz.`
      );
    } else {
      await send(chatId,
        `📖 KOMUTLAR — ŞEF / ADMİN\n━━━━━━━━━━━━━━━━━━\n\n` +
        `/start — Ana menüyü aç\n` +
        `/ozet — Şantiye özeti (admin)\n\n` +
        `📋 ANA MENÜ SEÇENEKLERİ:\n` +
        `1 → İş girişi yap\n` +
        `2 → Malzeme girişi yap\n` +
        `3 → Günlük not ekle\n\n` +
        `⚡ HIZLI KAYIT:\n` +
        `/h [ekip] [kişi]kişi [imalat] [miktar][birim] [mahal]\n` +
        `Örnek:\n/h Demir Ekibi 8kişi kolon demiri 2.1ton 1. Kat\n\n` +
        `/gorevlerim — Sana atanan görevleri gör`
      );
    }
    return;
  }

  // ── MÜDÜR /start → şef menüsü ──
  if (user.role === 'mudur' && (text === '/start' || text === '/baslat')) {
    await planYukle(user.santiye);
    delete sessions[chatId];
    sessions[chatId] = { adim: 'ana_menu' };
    await send(chatId,
      `Merhaba ${user.name}! Ne yapmak istiyorsun?\n\n` +
      `1. Is girisi yap\n` +
      `2. Malzeme girisi (santiyeye geldi)\n` +
      `3. Stok kullandim (nerede kullanildi)\n` +
      `4. Stok durumu\n` +
      `5. Gunluk not ekle\n` +
      `6. Depodan malzeme al\n\nNumara yaz.\n\n` +
      `💬 Santiye sormak icin serbest metin yaz.\n/yardim — tum komutlar`
    );
    return;
  }

  // Müdür aktif form session'ındaysa şef akışına düş (patron bloğunu atla)
  const SEF_FORM_ADIMLARI = new Set([
    'ana_menu','gun_sec','is_gucu','adam','imalat','miktar_birim','mahal','aciklama','gorev','foto',
    'mal_ne','mal_miktar','mal_firma','mal_not','not_yaz',
    'depo_sef_mal','depo_sef_miktar','depo_sef_not',
    'stok_kul_mal','stok_kul_miktar','stok_kul_nerede'
  ]);
  const mudurFormda = user.role === 'mudur' && SEF_FORM_ADIMLARI.has(s.adim);

  // ── PATRON / MÜDÜR: tüm mesajlar AI'ya gider ──
  if (!mudurFormda && (user.role === 'patron' || user.role === 'mudur')) {
    if (text === '/start' || text === '/baslat') {
      await send(chatId,
        `Merhaba Patron! Ben şantiye asistanıyım.\n\nTüm şantiyeler hakkında her şeyi sorabilirsin:\n` +
        `• "Bu hafta kim çalıştı?"\n• "Araklı'da bugün ne yapıldı?"\n• "Köşk durumu ne?"\n• "Havalimanında bugün ne yapıldı?"\n\n` +
        `Komutlar için /yardim yaz.\n\nSor bakalım:`
      );
      return;
    }
    if (text === '/gecmistemizle') {
      await db.collection('ai_gecmis').doc(chatId).delete();
      await send(chatId, 'Konuşma geçmişi temizlendi. Yeniden başlayabiliriz.');
      return;
    }
    if (text === '/stok') {
      await send(chatId, '⏳ Stok raporu hazırlanıyor...');
      const rapor = await tumStokRaporu();
      await send(chatId, `TÜM ŞANTİYELER STOK RAPORU\n━━━━━━━━━━━━━━━━\n\n${rapor}`);
      return;
    }

    // ── SATIŞ MODÜLÜ (sadece patron) ──
    if (text === '/satis' && user.role === 'mudur') {
      await send(chatId, 'Satış modülü patron yetkisi gerektirir.');
      return;
    }
    if (text === '/satis') {
      delete sessions[chatId];
      sessions[chatId] = { adim: 'satis_menu' };
      await send(chatId,
        `SATIS MODULU\n\n` +
        `1. Yeni sozlesme gir\n` +
        `2. Bu ay tahsilat\n` +
        `3. Geciken odemeler\n` +
        `4. Tum sozlesmeler\n\n` +
        `Numara yaz.`
      );
      return;
    }
    if (s.adim === 'satis_menu') {
      if (text === '1') { sessions[chatId] = { adim: 'satis_daire' }; await send(chatId, `Daire bilgisi:\nBlok-Kat-No yaz.\nOrnek: A-2-10`); }
      else if (text === '2') { delete sessions[chatId]; await satisAyTahsilat(chatId); }
      else if (text === '3') { delete sessions[chatId]; await satisGecikenOdemeler(chatId); }
      else if (text === '4') { delete sessions[chatId]; await satisTumSozlesmeler(chatId); }
      else await send(chatId, '1-4 arasi numara yaz.\n/satis ile tekrar ac.');
      return;
    }
    if (s.adim === 'satis_daire') {
      const parts = text.trim().replace(/[\s\/]/g, '-').split('-');
      if (parts.length < 3) { await send(chatId, 'Format: Blok-Kat-No\nOrnek: A-2-10'); return; }
      const blok = parts[0].toUpperCase();
      const kat  = parseInt(parts[1]);
      const no   = parseInt(parts[2]);
      if (isNaN(kat) || isNaN(no)) { await send(chatId, 'Kat ve no rakam olmali. Ornek: A-2-10'); return; }
      sessions[chatId] = { adim: 'satis_tip', satis_blok: blok, satis_kat: kat, satis_daire_no: no };
      await send(chatId, `${blok} Blok ${kat}.Kat No:${no} ✓\n\nDaire tipi? (Ornek: 2+1  veya  3+1)`);
      return;
    }
    if (s.adim === 'satis_tip') {
      sessions[chatId] = { ...s, adim: 'satis_alici', satis_tip: text.trim().toUpperCase() };
      await send(chatId, `${text.trim()} ✓\n\nAlici adi soyadi?`);
      return;
    }
    if (s.adim === 'satis_alici') {
      if (text.length < 3) { await send(chatId, 'Tam isim yaz.'); return; }
      sessions[chatId] = { ...s, adim: 'satis_tc', satis_alici: text };
      await send(chatId, `${text} ✓\n\nTC kimlik no? (Yoksa "yok" yaz)`);
      return;
    }
    if (s.adim === 'satis_tc') {
      sessions[chatId] = { ...s, adim: 'satis_tel', satis_tc: text.toLowerCase() === 'yok' ? '' : text.trim() };
      await send(chatId, `✓\n\nTelefon? (Yoksa "yok" yaz)`);
      return;
    }
    if (s.adim === 'satis_tel') {
      sessions[chatId] = { ...s, adim: 'satis_fiyat', satis_tel: text.toLowerCase() === 'yok' ? '' : text.trim() };
      await send(chatId, `✓\n\nSatis bedeli? (Sadece rakam, ornek: 3000000)`);
      return;
    }
    if (s.adim === 'satis_fiyat') {
      const fiyat = parseInt(text.trim().replace(/[.,\s]/g, ''));
      if (isNaN(fiyat) || fiyat < 1000) { await send(chatId, 'Gecersiz tutar. Sadece rakam yaz. Ornek: 3000000'); return; }
      sessions[chatId] = { ...s, adim: 'satis_soz_tarih', satis_fiyat: fiyat };
      await send(chatId, `${fiyat.toLocaleString('tr-TR')} TL ✓\n\nSozlesme tarihi? (Ornek: 26.05.2025)`);
      return;
    }
    if (s.adim === 'satis_soz_tarih') {
      const tarih = parseTarih(text);
      if (!tarih) { await send(chatId, 'Gecersiz tarih. Ornek: 26.05.2025'); return; }
      sessions[chatId] = { ...s, adim: 'satis_teslim_tarih', satis_soz_tarih: tarih };
      await send(chatId, `${tarih} ✓\n\nTahmini teslim tarihi? (Ornek: 01.05.2027)`);
      return;
    }
    if (s.adim === 'satis_teslim_tarih') {
      const tarih = parseTarih(text);
      if (!tarih) { await send(chatId, 'Gecersiz tarih. Ornek: 01.05.2027'); return; }
      sessions[chatId] = { ...s, adim: 'satis_odeme_kac', satis_teslim_tarih: tarih };
      await send(chatId, `${tarih} ✓\n\nKac odeme taksiti var?`);
      return;
    }
    if (s.adim === 'satis_odeme_kac') {
      const kac = parseInt(text);
      if (isNaN(kac) || kac < 1 || kac > 60) { await send(chatId, '1-60 arasi sayi gir.'); return; }
      sessions[chatId] = { ...s, adim: 'satis_odeme_0', satis_odeme_kac: kac, satis_odemeler: [] };
      await send(chatId, `${kac} taksit ✓\n\n1. odeme:\nTarih ve tutar yaz\nOrnek: 26.05.2025 - 500000`);
      return;
    }
    if (s.adim && s.adim.startsWith('satis_odeme_')) {
      const idx = parseInt(s.adim.replace('satis_odeme_', ''));
      const match = text.trim().match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–]?\s*(\d[\d.,]*)/);
      if (!match) { await send(chatId, 'Format hatali.\nOrnek: 26.05.2025 - 500000'); return; }
      const tarih = parseTarih(match[1]);
      if (!tarih) { await send(chatId, 'Gecersiz tarih. Ornek: 26.05.2025'); return; }
      const tutar = parseInt(match[2].replace(/[.,\s]/g,''));
      if (isNaN(tutar) || tutar < 1) { await send(chatId, 'Gecersiz tutar.'); return; }
      const yeniOdemeler = [...(s.satis_odemeler || []), { tarih, tutar, odendi: false }];
      const sonrakiIdx   = idx + 1;
      if (sonrakiIdx < s.satis_odeme_kac) {
        sessions[chatId] = { ...s, satis_odemeler: yeniOdemeler, adim: `satis_odeme_${sonrakiIdx}` };
        await send(chatId, `✓\n\n${sonrakiIdx + 1}. odeme:\nTarih ve tutar yaz\nOrnek: 15.06.2025 - 500000`);
        return;
      }
      // Tüm ödemeler girildi — Firestore'a yaz
      const sozDoc = {
        blok:            s.satis_blok,
        kat:             s.satis_kat,
        daire_no:        s.satis_daire_no,
        tip:             s.satis_tip,
        alici_adi:       s.satis_alici,
        alici_tc:        s.satis_tc  || '',
        alici_tel:       s.satis_tel || '',
        satis_bedeli:    s.satis_fiyat,
        sozlesme_tarihi: s.satis_soz_tarih,
        teslim_tarihi:   s.satis_teslim_tarih,
        odemeler:        yeniOdemeler,
        santiye:         user.santiye === 'hepsi' ? 'site1' : user.santiye,
        olusturan:       user.name,
        tarih:           admin.firestore.Timestamp.fromDate(new Date())
      };
      await db.collection('sozlesmeler').add(sozDoc);
      delete sessions[chatId];
      const odemeOzet = yeniOdemeler.map((o,i) => `  ${i+1}. ${o.tarih} — ${o.tutar.toLocaleString('tr-TR')} TL`).join('\n');
      await send(chatId,
        `Sozlesme kaydedildi!\n\n` +
        `${s.satis_blok} Blok ${s.satis_kat}.Kat No:${s.satis_daire_no} (${s.satis_tip})\n` +
        `Alici: ${s.satis_alici}\n` +
        `${s.satis_fiyat.toLocaleString('tr-TR')} TL\n` +
        `Sozlesme: ${s.satis_soz_tarih}\n` +
        `Teslim: ${s.satis_teslim_tarih}\n\n` +
        `ODEME PLANI:\n${odemeOzet}\n\n` +
        `/satis — Ana menu`
      );
      return;
    }

    // ── GÖREV ATAMA AKIŞI ──
    if (text === '/gorev') {
      sessions[chatId] = { adim: 'gorev_kime' };
      const kisilerSnap = await db.collection('kisiler').get();
      // USERS'dan patron/mudur hariç tut
      const mevcutIsimler = new Set(
        Object.values(USERS)
          .filter(u => u.role !== 'patron')
          .map(u => u.name)
      );
      const mevcut = [...mevcutIsimler].map(n => `• ${n}`).join('\n');
      // kisiler koleksiyonundan sadece USERS'da olmayan, patron/admin olmayan kişiler
      const ekstra = kisilerSnap.docs
        .map(d => d.data())
        .filter(k => !mevcutIsimler.has(k.name) && k.role !== 'patron' && k.role !== 'admin')
        .map(k => `• ${k.name}`)
        .join('\n');
      await send(chatId,
        `📋 Kime görev atıyorsun?\n\n${mevcut}${ekstra ? '\n' + ekstra : ''}\n\nİsim yaz:`
      );
      return;
    }
    if (s.adim === 'gorev_kime') {
      const kisi = await kisiBul(text);
      if (!kisi) {
        await send(chatId, `"${text}" sistemde bulunamadı.\n\nKişiyi eklemek için /kayit komutunu o kişiye gönder.\nYa da farklı bir isim dene.`);
        return;
      }
      sessions[chatId] = { adim: 'gorev_ne', _kisi: kisi };
      await send(chatId, `${kisi.name} seçildi ✓\n\nGörev ne? (Açık yaz, tüm detaylarıyla)`);
      return;
    }
    if (s.adim === 'gorev_ne') {
      sessions[chatId] = { ...s, adim: 'gorev_aralik', _aciklama: text };
      await send(chatId,
        `✓\n\nNe sıklıkla hatırlatayım?\n\n` +
        `• "30dk" veya "45dk" → dakika aralığı\n` +
        `• "1" veya "2saat" → saat aralığı\n` +
        `• "08:30" → her gün o saatte\n` +
        `• "0" → sadece bir kez gönder`
      );
      return;
    }
    if (s.adim === 'gorev_aralik') {
      // Parse: 30dk / 45dk / 1saat / 2 / 08:30 / 0
      let aralikDakika = 0;
      let gunlukSaat   = null; // "08:30" formatı

      const t = text.trim().toLowerCase().replace(/\s+/g,'');
      const saatMatch = text.match(/^(\d{1,2}):(\d{2})$/);
      const dakikaMatch = t.match(/^(\d+)dk$/);
      const saatSayi   = t.match(/^(\d+)(saat)?$/);

      if (saatMatch) {
        // "08:30" → her gün o saatte
        const saat = saatMatch[1].padStart(2,'0');
        const dk   = saatMatch[2].padStart(2,'0');
        gunlukSaat = `${saat}:${dk}`;
      } else if (dakikaMatch) {
        aralikDakika = parseInt(dakikaMatch[1]);
      } else if (saatSayi) {
        aralikDakika = parseInt(saatSayi[1]) * 60;
      } else {
        await send(chatId, 'Anlamadım. Örnek: "30dk", "2saat", "08:30" veya "0"');
        return;
      }

      const kisi     = s._kisi;
      const aciklama = s._aciklama;
      delete sessions[chatId];

      const gorevDoc = {
        aciklama,
        atanan:        kisi.name,
        atananChatId:  kisi.chatId,
        patronChatId:  chatId,
        aralikDakika,
        gunlukSaat,
        durum:         'bekliyor',
        olusturma:     admin.firestore.Timestamp.now(),
        sonHatirlatma: admin.firestore.Timestamp.now()
      };
      const ref = await db.collection('gorevler').add(gorevDoc);
      await gorevMesajGonder(kisi.chatId, ref.id, gorevDoc);

      let hatirlatmaAciklama;
      if (gunlukSaat)          hatirlatmaAciklama = `Her gün saat ${gunlukSaat}'de hatırlatılacak`;
      else if (aralikDakika > 0) hatirlatmaAciklama = aralikDakika < 60
        ? `Her ${aralikDakika} dakikada bir hatırlatılacak`
        : `Her ${aralikDakika/60} saatte bir hatırlatılacak`;
      else hatirlatmaAciklama = 'Tek seferlik gönderildi';

      await send(chatId,
        `✅ Görev atandı!\n\n👤 ${kisi.name}\n📋 ${aciklama}\n⏰ ${hatirlatmaAciklama}`
      );
      return;
    }
    // /gorevlerim — patronun atadığı aktif görevler (inline iptal butonu ile)
    if (text === '/gorevlerim') {
      const snap = await db.collection('gorevler')
        .where('patronChatId', '==', chatId)
        .where('durum', '==', 'bekliyor').get();
      if (snap.empty) { await send(chatId, 'Bekleyen görev yok.'); return; }
      for (const doc of snap.docs) {
        const g = doc.data();
        const aciklama = g.aciklama.length > 80 ? g.aciklama.slice(0, 80) + '…' : g.aciklama;
        let tekrar = '';
        if (g.gunlukSaat)            tekrar = `⏰ Her gün ${g.gunlukSaat}`;
        else if (g.aralikDakika > 0) tekrar = g.aralikDakika < 60
          ? `⏰ Her ${g.aralikDakika} dk`
          : `⏰ Her ${g.aralikDakika / 60} saat`;
        else                          tekrar = '⏰ Tek seferlik';
        await fetch(`${API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `👤 ${g.atanan}\n📋 ${aciklama}\n${tekrar}`,
            reply_markup: {
              inline_keyboard: [[
                { text: '❌ İptal Et', callback_data: `iptal_${doc.id}` }
              ]]
            }
          })
        });
      }
      return;
    }

    // /dropbox [kelime] — direkt Dropbox komutu (sadece patron)
    if (text.startsWith('/dropbox')) {
      if (user.role !== 'patron' && user.role !== 'mudur' && user.role !== 'admin') { await send(chatId, 'Belge erişimi yetkisi gerektirir.'); return; }
      if (!DBX_REFRESH) { await send(chatId, 'Dropbox bağlantısı ayarlanmadı.'); return; }
      const kelime = text.replace('/dropbox', '').trim().replace(/\s+/g, ' ');
      if (!kelime) {
        await send(chatId, '⏳ Dropbox yükleniyor...');
        try {
          const data = await dbxListele('');
          const entries = data.entries || [];
          if (!entries.length) { await send(chatId, 'Dropbox boş.'); return; }
          const dosyalar = entries.filter(e => e['.tag'] === 'file');
          const klasorler = entries.filter(e => e['.tag'] === 'folder').map(e => `📁 ${e.name}`);
          sessions[chatId] = { adim: 'dbx_dosya', _dbxDosyalar: dosyalar };
          let mesaj = '📂 DROPBOX\n';
          if (klasorler.length) mesaj += '\nKlasörler:\n' + klasorler.join('\n');
          if (dosyalar.length) mesaj += '\n\nDosyalar:\n' + dosyalar.map((f,i) => `${i+1}. 📄 ${f.name}`).join('\n') + '\n\nNumara yaz → dosya gelir.';
          await send(chatId, mesaj);
        } catch(e) { await send(chatId, `Hata: ${e.message}`); }
        return;
      }
      await send(chatId, `🔍 "${kelime}" aranıyor...`);
      try {
        const data = await dbxAra(kelime);
        const dosyalar = (data.matches || []).map(m => m.metadata?.metadata || m.metadata).filter(m => m && m['.tag'] === 'file');
        if (!dosyalar.length) { await send(chatId, `"${kelime}" bulunamadı.`); return; }
        if (dosyalar.length === 1) {
          const f = dosyalar[0];
          const tmp = await dbxIndir(f.path_display, f.name);
          await sendDocument(chatId, tmp, `📄 ${f.name}`);
          fs.unlinkSync(tmp);
          return;
        }
        sessions[chatId] = { adim: 'dbx_dosya', _dbxDosyalar: dosyalar };
        await send(chatId, dosyalar.map((f,i) => `${i+1}. 📄 ${f.name}`).join('\n') + '\n\nNumara yaz.');
      } catch(e) { await send(chatId, `Hata: ${e.message}`); }
      return;
    }
    // Dropbox: önceki listeden dosya seçimi (numara)
    if (s.adim === 'dbx_dosya') {
      const n = parseInt(text);
      const dosyalar = s._dbxDosyalar || [];
      if (!isNaN(n) && n >= 1 && n <= dosyalar.length) {
        delete sessions[chatId];
        const f = dosyalar[n - 1];
        await send(chatId, `⏳ ${f.name} indiriliyor...`);
        try {
          const tmpYol = await dbxIndir(f.path_display, f.name);
          await sendDocument(chatId, tmpYol, `📄 ${f.name}`);
          fs.unlinkSync(tmpYol);
        } catch(e) {
          await send(chatId, `İndirme hatası: ${e.message}`);
        }
        return;
      }
      if (!isNaN(n)) {
        // Sayı ama aralık dışı
        await send(chatId, `1 ile ${dosyalar.length} arasında numara yaz.`);
        return;
      }
      delete sessions[chatId]; // Sayı değil → AI'ya devret
    }

    // Dropbox: listeleme veya arama (patron + mudur + admin)
    const dbxIstegi = dropboxIstegi(text);
    if (dbxIstegi) {
      if (user.role !== 'patron' && user.role !== 'mudur' && user.role !== 'admin') { await send(chatId, 'Belge erişimi için yetkiniz yok.'); return; }
      if (!DBX_REFRESH) { await send(chatId, 'Dropbox bağlantısı henüz ayarlanmadı.'); return; }
      if (dbxIstegi.tip === 'foto_klasor') {
        await send(chatId, '📷 Santiye fotolari yukleniyor...');
        try {
          const data = await dbxListele('/Santiye Fotolari');
          const entries = data.entries || [];
          if (!entries.length) { await send(chatId, 'Henuz fotograf yuklenmemis.'); return; }
          // Klasörler = tarih klasörleri
          // Klasörleri isme göre sırala (YYYY-MM-DD formatı alfabetik = kronolojik)
          const klasorler = entries.filter(e => e['.tag'] === 'folder').sort((a,b) => a.name > b.name ? 1 : -1);
          const dosyalar  = entries.filter(e => e['.tag'] === 'file');
          if (klasorler.length > 0) {
            // En son tarih klasörünü aç (sıralamada son = en yeni)
            const sonKlasor = klasorler[klasorler.length - 1];
            const altData = await dbxListele(sonKlasor.path_display);
            const altDosyalar = (altData.entries || []).filter(e => e['.tag'] === 'file');
            sessions[chatId] = { adim: 'dbx_dosya', _dbxDosyalar: altDosyalar };
            const liste = altDosyalar.map((f,i) => `${i+1}. 📷 ${f.name}`).join('\n');
            await send(chatId, `📁 ${sonKlasor.name} tarihli fotolar:\n\n${liste}\n\nNumara yaz → fotograf gelir.`);
          } else {
            sessions[chatId] = { adim: 'dbx_dosya', _dbxDosyalar: dosyalar };
            await send(chatId, dosyalar.map((f,i) => `${i+1}. 📷 ${f.name}`).join('\n') + '\n\nNumara yaz.');
          }
        } catch(e) { await send(chatId, `Hata: ${e.message}`); }
        return;
      }
      if (dbxIstegi.tip === 'liste') {
        await send(chatId, '📂 Dropbox yükleniyor...');
        try {
          const data = await dbxListele('');
          const entries = data.entries || [];
          if (entries.length === 0) { await send(chatId, 'Dropbox boş görünüyor.'); return; }
          const klasorler = entries.filter(e => e['.tag'] === 'folder').map(e => `📁 ${e.name}`);
          const dosyalar  = entries.filter(e => e['.tag'] === 'file');
          sessions[chatId] = { adim: 'dbx_dosya', _dbxDosyalar: dosyalar };
          let mesaj = '📂 DROPBOX\n';
          if (klasorler.length) mesaj += '\nKlasörler:\n' + klasorler.join('\n');
          if (dosyalar.length) {
            mesaj += '\n\nDosyalar:\n' + dosyalar.map((f,i) => `${i+1}. 📄 ${f.name}`).join('\n');
            mesaj += '\n\nNumara yazarak dosyayı indirebilirsin.';
          }
          await send(chatId, mesaj);
        } catch(e) {
          await send(chatId, `Dropbox hatası: ${e.message}`);
        }
        return;
      }
      if (dbxIstegi.tip === 'ara') {
        await send(chatId, `🔍 "${dbxIstegi.kelime}" aranıyor...`);
        try {
          const data = await dbxAra(dbxIstegi.kelime);
          const sonuclar = (data.matches || [])
            .map(m => m.metadata?.metadata || m.metadata)
            .filter(Boolean);
          const dosyalar = sonuclar.filter(e => e['.tag'] === 'file');
          if (dosyalar.length === 0) {
            await send(chatId, `"${dbxIstegi.kelime}" için dosya bulunamadı.`);
            return;
          }
          if (dosyalar.length === 1) {
            const f = dosyalar[0];
            await send(chatId, `⏳ ${f.name} indiriliyor...`);
            const tmpYol = await dbxIndir(f.path_display, f.name);
            await sendDocument(chatId, tmpYol, `📄 ${f.name}`);
            fs.unlinkSync(tmpYol);
            return;
          }
          sessions[chatId] = { adim: 'dbx_dosya', _dbxDosyalar: dosyalar };
          const liste = dosyalar.map((f,i) => `${i+1}. 📄 ${f.name}`).join('\n');
          await send(chatId, `"${dbxIstegi.kelime}" sonuçları:\n\n${liste}\n\nNumara yazarak indirebilirsin.`);
        } catch(e) {
          await send(chatId, `Arama hatası: ${e.message}`);
        }
        return;
      }
    }

    // Excel isteği kontrolü
    const excelTip = excelIstegi(text);
    if (excelTip) {
      await send(chatId, '⏳ Excel hazırlanıyor...');
      try {
        if (excelTip === 'malzeme') {
          const dosya = await excelMalzeme();
          await sendDocument(chatId, dosya, '📦 Malzeme Takibi');
          fs.unlinkSync(dosya);
        } else {
          const donem = excelTip.replace('is_', '');
          const { dosya, donemAd, sayi } = await excelIsTakibi(donem);
          await sendDocument(chatId, dosya, `📊 İş Takibi — ${donemAd} (${sayi} kayıt)`);
          fs.unlinkSync(dosya);
        }
      } catch(e) {
        await send(chatId, `Excel oluşturulamadı: ${e.message}`);
      }
      return;
    }

    // Normal mesaj → AI
    await send(chatId, '⏳ Düşünüyorum...');
    const cevap = await aiCevap(chatId, text);
    await send(chatId, cevap);
    return;
  }

  // ── SATIN ALMA ROLÜ ──────────────────────────────────────────────────────────
  if (user.role === 'satinalma') {
    if (text === '/start' || text === '/baslat') {
      delete sessions[chatId];
      sessions[chatId] = { adim: 'satinalma_menu' };
      await send(chatId,
        `Merhaba ${user.name}!\n\n` +
        `1. Yeni baglanti gir\n` +
        `2. Acik baglantilar\n` +
        `3. Santiyeye gonder (baglantiyi dusur)\n` +
        `4. Depoya giris yap\n` +
        `5. Depodan cikis yap\n` +
        `6. Depo stok durumu\n` +
        `7. Santiye stok durumu\n\nNumara yaz.`
      );
      return;
    }
    const ss = sessions[chatId] || {};

    // ── Menü ──
    if (ss.adim === 'satinalma_menu') {
      if (text === '1') {
        sessions[chatId] = { adim: 'sip_malzeme' };
        await send(chatId, `Ne satin aliniyor?\nOrnek: Nervurlu demir, Beton, Tugla, Boya`);
        return;
      }
      if (text === '2') {
        const snap = await db.collection('siparisler')
          .where('durum', '==', 'devam')
          .orderBy('tarih', 'desc').limit(20).get();
        if (snap.empty) { await send(chatId, 'Acik baglanti yok.\n\n/start ile yeni baglanti girebilirsin.'); return; }
        const liste = snap.docs.map(d => {
          const g = d.data();
          const kalan = g.kalan_miktar ?? g.toplam_miktar;
          const teslim = g.toplam_miktar - kalan;
          const snt = g.santiye ? ` [${g.santiye.toUpperCase()}]` : '';
          return `📦 ${g.malzeme}${snt} — ${g.toplam_miktar} ${g.birim}\n   Geldi: ${teslim} / Kalan: ${kalan} ${g.birim}${g.firma ? `\n   Firma: ${g.firma}` : ''}`;
        }).join('\n\n');
        await send(chatId, `ACIK BAGLANTILAR\n━━━━━━━━━━━━━━━━\n\n${liste}`);
        return;
      }
      if (text === '3') {
        // Santiyeye gönder — aktif bağlantıları listele
        const snap = await db.collection('siparisler')
          .where('durum', '==', 'devam').orderBy('tarih', 'desc').limit(20).get();
        if (snap.empty) { await send(chatId, 'Acik baglanti yok.'); return; }
        const liste = snap.docs.map((d, i) => {
          const g = d.data();
          const kalan = g.kalan_miktar ?? g.toplam_miktar;
          return `${i + 1}. ${g.malzeme} — kalan: ${kalan} ${g.birim}${g.firma ? ` (${g.firma})` : ''}`;
        }).join('\n');
        sessions[chatId] = { adim: 'sev_baglanti', _baglantilar: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
        await send(chatId, `Hangi baglantiyi gondermek istiyorsun?\n\n${liste}\n\nNumara yaz.`);
        return;
      }
      if (text === '4') {
        sessions[chatId] = { adim: 'depo_giris_mal' };
        await send(chatId, `Depoya ne konuldu?\nOrnek: Nervurlu demir, Boya, Seramik, Civi`);
        return;
      }
      if (text === '5') {
        sessions[chatId] = { adim: 'depo_cikis_mal' };
        await send(chatId, `Depodan ne alindi?`);
        return;
      }
      if (text === '6') {
        const stok = await depoStok();
        if (stok.length === 0) {
          await send(chatId, `Depoda kayitli stok yok.\n\n/start ile depoya giris yapabilirsin.`);
        } else {
          const pozitif = stok.filter(s => s.miktar > 0);
          const sifir   = stok.filter(s => s.miktar <= 0);
          let mesaj = `DEPO STOK DURUMU\n━━━━━━━━━━━━━━━━\n\n`;
          if (pozitif.length > 0) mesaj += pozitif.map(s => `• ${s.malzeme}: ${s.miktar} ${s.birim}`).join('\n');
          if (sifir.length > 0) mesaj += `\n\nTukenmis:\n` + sifir.map(s => `• ${s.malzeme}: 0 ${s.birim}`).join('\n');
          await send(chatId, mesaj);
        }
        return;
      }
      if (text === '7') {
        await send(chatId, '⏳ Santiye stok raporu hazırlanıyor...');
        const rapor = await tumStokRaporu();
        await send(chatId, `TÜM ŞANTİYELER STOK DURUMU\n━━━━━━━━━━━━━━━━\n\n${rapor}`);
        return;
      }
      await send(chatId, '1-6 arasi numara yaz.\n/start ile menuyu tekrar ac.');
      return;
    }

    // ── Sevkiyat (şantiyeye gönder → bağlantıdan düş) ──
    if (ss.adim === 'sev_baglanti') {
      const n = parseInt(text);
      const baglantilar = ss._baglantilar || [];
      if (isNaN(n) || n < 1 || n > baglantilar.length) {
        await send(chatId, `1-${baglantilar.length} arasi numara yaz.`); return;
      }
      const sec = baglantilar[n - 1];
      const kalan = sec.kalan_miktar ?? sec.toplam_miktar;
      sessions[chatId] = { ...ss, sev_id: sec.id, sev_mal: sec.malzeme, sev_birim: sec.birim, sev_kalan: kalan, adim: 'sev_miktar' };
      await send(chatId, `${sec.malzeme} secildi. Kalan: ${kalan} ${sec.birim}\n\nKac ${sec.birim} gonderiyorsun?`);
      return;
    }
    if (ss.adim === 'sev_miktar') {
      const parsed = parseMiktarBirim(text + (text.includes(ss.sev_birim) ? '' : ss.sev_birim));
      const miktar = parsed ? parsed.miktar : parseFloat(text);
      if (!miktar || isNaN(miktar) || miktar <= 0) { await send(chatId, 'Gecerli bir sayi yaz. Ornek: 1.5'); return; }
      if (miktar > ss.sev_kalan) { await send(chatId, `En fazla ${ss.sev_kalan} ${ss.sev_birim} gonderebilirsin.`); return; }
      sessions[chatId] = { ...ss, sev_miktar: miktar, adim: 'sev_santiye' };
      await send(chatId,
        `${miktar} ${ss.sev_birim} ✓\n\nHangi santiyeye gidiyor?\n` +
        `1. Akyazi\n2. Arakli\n3. Kosk\n4. Havalimani\n\nNumara yaz.`
      );
      return;
    }
    if (ss.adim === 'sev_santiye') {
      const santiyeMap = { '1': 'site1', '2': 'site2', '3': 'site3', '4': 'site4' };
      const snt = santiyeMap[text.trim()];
      if (!snt) { await send(chatId, '1, 2, 3 veya 4 yaz.'); return; }
      // Bağlantıdan düş
      const yeniKalan = ss.sev_kalan - ss.sev_miktar;
      await db.collection('siparisler').doc(ss.sev_id).update({
        kalan_miktar: yeniKalan,
        durum: yeniKalan <= 0 ? 'tamamlandi' : 'devam'
      });
      // Sevkiyat kaydı
      await db.collection('sevkiyatlar').add({
        baglanti_id: ss.sev_id,
        malzeme:  ss.sev_mal,
        miktar:   ss.sev_miktar,
        birim:    ss.sev_birim,
        santiye:  snt,
        gonderen: user.name,
        tarih:    admin.firestore.Timestamp.fromDate(new Date())
      });
      delete sessions[chatId];
      await send(chatId,
        `Sevkiyat kaydedildi!\n\n` +
        `${ss.sev_mal} — ${ss.sev_miktar} ${ss.sev_birim} → ${snt.toUpperCase()}\n` +
        `Baglantida kalan: ${yeniKalan} ${ss.sev_birim}${yeniKalan <= 0 ? ' (TAMAMLANDI)' : ''}\n\n` +
        `/start ile yeni islem yapabilirsin.`
      );
      return;
    }

    // ── Bağlantı girişi ──
    if (ss.adim === 'sip_malzeme') {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); return; }
      sessions[chatId] = { ...ss, sip_malzeme: text, adim: 'sip_miktar' };
      await send(chatId, `${text} ✓\n\nToplam baglanti miktari?\nOrnek: 10ton  veya  50m3  veya  1000adet`);
      return;
    }
    if (ss.adim === 'sip_miktar') {
      const parsed = parseMiktarBirim(text);
      if (!parsed) { await send(chatId, `Format hatali. Ornek: 10ton  veya  50m3  veya  1000adet`); return; }
      sessions[chatId] = { ...ss, sip_miktar: parsed.miktar, sip_birim: parsed.birim, adim: 'sip_firma' };
      await send(chatId, `${parsed.miktar} ${parsed.birim} ✓\n\nFirma/tedarikci? (Yoksa "yok" yaz)`);
      return;
    }
    if (ss.adim === 'sip_firma') {
      const firma = text.toLowerCase() === 'yok' ? '' : text;
      sessions[chatId] = { ...ss, sip_firma: firma, adim: 'sip_santiye' };
      await send(chatId, `✓\n\nHangi santiye icin?\n1. Akyazi\n2. Arakli\n3. Kosk\n4. Havalimani\n5. Genel (hepsi)\n\nNumara yaz.`);
      return;
    }
    if (ss.adim === 'sip_santiye') {
      const santiyeMap = { '1': 'site1', '2': 'site2', '3': 'site3', '4': 'site4', '5': 'genel' };
      const snt = santiyeMap[text.trim()];
      if (!snt) { await send(chatId, `1, 2, 3, 4 veya 5 yaz.`); return; }
      sessions[chatId] = { ...ss, sip_santiye: snt, adim: 'sip_not' };
      await send(chatId, `✓\n\nEk not? (Yoksa "yok" yaz)\nOrnek: Teslim tarihi 15 Nisan, parca parca gelecek`);
      return;
    }
    if (ss.adim === 'sip_not') {
      const not = text.toLowerCase() === 'yok' ? '' : text;
      await db.collection('siparisler').add({
        malzeme:       ss.sip_malzeme,
        toplam_miktar: ss.sip_miktar,
        kalan_miktar:  ss.sip_miktar,
        birim:         ss.sip_birim,
        firma:         ss.sip_firma || '',
        not:           not,
        durum:         'devam',
        santiye:       ss.sip_santiye || 'genel',
        olusturan:     user.name,
        tarih:         admin.firestore.Timestamp.fromDate(new Date())
      });
      delete sessions[chatId];
      await send(chatId,
        `Baglanti olusturuldu!\n\n` +
        `${ss.sip_malzeme} — ${ss.sip_miktar} ${ss.sip_birim}\n` +
        (ss.sip_firma ? `Firma: ${ss.sip_firma}\n` : '') +
        (not ? `Not: ${not}\n` : '') +
        `\nSantiye teslimatlari geldikce otomatik dusurecek.\n\n/start ile yeni islem yapabilirsin.`
      );
      for (const [id, u] of Object.entries(USERS)) {
        if (u.role === 'admin' || u.role === 'mudur') {
          await send(id, `Yeni baglanti: ${ss.sip_malzeme} ${ss.sip_miktar} ${ss.sip_birim}${ss.sip_firma ? ` (${ss.sip_firma})` : ''} — ${user.name}`);
        }
      }
      return;
    }

    // ── Depoya giriş ──
    if (ss.adim === 'depo_giris_mal') {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); return; }
      sessions[chatId] = { ...ss, dg_mal: text, adim: 'depo_giris_miktar' };
      await send(chatId, `${text} ✓\n\nMiktar ve birim?\nOrnek: 5ton  veya  200adet  veya  10m3`);
      return;
    }
    if (ss.adim === 'depo_giris_miktar') {
      const parsed = parseMiktarBirim(text);
      if (!parsed) { await send(chatId, `Format hatali. Ornek: 5ton  veya  200adet`); return; }
      sessions[chatId] = { ...ss, dg_miktar: parsed.miktar, dg_birim: parsed.birim, adim: 'depo_giris_teslim' };
      await send(chatId, `${parsed.miktar} ${parsed.birim} ✓\n\nKim teslim aldi? (Isim yaz, yoksa "yok")`);
      return;
    }
    if (ss.adim === 'depo_giris_teslim') {
      const teslimAlan = text.toLowerCase() === 'yok' ? '' : text;
      sessions[chatId] = { ...ss, dg_teslim: teslimAlan, adim: 'depo_giris_not' };
      await send(chatId, `✓\n\nNot? (Yoksa "yok" yaz)`);
      return;
    }
    if (ss.adim === 'depo_giris_not') {
      const not = text.toLowerCase() === 'yok' ? '' : text;
      await db.collection('depo_hareketleri').add({
        tip:         'giris',
        malzeme:     ss.dg_mal,
        miktar:      ss.dg_miktar,
        birim:       ss.dg_birim,
        kisi:        user.name,
        teslim_alan: ss.dg_teslim || '',
        alan:        '',
        santiye:     '',
        tarih:       admin.firestore.Timestamp.fromDate(new Date()),
        not
      });
      delete sessions[chatId];
      await send(chatId,
        `Depoya giris kaydedildi!\n\n` +
        `${ss.dg_mal} — ${ss.dg_miktar} ${ss.dg_birim}\n` +
        (ss.dg_teslim ? `Teslim alan: ${ss.dg_teslim}\n` : '') +
        (not ? `Not: ${not}\n` : '') +
        `\n/start ile yeni islem yapabilirsin.`
      );
      return;
    }

    // ── Depodan çıkış ──
    if (ss.adim === 'depo_cikis_mal') {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); return; }
      sessions[chatId] = { ...ss, dc_mal: text, adim: 'depo_cikis_miktar' };
      await send(chatId, `${text} ✓\n\nMiktar ve birim?\nOrnek: 2ton  veya  50adet`);
      return;
    }
    if (ss.adim === 'depo_cikis_miktar') {
      const parsed = parseMiktarBirim(text);
      if (!parsed) { await send(chatId, `Format hatali. Ornek: 2ton  veya  50adet`); return; }
      sessions[chatId] = { ...ss, dc_miktar: parsed.miktar, dc_birim: parsed.birim, adim: 'depo_cikis_santiye' };
      await send(chatId,
        `${parsed.miktar} ${parsed.birim} ✓\n\nHangi santiyeye gidiyor?\n` +
        `1. Akyazi\n2. Arakli\n3. Kosk\n4. Havalimani\n\nNumara yaz.`
      );
      return;
    }
    if (ss.adim === 'depo_cikis_santiye') {
      const santiyeMap = { '1': 'site1', '2': 'site2', '3': 'site3', '4': 'site4' };
      const snt = santiyeMap[text.trim()];
      if (!snt) { await send(chatId, '1, 2, 3 veya 4 yaz.'); return; }
      sessions[chatId] = { ...ss, dc_santiye: snt, adim: 'depo_cikis_alan' };
      await send(chatId, `${snt.toUpperCase()} ✓\n\nKim aldi? (isim yaz)`);
      return;
    }
    if (ss.adim === 'depo_cikis_alan') {
      if (text.length < 2) { await send(chatId, 'Isim yaz.'); return; }
      sessions[chatId] = { ...ss, dc_alan: text, adim: 'depo_cikis_not' };
      await send(chatId, `${text} ✓\n\nNot? (Yoksa "yok" yaz)`);
      return;
    }
    if (ss.adim === 'depo_cikis_not') {
      const not = text.toLowerCase() === 'yok' ? '' : text;
      await db.collection('depo_hareketleri').add({
        tip:     'cikis',
        malzeme: ss.dc_mal,
        miktar:  ss.dc_miktar,
        birim:   ss.dc_birim,
        kisi:    user.name,
        alan:    ss.dc_alan,
        santiye: ss.dc_santiye,
        tarih:   admin.firestore.Timestamp.fromDate(new Date()),
        not
      });
      delete sessions[chatId];
      await send(chatId,
        `Depodan cikis kaydedildi!\n\n` +
        `${ss.dc_mal} — ${ss.dc_miktar} ${ss.dc_birim}\n` +
        `Santiye: ${ss.dc_santiye.toUpperCase()}\n` +
        `Alan: ${ss.dc_alan}\n` +
        (not ? `Not: ${not}\n` : '') +
        `\n/start ile yeni islem yapabilirsin.`
      );
      return;
    }

    // Varsayılan — menüye yönlendir
    delete sessions[chatId];
    sessions[chatId] = { adim: 'satinalma_menu' };
    await send(chatId,
      `Merhaba ${user.name}!\n\n1. Yeni baglanti gir\n2. Acik baglantilar\n3. Santiyeye gonder\n4. Depoya giris yap\n5. Depodan cikis yap\n6. Depo stok durumu\n7. Santiye stok durumu\n\nNumara yaz.`
    );
    return;
  }

  // ── /start (şef/admin) ──
  if (text === '/start' || text === '/baslat') {
    await planYukle(user.santiye);
    delete sessions[chatId];
    await send(chatId,
      `Merhaba ${user.name}! Ne yapmak istiyorsun?\n\n` +
      `1. Is girisi yap\n` +
      `2. Malzeme girisi (santiyeye geldi)\n` +
      `3. Stok kullandim (nerede kullanildi)\n` +
      `4. Stok durumu\n` +
      `5. Gunluk not ekle\n` +
      `6. Depodan malzeme al\n\nNumara yaz.\n\n` +
      `Tum komutlar icin /yardim yaz.`
    );
    sessions[chatId] = { adim: 'ana_menu' };
    return;
  }

  // ── /ozet (admin) ──
  if (text === '/ozet' || text === '/rapor') {
    if (user.role === 'admin' || user.role === 'mudur') { await ozetGonder(chatId); return; }
  }

  // ── /h — HIZLI KAYIT (Siri için) ──
  if (text.startsWith('/h ') || text.startsWith('/hizli ')) {
    await planYukle();
    const ham = text.replace(/^\/h(izli)?\s+/i, '').trim();
    const sonuc = hizliParse(ham, user.santiye);
    if (sonuc.hata) {
      await send(chatId,
        `❌ ${sonuc.hata}\n\n` +
        `Format: /h [ekip] [kişi]kişi [imalat] [miktar][birim] [mahal]\n` +
        `Örnek: /h Demir Ekibi 8kişi kolon demiri bağlama 2.1ton 1. Bodrum`
      );
      return;
    }
    // Görev eşleştir (opsiyonel)
    const gorevler = aktifGorevler(sonuc.ekip, user.santiye);
    const gorev = gorevler.find(g => trAscii(g.ad).includes(trAscii(sonuc.imalat).split(' ')[0]));
    const s = {
      is_gucu:  sonuc.ekip,
      adam:     sonuc.adam,
      imalat:   sonuc.imalat,
      miktar:   sonuc.miktar,
      birim:    sonuc.birim,
      mahal:    sonuc.mahal,
      aciklama: '',
      gorev_id: gorev?.id  || '',
      gorev_ad: gorev?.ad  || ''
    };
    await kaydet(chatId, s, user);
    return;
  }

  // ── FORM ADIMLARI ──
  switch (s.adim) {

    case 'ana_menu': {
      const n = parseInt(text);
      if (n === 1) {
        sessions[chatId] = { adim: 'gun_sec' };
        await send(chatId, `Bu kayit hangi gun icin?\n\n1. Bugün\n2. Dün`);
      } else if (n === 2) {
        sessions[chatId] = { adim: 'mal_ne' };
        await send(chatId, `Ne malzeme geldi?\nOrnek: Nervurlu demir, Hazir beton, Tugla, Kum, Cakil, Ahsap kalip`);
      } else if (n === 3) {
        sessions[chatId] = { adim: 'stok_kul_mal' };
        await send(chatId, `Hangi malzemeyi kullandin?\nOrnek: Nervurlu demir, Boya, Seramik`);
      } else if (n === 4) {
        if (user.role === 'mudur') {
          await send(chatId, '⏳ Stok raporu hazırlanıyor...');
          const rapor = await tumStokRaporu();
          await send(chatId, `TÜM ŞANTİYELER STOK RAPORU\n━━━━━━━━━━━━━━━━\n\n${rapor}\n/start ile yeni islem.`);
        } else {
          const stok = await santiyeStoku(user.santiye || 'site1');
          if (stok.length === 0) {
            await send(chatId, `Stok kaydi yok.\nOnce malzeme girisi yaparak stogu olustur.`);
          } else {
            const liste = stok.map(s =>
              `• ${s.malzeme}: Giren ${s.giren}${s.birim} | Kullanilan ${s.kullanilan}${s.birim} | Kalan ${s.kalan}${s.birim}`
            ).join('\n');
            await send(chatId, `${(user.santiye || 'AKYAZI').toUpperCase()} STOK DURUMU\n━━━━━━━━━━━━━━━━\n\n${liste}\n\n/start ile yeni islem.`);
          }
        }
      } else if (n === 5) {
        sessions[chatId] = { adim: 'not_yaz' };
        await send(chatId, `Gunluk notunu yaz:\n(Ornek: Vinc ariza yapti, beton dokumu yarim kaldi. Yarin devam edilecek.)`);
      } else if (n === 6) {
        sessions[chatId] = { adim: 'depo_sef_mal' };
        await send(chatId, `Depodan ne aliyorsun?\nOrnek: Boya, Civi, Kum, Seramik`);
      } else if (user.role === 'mudur') {
        // Müdür menü dışı metin → AI chatbot
        delete sessions[chatId];
        await send(chatId, '⏳ Düşünüyorum...');
        const cevap = await aiCevap(chatId, text);
        await send(chatId, cevap);
      } else {
        await send(chatId, '1-6 arasi numara yaz veya serbest metin ile santiye sor.');
      }
      break;
    }

    case 'not_yaz': {
      if (text.length < 5) { await send(chatId, 'Daha detayli yaz.'); break; }
      await db.collection('gunluk_notlar').add({
        tarih:     admin.firestore.Timestamp.fromDate(new Date()),
        not:       text,
        kullanici: user.name,
        santiye:   user.santiye || 'site1'
      });
      delete sessions[chatId];
      await send(chatId, `✅ Not kaydedildi!\n\n📝 ${text}\n\nYeni islem icin /start yaz.`);
      break;
    }

    // ── Şef/müdür depo çıkışı ──
    case 'depo_sef_mal': {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); break; }
      sessions[chatId] = { ...s, ds_mal: text, adim: 'depo_sef_miktar' };
      await send(chatId, `${text} ✓\n\nMiktar ve birim?\nOrnek: 2ton  veya  50adet  veya  5m3`);
      break;
    }

    case 'depo_sef_miktar': {
      const parsed = parseMiktarBirim(text);
      if (!parsed) { await send(chatId, `Format hatali. Ornek: 2ton  veya  50adet`); break; }
      sessions[chatId] = { ...s, ds_miktar: parsed.miktar, ds_birim: parsed.birim, adim: 'depo_sef_not' };
      await send(chatId, `${parsed.miktar} ${parsed.birim} ✓\n\nNot? (Yoksa "yok" yaz)`);
      break;
    }

    case 'depo_sef_not': {
      const not = text.toLowerCase() === 'yok' ? '' : text;
      await db.collection('depo_hareketleri').add({
        tip:     'cikis',
        malzeme: s.ds_mal,
        miktar:  s.ds_miktar,
        birim:   s.ds_birim,
        kisi:    user.name,
        alan:    user.name,
        santiye: user.santiye || 'site1',
        tarih:   admin.firestore.Timestamp.fromDate(new Date()),
        not
      });
      delete sessions[chatId];
      await send(chatId,
        `Depodan alinma kaydedildi!\n\n` +
        `${s.ds_mal} — ${s.ds_miktar} ${s.ds_birim}\n` +
        `Santiye: ${(user.santiye || 'site1').toUpperCase()}\n` +
        (not ? `Not: ${not}\n` : '') +
        `\nYeni islem icin /start yaz.`
      );
      break;
    }

    case 'stok_kul_mal': {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); break; }
      sessions[chatId] = { ...s, sk_mal: text, adim: 'stok_kul_miktar' };
      await send(chatId, `${text} ✓\n\nNe kadar kullandin?\nOrnek: 500kg  veya  2ton  veya  50adet`);
      break;
    }

    case 'stok_kul_miktar': {
      const parsed = parseMiktarBirim(text);
      if (!parsed) { await send(chatId, `Format hatali. Ornek: 500kg  veya  2ton  veya  50adet`); break; }
      sessions[chatId] = { ...s, sk_miktar: parsed.miktar, sk_birim: parsed.birim, adim: 'stok_kul_nerede' };
      await send(chatId, `${parsed.miktar} ${parsed.birim} ✓\n\nNerede kullandin?\nOrnek: 1. Kat tabliye, Zemin kolon, B Blok bodrum`);
      break;
    }

    case 'stok_kul_nerede': {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); break; }
      const snt = user.santiye || 'site1';
      const now = admin.firestore.Timestamp.fromDate(new Date());
      await db.collection('santiye_stoku').add({
        tip:      'cikis',
        malzeme:  s.sk_mal,
        miktar:   s.sk_miktar,
        birim:    s.sk_birim,
        kullanici: user.name,
        santiye:  snt,
        nerede:   text,
        tarih:    now,
        not:      ''
      });
      delete sessions[chatId];
      await send(chatId,
        `Stok kullanimi kaydedildi!\n\n` +
        `${s.sk_mal} — ${s.sk_miktar} ${s.sk_birim}\n` +
        `Nerede: ${text}\n` +
        `\nYeni islem icin /start yaz.`
      );
      break;
    }

    case 'mal_ne': {
      if (text.length < 2) { await send(chatId, 'Daha detayli yaz.'); break; }
      sessions[chatId] = { ...s, mal_ad: text, adim: 'mal_miktar' };
      await send(chatId, `${text} ✓\n\nMiktar ve birim?\nOrnek: 5ton  veya  10m3  veya  200adet`);
      break;
    }

    case 'mal_miktar': {
      const parsed = parseMiktarBirim(text);
      if (!parsed) {
        await send(chatId, `Format hatali. Ornek: 5ton  veya  10m3  veya  200adet\nBirimler: ${BIRIM.join(', ')}`);
      } else {
        sessions[chatId] = { ...s, mal_miktar: parsed.miktar, mal_birim: parsed.birim, adim: 'mal_firma' };
        await send(chatId, `${parsed.miktar} ${parsed.birim} ✓\n\nFirma/tedarikci? (Yoksa "yok" yaz)`);
      }
      break;
    }

    case 'mal_firma': {
      const firma = text.toLowerCase() === 'yok' ? '' : text;
      sessions[chatId] = { ...s, mal_firma: firma, adim: 'mal_not' };
      await send(chatId, `✓\n\nEk not? (Yoksa "yok" yaz)\nOrnek: Irsaliye no: 1234, eksik geldi, hasar var`);
      break;
    }

    case 'mal_not': {
      const malNot = text.toLowerCase() === 'yok' ? '' : text;
      const ms = sessions[chatId];
      const snt = user.santiye || 'site1';
      const now = admin.firestore.Timestamp.fromDate(new Date());

      // malzeme_takibi (genel tarihsel kayıt) + santiye_stoku girişi
      const ref = await db.collection('malzeme_takibi').add({
        tarih: now, malzeme: ms.mal_ad, miktar: ms.mal_miktar,
        birim: ms.mal_birim, firma: ms.mal_firma || '',
        not: malNot, kullanici: user.name, santiye: snt
      });
      await db.collection('santiye_stoku').add({
        tip: 'giris', malzeme: ms.mal_ad, miktar: ms.mal_miktar,
        birim: ms.mal_birim, kullanici: user.name, santiye: snt,
        nerede: '', tarih: now, not: malNot
      });

      sessions[chatId] = { adim: 'mal_onay', _malDocId: ref.id, _malOzet: ms, _malNot: malNot };
      await fetch(`${API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text:
            `Malzeme kaydedildi!\n\n` +
            `${ms.mal_ad} — ${ms.mal_miktar} ${ms.mal_birim}\n` +
            (ms.mal_firma ? `Firma: ${ms.mal_firma}\n` : '') +
            (malNot ? `Not: ${malNot}\n` : '') +
            `\nYanlis girdiysen duzeltebilirsin:`,
          reply_markup: {
            inline_keyboard: [[
              { text: 'Duzelt', callback_data: `mal_duzenle_${ref.id}` },
              { text: 'Tamam',  callback_data: `mal_tamam_${ref.id}` }
            ]]
          }
        })
      });
      break;
    }

    case 'mal_onay': {
      // Herhangi bir metin yazarsa oturumu kapat
      delete sessions[chatId];
      await send(chatId, '/start yaz ve yeni işleme başla.');
      break;
    }

    case 'gun_sec': {
      if (text === '1' || text.toLowerCase().startsWith('bug')) {
        sessions[chatId] = { adim: 'is_gucu', _tarihOffset: 0 };
        const liste = IS_GUCU.map((g, i) => `${i + 1}. ${g}`).join('\n');
        await send(chatId, `Hangi ekip calisti?\n\n${liste}\n\nNumara veya isim yaz.`);
      } else if (text === '2' || text.toLowerCase().startsWith('dün') || text.toLowerCase().startsWith('dun')) {
        sessions[chatId] = { adim: 'is_gucu', _tarihOffset: -1 };
        const liste = IS_GUCU.map((g, i) => `${i + 1}. ${g}`).join('\n');
        await send(chatId, `Hangi ekip calisti?\n\n${liste}\n\nNumara veya isim yaz.`);
      } else {
        await send(chatId, '1 veya 2 yaz.\n\n1. Bugün\n2. Dün');
      }
      break;
    }

    case 'is_gucu': {
      const secilen = matchIsGucu(text);
      if (!secilen) {
        await send(chatId, `Anlayamadim. 1-${IS_GUCU.length} arasi numara veya isim yaz.\nOrnek: 4  veya  demir`);
      } else {
        sessions[chatId] = { ...s, is_gucu: secilen, adim: 'adam' };
        await send(chatId, `${secilen} ✓\n\nKac kisi calisti?`);
      }
      break;
    }

    case 'adam': {
      const n = parseInt(text);
      if (isNaN(n) || n < 1 || n > 200) {
        await send(chatId, 'Sayi gir. Ornek: 5');
      } else {
        sessions[chatId] = { ...s, adam: n, adim: 'imalat' };
        await send(chatId, `${n} kisi ✓\n\nNe imalati yapildi?`);
      }
      break;
    }

    case 'imalat': {
      if (text.length < 3) {
        await send(chatId, 'Daha detayli yaz.');
      } else {
        sessions[chatId] = { ...s, imalat: text, adim: 'miktar_birim' };
        const bl = BIRIM.join(', ');
        await send(chatId, `✓\n\nMiktar ve birim? (Birimler: ${bl})\nOrnek: 100m2   veya   50 m3   veya   10 adet`);
      }
      break;
    }

    case 'miktar_birim': {
      const parsed = parseMiktarBirim(text);
      if (!parsed) {
        await send(chatId, `Format hatali.\nOrnek: 100m2  veya  50 m3  veya  10 adet\nGecerli birimler: ${BIRIM.join(', ')}`);
      } else {
        sessions[chatId] = { ...s, miktar: parsed.miktar, birim: parsed.birim, adim: 'mahal' };
        const mahalListe = getMahal(user.santiye).map((m,i) => `${i+1}. ${m}`).join('\n');
        await send(chatId, `${parsed.miktar} ${parsed.birim} ✓\n\nMahal?\n\n${mahalListe}\n\nNumara veya isim yaz.`);
      }
      break;
    }

    case 'mahal': {
      const secilen = matchMahal(text, user.santiye);
      if (!secilen) {
        const liste = getMahal(user.santiye).map((m,i) => `${i+1}. ${m}`).join('\n');
        await send(chatId, `Gecersiz mahal. Listeden sec:\n\n${liste}\n\nNumara veya isim yaz.`);
      } else {
        sessions[chatId] = { ...s, mahal: secilen, adim: 'aciklama' };
        await send(chatId, `${secilen} ✓\n\nEk aciklama? (Yoksa "yok" yaz)`);
      }
      break;
    }

    case 'aciklama': {
      const aciklama = text.toLowerCase() === 'yok' ? '' : text;
      sessions[chatId] = { ...s, aciklama, adim: 'gorev' };

      const gorevler = aktifGorevler(s.is_gucu, user.santiye);
      if (gorevler.length === 0) {
        const final = { ...sessions[chatId] };
        delete sessions[chatId];
        await kaydet(chatId, final, user);
      } else {
        sessions[chatId]._gorevler = gorevler;
        const satirlar = gorevler.map((g, i) => `${i + 1}. ${g.ad}`).join('\n');
        await send(chatId,
          `Hangi is planina ait?\n\n${satirlar}\n\n0. Plana baglamadan kaydet\n\nNumara yaz.`
        );
      }
      break;
    }

    case 'gorev': {
      const gorevler = s._gorevler || aktifGorevler(s.is_gucu, user.santiye);
      const n = parseInt(text);

      if (n === 0 || text.toLowerCase() === 'atla') {
        const final = { ...s, gorev_id: '', gorev_ad: '' };
        delete final._gorevler;
        delete sessions[chatId];
        await kaydet(chatId, final, user);
      } else if (!isNaN(n) && n >= 1 && n <= gorevler.length) {
        const sec = gorevler[n - 1];
        const final = { ...s, gorev_id: sec.id, gorev_ad: sec.ad };
        delete final._gorevler;
        delete sessions[chatId];
        await kaydet(chatId, final, user);
      } else {
        await send(chatId, `0 ile ${gorevler.length} arasinda numara yaz.`);
      }
      break;
    }

    case 'foto': {
      if (text.toLowerCase() === 'yok' || text.toLowerCase() === 'hayir') {
        delete sessions[chatId];
        await send(chatId, 'Tamam. Yeni giris icin /start yaz.');
      } else {
        await send(chatId, 'Fotograf gonder veya "yok" yaz.');
      }
      break;
    }

    default: {
      delete sessions[chatId];
      await send(chatId, '/start yaz ve baslayalim.');
    }
  }
}

// ─── EXPRESS ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    if (req.body.message)       await handleMessage(req.body.message);
    if (req.body.callback_query) await handleCallback(req.body.callback_query);
  } catch (err) {
    console.error('Webhook hata:', err.message);
  }
});

async function handleCallback(cb) {
  const chatId = cb.message.chat.id.toString();
  const data   = cb.data || '';

  // Multi-tenant Faz C: onboarding wizard inline keyboard cevapları
  if (data.startsWith('onb_')) {
    try {
      const consumed = await onboarding.handleOnboardingCallback(cb);
      if (consumed) return;
    } catch (e) {
      console.error('onboarding.handleOnboardingCallback hata:', e.message);
    }
  }

  // Görevi tamamla
  if (data.startsWith('tamam_')) {
    const gorevId = data.replace('tamam_', '');
    const ref  = db.collection('gorevler').doc(gorevId);
    const doc  = await ref.get();
    if (!doc.exists) return;
    const g = doc.data();
    if (g.durum === 'yapildi') {
      await fetch(`${API}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: 'Bu görev zaten tamamlandı.' })
      });
      return;
    }
    await ref.update({ durum: 'yapildi', tamamlama: admin.firestore.Timestamp.now(), tamamlayan: chatId });

    // Butonu güncelle
    await fetch(`${API}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } })
    });
    await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id, text: '✅ Tamamlandı olarak işaretlendi!' })
    });

    // Görevi yapan kişiye onay
    const kisiAd = USERS[chatId]?.name || g.atanan;
    await send(chatId, `✅ "${g.aciklama.slice(0,60)}" görevi tamamlandı olarak işaretlendi.`);

    // Patrona bildir
    if (g.patronChatId) {
      await send(g.patronChatId,
        `✅ GÖREV TAMAMLANDI\n━━━━━━━━━━━━\n` +
        `👤 ${kisiAd}\n📋 ${g.aciklama}`
      );
    }
  }

  // Malzeme kaydını düzelt
  if (data.startsWith('mal_duzenle_')) {
    const docId = data.replace('mal_duzenle_', '');
    // Firestore'dan sil
    try { await db.collection('malzeme_takibi').doc(docId).delete(); } catch(e) { console.error(`mal_duzenle delete(${docId}) hata:`, e.message); }
    // Butonu kaldır
    await fetch(`${API}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } })
    });
    await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id, text: 'Kayıt silindi, yeniden gir.' })
    });
    // Malzeme formunu baştan başlat
    sessions[chatId] = { adim: 'mal_ne' };
    await send(chatId, `Kayıt silindi. Yeniden gir:\n\nNe malzeme geldi?`);
    return;
  }

  // Malzeme kaydı tamam — oturumu kapat
  if (data.startsWith('mal_tamam_')) {
    delete sessions[chatId];
    await fetch(`${API}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } })
    });
    await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id, text: '✅ Kaydedildi!' })
    });
    await send(chatId, 'Yeni işlem için /start yaz.');
    return;
  }

  // Satış ödeme alındı
  if (data.startsWith('odeme_al_')) {
    const rest         = data.slice('odeme_al_'.length);
    const lastUnderscore = rest.lastIndexOf('_');
    const docId        = rest.slice(0, lastUnderscore);
    const idx          = parseInt(rest.slice(lastUnderscore + 1));
    const ref          = db.collection('sozlesmeler').doc(docId);
    const doc          = await ref.get();
    if (!doc.exists) {
      await fetch(`${API}/answerCallbackQuery`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callback_query_id: cb.id, text: 'Sozlesme bulunamadi.' }) });
      return;
    }
    const d = doc.data();
    const odemeler = [...(d.odemeler || [])];
    if (odemeler[idx]?.odendi) {
      await fetch(`${API}/answerCallbackQuery`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callback_query_id: cb.id, text: 'Bu odeme zaten isareti.' }) });
      return;
    }
    odemeler[idx] = { ...odemeler[idx], odendi: true, odeme_tarihi: new Date().toISOString().slice(0,10) };
    await ref.update({ odemeler });
    await fetch(`${API}/editMessageReplyMarkup`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }) });
    await fetch(`${API}/answerCallbackQuery`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callback_query_id: cb.id, text: 'Odeme kaydedildi!' }) });
    await send(chatId, `Odeme alindi!\n${d.alici_adi} — ${odemeler[idx].tutar.toLocaleString('tr-TR')} TL`);
    return;
  }

  // Görevi iptal et (patron tarafından)
  if (data.startsWith('iptal_')) {
    const gorevId = data.replace('iptal_', '');
    const ref  = db.collection('gorevler').doc(gorevId);
    const doc  = await ref.get();
    if (!doc.exists) {
      await fetch(`${API}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: 'Görev bulunamadı.' })
      });
      return;
    }
    const g = doc.data();
    if (g.durum !== 'bekliyor') {
      await fetch(`${API}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: 'Bu görev zaten tamamlandı veya iptal edildi.' })
      });
      return;
    }
    await ref.update({ durum: 'iptal', iptalTarih: admin.firestore.Timestamp.now() });

    // Butonu kaldır
    await fetch(`${API}/editMessageReplyMarkup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } })
    });
    await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id, text: '❌ Görev iptal edildi.' })
    });

    // Atanan kişiye bildir
    if (g.atananChatId) {
      await send(g.atananChatId,
        `❌ GÖREV İPTAL EDİLDİ\n━━━━━━━━━━━━\n` +
        `📋 ${g.aciklama}\n\nPatron bu görevi iptal etti.`
      );
    }
  }
}

app.get('/', (_req, res) => res.send('Construction Bot calisiyor.'));

// Fotoğraf görüntüleme endpoint'i — dashboard için
app.get('/foto/:docId', async (req, res) => {
  try {
    const doc = await db.collection('is_takibi').doc(req.params.docId).get();
    if (!doc.exists) return res.status(404).send('Fotograf bulunamadi');
    const d = doc.data();
    // foto_yollar (yeni, array) veya foto_yol (eski, tekil) — ikisini de destekle
    const fotoYol = (Array.isArray(d.foto_yollar) && d.foto_yollar.length > 0)
      ? d.foto_yollar[0]
      : d.foto_yol;
    if (!fotoYol) return res.status(404).send('Fotograf bulunamadi');
    const resp = await fetch(`${DBX_API}/files/get_temporary_link`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${await dbxGetToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fotoYol })
    });
    if (!resp.ok) return res.status(500).send('Dropbox hatasi');
    const data = await resp.json();
    res.redirect(data.link);
  } catch(e) {
    res.status(500).send('Hata: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || '';

app.listen(PORT, async () => {
  console.log(`Bot calisiyor — port ${PORT}`);
  await kisileriYukle();
  await planYukle().catch(e => console.error('planYukle startup hata:', e.message));

  // Görev hatırlatıcıları — her 1 dakikada (kısa aralıklı görevler için)
  setInterval(async () => {
    await gorevHatirlaticilar();
  }, 1 * 60 * 1000);

  // Diğer periyodik kontroller — her 5 dakikada
  setInterval(async () => {
    await sabahOzetiKontrol();
    await onAltiOtuzHatirlatici();  // 16:30 TR — hatırlatma
    await onYediUyarisi();           // 17:00 TR — ağır uyarı
    await aksamHatirlatmaKontrol();  // 17:30 TR — son hatırlatma
    await haftalikRaporKontrol();    // Pazartesi 09:00 TR — patron+mudur
  }, 5 * 60 * 1000);

  // Patron'a bildirim: uyarılmayanlar uyarıldı (bir kez gönder)
  try {
    const bugunKey = `patron_uyarildi_${new Date().toISOString().slice(0, 10)}`;
    if (!(await bildirimGonderildiMi(bugunKey))) {
      await bildirimIsaretle(bugunKey);
      const patronId = Object.entries(USERS).find(([,u]) => u.role === 'patron')?.[0];
      if (patronId) {
        await send(patronId,
          `✅ Bilgi\n\nBugün iş girişi yapmayan personel uyarıldı.\n\nSaat 16:30 ve 17:00'da otomatik hatırlatma gidecek.`
        );
      }
    }
  } catch(e) { console.error('Patron bildirim hata:', e.message); }

  // Render keepalive — her 10 dakikada self-ping (free tier uyku önleme)
  if (RENDER_URL) {
    setInterval(() => {
      fetch(`${RENDER_URL}/`).catch(e => console.debug('keepalive ping hata:', e.message));
    }, 10 * 60 * 1000);
    console.log(`Keepalive aktif: ${RENDER_URL}`);
  }

  // Not: restart bildirimi kaldırıldı — Render sık restart'ta spam yapıyordu.

  // Telegram komut menüsünü kaydet (kullanıcı / yazınca görünür)
  try {
    await fetch(`${API}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start',          description: 'Ana menüyü aç' },
          { command: 'yardim',         description: 'Tüm komutları göster' },
          { command: 'h',              description: 'Hızlı iş kaydı (örn: /h Demir 8kişi 2ton 1.Kat)' },
          { command: 'ozet',           description: 'Şantiye özeti (admin)' },
          { command: 'gorev',          description: 'Görev ata (patron)' },
          { command: 'gorevlerim',     description: 'Aktif görevleri gör / iptal et' },
          { command: 'dropbox',        description: 'Şirket belgelerine eriş (patron)' },
          { command: 'satis',          description: 'Satis sozlesmeleri ve tahsilat (patron)' },
          { command: 'gecmistemizle',  description: 'AI konuşma geçmişini sıfırla (patron)' },
          { command: 'kayit',          description: 'Sisteme kayıt ol: /kayit Ad Soyad' },
        ]
      })
    });
    console.log('Telegram komut menüsü güncellendi.');
  } catch(e) {
    console.error('setMyCommands hata:', e.message);
  }
});

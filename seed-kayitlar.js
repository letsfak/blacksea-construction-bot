// node seed-kayitlar.js — example work log records for testing
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-kayitlar.js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function ts(gun, ay, yil, saat = 17) {
  return admin.firestore.Timestamp.fromDate(new Date(2000 + yil, ay - 1, gun, saat, 0, 0));
}

// Example work log entries — replace kullanici names with your team member names
const KAYITLAR = [
  { tarih: ts(1,1,26),  ekip: 'Demir Ekibi',       adam: 8,  imalat: 'Bodrum kolon demiri',    miktar: 2.4,  birim: 'ton',  mahal: '1. Bodrum',   aciklama: '',              kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(1,1,26),  ekip: 'Kalip Ekibi',        adam: 6,  imalat: 'Kolon kalıbı kurulum',   miktar: 120,  birim: 'm2',   mahal: '1. Bodrum',   aciklama: '',              kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(2,1,26),  ekip: 'Demir Ekibi',        adam: 8,  imalat: 'Kiriş demiri bağlama',   miktar: 1.8,  birim: 'ton',  mahal: '1. Bodrum',   aciklama: '',              kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(2,1,26),  ekip: 'Kalip Ekibi',        adam: 5,  imalat: 'Döşeme kalıbı',          miktar: 200,  birim: 'm2',   mahal: '1. Bodrum',   aciklama: '',              kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(2,1,26),  ekip: 'Mekanik Ekibi',      adam: 4,  imalat: 'Pis su borusu döşeme',   miktar: 45,   birim: 'mt',   mahal: '4. Bodrum',   aciklama: '',              kullanici: 'Şef 1', gorev_ad: 'Temiz ve Pis Su', santiye: 'site1' },
  { tarih: ts(3,1,26),  ekip: 'Demir Ekibi',        adam: 8,  imalat: 'Döşeme hasırı serme',    miktar: 350,  birim: 'm2',   mahal: '1. Bodrum',   aciklama: '',              kullanici: 'Şef 2', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(3,1,26),  ekip: 'Mekanik Ekibi',      adam: 4,  imalat: 'Temiz su borusu',        miktar: 30,   birim: 'mt',   mahal: '3. Bodrum',   aciklama: '',              kullanici: 'Şef 2', gorev_ad: 'Temiz ve Pis Su', santiye: 'site1' },
  { tarih: ts(3,1,26),  ekip: 'Elektrik Ekibi',     adam: 3,  imalat: 'Elektrik borusu döşeme', miktar: 80,   birim: 'mt',   mahal: '2. Bodrum',   aciklama: '',              kullanici: 'Şef 2', gorev_ad: 'Elektrik Boru ve Kablo', santiye: 'site1' },
  { tarih: ts(4,1,26),  ekip: 'Demir Ekibi',        adam: 8,  imalat: 'Beton dökümü hazırlık',  miktar: 1,    birim: 'adet', mahal: '1. Bodrum',   aciklama: 'Beton gelecek', kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(4,1,26),  ekip: 'Yardimci Elemanlar', adam: 5,  imalat: 'Şantiye temizliği',      miktar: 1,    birim: 'adet', mahal: 'Genel',       aciklama: '',              kullanici: 'Şef 1', gorev_ad: '', santiye: 'site1' },
];

async function seed() {
  const batch = db.batch();
  KAYITLAR.forEach(k => {
    const ref = db.collection('is_takibi').doc();
    batch.set(ref, k);
  });
  await batch.commit();
  console.log(`✅ ${KAYITLAR.length} örnek kayıt eklendi.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });

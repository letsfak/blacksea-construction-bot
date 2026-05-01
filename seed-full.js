// node seed-full.js — example material and daily note records
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-full.js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function ts(gun, ay, yil, saat = 17) {
  return admin.firestore.Timestamp.fromDate(new Date(2000 + yil, ay - 1, gun, saat, 0, 0));
}

// Example material deliveries — replace kullanici with your team member names
const MALZEME = [
  { tarih: ts(4,1,26,10), malzeme: 'Nervurlu demir Ø12',  miktar: 8.5,  birim: 'ton',  firma: 'Demir A.Ş.',  not: 'İrsaliye no: 4521, tam geldi',     kullanici: 'Şef 1', santiye: 'site1' },
  { tarih: ts(4,1,26,14), malzeme: 'Nervurlu demir Ø16',  miktar: 4.2,  birim: 'ton',  firma: 'Demir A.Ş.',  not: '',                                  kullanici: 'Şef 1', santiye: 'site1' },
  { tarih: ts(3,1,26,11), malzeme: 'Ahşap kalıp panosu',  miktar: 120,  birim: 'adet', firma: 'Kereste Ltd.', not: 'Bazı panolar çatlak, 8 adet iade', kullanici: 'Satinalma', santiye: 'site1' },
  { tarih: ts(2,1,26,9),  malzeme: 'Hazır beton C25',     miktar: 45,   birim: 'm3',   firma: 'Beton A.Ş.',  not: '2 miks, slamp 16cm, numune alındı',  kullanici: 'Satinalma', santiye: 'site1' },
  { tarih: ts(1,1,26,13), malzeme: 'Plastik boru Ø110',   miktar: 60,   birim: 'mt',   firma: 'Boru Ltd.',   not: '',                                  kullanici: 'Şef 1', santiye: 'site1' },
];

const NOTLAR = [
  { tarih: ts(4,1,26,18), not: 'Bugün 1. bodrum kolon demiri ve kalıbı tamamlandı. Yarın beton dökümü planlanıyor.', kullanici: 'Şef 1', santiye: 'site1' },
  { tarih: ts(3,1,26,18), not: 'Kalıp panosunun 8 adedi çatlak çıktı, iade edilecek. Elektrik ve mekanik ekibi borularını bitirdi.', kullanici: 'Satinalma', santiye: 'site1' },
  { tarih: ts(2,1,26,18), not: '2. bodrum döşeme betonu sorunsuz döküldü. Numuneler alındı.', kullanici: 'Şef 2', santiye: 'site1' },
];

async function seed() {
  let batch = db.batch();
  MALZEME.forEach(m => batch.set(db.collection('malzeme_takibi').doc(), m));
  await batch.commit();
  console.log(`✅ ${MALZEME.length} malzeme kaydı eklendi.`);

  batch = db.batch();
  NOTLAR.forEach(n => batch.set(db.collection('gunluk_notlar').doc(), n));
  await batch.commit();
  console.log(`✅ ${NOTLAR.length} günlük not eklendi.`);

  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });

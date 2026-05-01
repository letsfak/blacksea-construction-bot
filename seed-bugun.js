// node seed-bugun.js — adds sample records for today
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-bugun.js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function ts(saat) {
  const now = new Date();
  return admin.firestore.Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate(), saat, 0, 0));
}

// Example records for today — replace kullanici with your foreman's name
const KAYITLAR = [
  { tarih: ts(17), ekip: 'Demir Ekibi',       adam: 8, imalat: 'Kolon demiri bağlama', miktar: 2.1, birim: 'ton',  mahal: '1. Bodrum', aciklama: '', kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(17), ekip: 'Kalip Ekibi',        adam: 6, imalat: 'Kolon kalıbı montaj',  miktar: 140, birim: 'm2',   mahal: '1. Bodrum', aciklama: '', kullanici: 'Şef 1', gorev_ad: '1. Bodrum', santiye: 'site1' },
  { tarih: ts(17), ekip: 'Mekanik Ekibi',      adam: 3, imalat: 'Su borusu döşeme',     miktar: 20,  birim: 'mt',   mahal: '1. Bodrum', aciklama: '', kullanici: 'Şef 1', gorev_ad: 'Temiz ve Pis Su', santiye: 'site1' },
  { tarih: ts(17), ekip: 'Yardimci Elemanlar', adam: 4, imalat: 'Malzeme taşıma',       miktar: 1,   birim: 'adet', mahal: 'Genel',     aciklama: 'Demir taşındı', kullanici: 'Şef 1', gorev_ad: '', santiye: 'site1' },
];

async function seed() {
  const batch = db.batch();
  KAYITLAR.forEach(k => batch.set(db.collection('is_takibi').doc(), k));
  await batch.commit();
  console.log(`✅ ${KAYITLAR.length} kayıt eklendi (bugün).`);
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });

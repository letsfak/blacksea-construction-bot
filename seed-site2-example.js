// node seed-site2-example.js — example work plan for a completed building (repairs/finishing)
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-site2-example.js
// Rename this file + SANTIYE_ID below to match your own project sites.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function tarih(gun, ay, yil) {
  return admin.firestore.Timestamp.fromDate(new Date(2000 + yil, ay - 1, gun));
}

// Adjust SANTIYE_ID to match your site identifiers in index.js MAHAL_MAP
const SANTIYE_ID = 'site2';

const PLAN = [
  { kimlik: 1,  iky: 'S2-1.1', ad: 'A Blok Eksik Giderme',      kategori: 'Eksikler',   bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 2,  iky: 'S2-1.2', ad: 'B Blok Eksik Giderme',      kategori: 'Eksikler',   bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 3,  iky: 'S2-1.3', ad: 'C Blok Eksik Giderme',      kategori: 'Eksikler',   bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 4,  iky: 'S2-1.4', ad: 'D Blok Eksik Giderme',      kategori: 'Eksikler',   bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 5,  iky: 'S2-2.1', ad: 'Boya / Alçı Tamir',         kategori: 'İnce İşler', bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 6,  iky: 'S2-2.2', ad: 'Seramik / Zemin Tamir',     kategori: 'İnce İşler', bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 7,  iky: 'S2-2.3', ad: 'Doğrama / Kapı Tamir',      kategori: 'Doğrama',    bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 8,  iky: 'S2-3.1', ad: 'Elektrik Arıza / Eksik',    kategori: 'Elektrik',   bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 9,  iky: 'S2-4.1', ad: 'Sıhhi Tesisat Arıza',       kategori: 'Mekanik',    bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:10,  iky: 'S2-5.1', ad: 'Dış Cephe Tamir',           kategori: 'Dış Cephe',  bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:11,  iky: 'S2-6.1', ad: 'Ortak Alan Düzenleme',      kategori: 'Ortak Alan',  bas: tarih(1,1,26),  bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:12,  iky: 'S2-6.2', ad: 'Peyzaj / Çevre Düzenleme',  kategori: 'Ortak Alan',  bas: tarih(1,1,26),  bit: tarih(30,7,26), ilerleme: 0, santiye: SANTIYE_ID },
];

async function seed() {
  console.log(`${SANTIYE_ID} planı yükleniyor: ${PLAN.length} görev...`);
  const batch = db.batch();
  for (const gorev of PLAN) {
    const ref = db.collection('is_plani').doc(`${SANTIYE_ID}-${gorev.kimlik}`);
    batch.set(ref, gorev);
  }
  await batch.commit();
  console.log(`✅ ${SANTIYE_ID} planı Firestore'a yüklendi.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });

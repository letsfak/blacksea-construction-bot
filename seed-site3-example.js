// node seed-site3-example.js — example work plan for a villa site
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-site3-example.js
// Rename this file + SANTIYE_ID below to match your own project sites.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function tarih(gun, ay, yil) {
  return admin.firestore.Timestamp.fromDate(new Date(2000 + yil, ay - 1, gun));
}

const SANTIYE_ID = 'site3';

const PLAN = [
  { kimlik: 1, iky: 'S3-1.1', ad: 'Villa 1 İşleri',    kategori: 'Eksikler', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 2, iky: 'S3-1.2', ad: 'Villa 2 İşleri',    kategori: 'Eksikler', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 3, iky: 'S3-1.3', ad: 'Villa 3 İşleri',    kategori: 'Eksikler', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 4, iky: 'S3-1.4', ad: 'Villa 4 İşleri',    kategori: 'Eksikler', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 5, iky: 'S3-1.5', ad: 'Villa 5 İşleri',    kategori: 'Eksikler', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 6, iky: 'S3-2.1', ad: 'Altyapı / Dış Saha',kategori: 'Ortak Alan', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 7, iky: 'S3-2.2', ad: 'Peyzaj / Çevre',    kategori: 'Ortak Alan', bas: tarih(1,1,26), bit: tarih(30,7,26), ilerleme: 0, santiye: SANTIYE_ID },
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

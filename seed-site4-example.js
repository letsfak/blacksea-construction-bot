// node seed-site4-example.js — example work plan for an infrastructure/repair site (e.g. airport)
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-site4-example.js
// Rename this file + SANTIYE_ID below to match your own project sites.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function tarih(gun, ay, yil) {
  return admin.firestore.Timestamp.fromDate(new Date(2000 + yil, ay - 1, gun));
}

const SANTIYE_ID = 'site4';

const PLAN = [
  // Disabled ramp works
  { kimlik:  1, iky: 'S4-1.1', ad: 'Ramp - Kalıp',              kategori: 'Kaba İşler',    bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  2, iky: 'S4-1.2', ad: 'Ramp - Demir',              kategori: 'Kaba İşler',    bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  3, iky: 'S4-1.3', ad: 'Ramp - Beton Dökümü',       kategori: 'Kaba İşler',    bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  4, iky: 'S4-1.4', ad: 'Ramp - Sıva',               kategori: 'İnce İşler',    bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  5, iky: 'S4-1.5', ad: 'Ramp - Zemin Kaplama',      kategori: 'Zemin Kaplama', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  6, iky: 'S4-1.6', ad: 'Ramp - Korkuluklar',        kategori: 'Korkuluklar',   bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  // General works
  { kimlik:  7, iky: 'S4-2.1', ad: 'Döşeme Betonu',             kategori: 'Kaba İşler',    bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  8, iky: 'S4-2.2', ad: 'Döşeme Kaplama',            kategori: 'Zemin Kaplama', bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik:  9, iky: 'S4-3.1', ad: 'Elektrik Hattı',            kategori: 'Elektrik',      bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 10, iky: 'S4-3.2', ad: 'Dış Cephe Kaplama',         kategori: 'Dış Cephe',     bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 11, iky: 'S4-4.1', ad: 'Ek Bina İçi - Fancoil',    kategori: 'Mekanik',       bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 12, iky: 'S4-4.2', ad: 'Ek Bina İçi - Elektrik',   kategori: 'Elektrik',      bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 13, iky: 'S4-5.1', ad: 'İç Kapılar',               kategori: 'Kapılar',       bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
  { kimlik: 14, iky: 'S4-5.2', ad: 'Duvar Onarımları',          kategori: 'Kaba İşler',    bas: tarih(1,1,26), bit: tarih(30,6,26), ilerleme: 0, santiye: SANTIYE_ID },
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

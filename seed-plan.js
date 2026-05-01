// node seed-plan.js — seeds example work plan for site1 (multi-floor construction)
// Usage: FIREBASE_CREDENTIALS=$(cat service-account.json | tr -d '\n') node seed-plan.js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)) });
const db = admin.firestore();

function tarih(gun, ay, yil) {
  return admin.firestore.Timestamp.fromDate(new Date(2000 + yil, ay - 1, gun));
}

// Example work plan — adjust dates and tasks to your project schedule
const PLAN = [
  { kimlik:1,  iky:'S1-1.1',    ad:'Mobilizasyon',          kategori:'Genel',        sure:2,   bas:tarih(1,1,26),  bit:tarih(2,1,26),   oncul:[],   ozet:false, santiye:'site1' },
  { kimlik:2,  iky:'S1-1.2',    ad:'Hafriyat',              kategori:'Genel',        sure:60,  bas:tarih(1,1,26),  bit:tarih(1,3,26),   oncul:[],   ozet:false, santiye:'site1' },
  { kimlik:3,  iky:'S1-1.3',    ad:'Temel',                 kategori:'Kaba İşler',   sure:15,  bas:tarih(2,3,26),  bit:tarih(17,3,26),  oncul:[2],  ozet:false, santiye:'site1' },
  { kimlik:4,  iky:'S1-1.4',    ad:'1. Bodrum',             kategori:'Kaba İşler',   sure:20,  bas:tarih(18,3,26), bit:tarih(7,4,26),   oncul:[3],  ozet:false, santiye:'site1' },
  { kimlik:5,  iky:'S1-1.5',    ad:'Zemin Kat',             kategori:'Kaba İşler',   sure:20,  bas:tarih(8,4,26),  bit:tarih(28,4,26),  oncul:[4],  ozet:false, santiye:'site1' },
  { kimlik:6,  iky:'S1-1.6',    ad:'1. Kat',                kategori:'Kaba İşler',   sure:20,  bas:tarih(29,4,26), bit:tarih(19,5,26),  oncul:[5],  ozet:false, santiye:'site1' },
  { kimlik:7,  iky:'S1-1.7',    ad:'2. Kat',                kategori:'Kaba İşler',   sure:20,  bas:tarih(20,5,26), bit:tarih(9,6,26),   oncul:[6],  ozet:false, santiye:'site1' },
  { kimlik:8,  iky:'S1-1.8',    ad:'Çatı',                  kategori:'Kaba İşler',   sure:10,  bas:tarih(10,6,26), bit:tarih(20,6,26),  oncul:[7],  ozet:false, santiye:'site1' },
  { kimlik:9,  iky:'S1-2.1',    ad:'Elektrik Boru ve Kablo',kategori:'Elektrik',     sure:80,  bas:tarih(1,4,26),  bit:tarih(1,7,26),   oncul:[],   ozet:false, santiye:'site1' },
  { kimlik:10, iky:'S1-2.2',    ad:'Temiz ve Pis Su',       kategori:'Mekanik',      sure:50,  bas:tarih(1,4,26),  bit:tarih(20,5,26),  oncul:[],   ozet:false, santiye:'site1' },
  { kimlik:11, iky:'S1-3.1',    ad:'Kaba Sıva',             kategori:'İnce İşler',   sure:12,  bas:tarih(21,6,26), bit:tarih(3,7,26),   oncul:[8],  ozet:false, santiye:'site1' },
  { kimlik:12, iky:'S1-3.2',    ad:'Doğramalar',            kategori:'Doğrama',      sure:14,  bas:tarih(4,7,26),  bit:tarih(18,7,26),  oncul:[11], ozet:false, santiye:'site1' },
  { kimlik:13, iky:'S1-3.3',    ad:'Seramik / Zemin',       kategori:'Seramik',      sure:20,  bas:tarih(19,7,26), bit:tarih(8,8,26),   oncul:[12], ozet:false, santiye:'site1' },
];

async function seed() {
  console.log(`Site 1 planı yükleniyor: ${PLAN.length} görev...`);
  const batch = db.batch();
  for (const gorev of PLAN) {
    const ref = db.collection('is_plani').doc(`site1-${gorev.kimlik}`);
    batch.set(ref, gorev);
  }
  await batch.commit();
  console.log('✅ Site 1 iş planı Firestore\'a yüklendi.');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });

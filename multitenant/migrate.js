/**
 * Migration script — hardcoded sistem → multi-tenant Firestore
 *
 * KULLANIM (DRY RUN):
 *   node migrate.js          (default DRY_RUN=true, simülasyon)
 *
 * KULLANIM (GERÇEK):
 *   DRY_RUN=false node migrate.js   (Admin onayı ile ÇALIŞTIR)
 *
 * Adımlar:
 *   1. Firma oluştur (firmalar koleksiyonu)
 *   2. Hardcoded USERS → kullanicilar koleksiyonu
 *   3. MAHAL_MAP → santiyeler koleksiyonu
 *   4. Tüm mevcut koleksiyonlara firma_id ekle (batch update)
 *   5. Composite index requirements'ı listele (manuel oluşturulacak)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// DRY_RUN modu — gerçek yazım yok
const DRY_RUN = process.env.DRY_RUN !== 'false';

if (DRY_RUN) {
  console.log('='.repeat(70));
  console.log('DRY RUN MODE — Hiçbir veri yazılmayacak. Sadece planlama gösterilecek.');
  console.log('='.repeat(70));
  console.log();
}

// Firebase init
let db;
try {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_CREDENTIALS)
    )
  });
  db = admin.firestore();
} catch (e) {
  console.error('Firebase init hatası:', e.message);
  console.error('Lutfen FIREBASE_CREDENTIALS env var ini ayarla');
  process.exit(1);
}

// Mevcut sistem (index.js ile senkron tutun — USERS ile aynı olmalı)
// IMPORTANT: Replace these placeholder IDs with your actual team members.
const USERS = {
  'YOUR_ADMIN_CHAT_ID':     { name: 'Admin',       role: 'admin',     santiye: 'site1'     },
  'YOUR_SATINALMA_CHAT_ID': { name: 'Satinalma',   role: 'satinalma', santiye: 'hepsi'     },
  'YOUR_PATRON_CHAT_ID':    { name: 'Patron',       role: 'patron',    santiye: 'hepsi'     },
  'YOUR_SEF1_CHAT_ID':      { name: 'Şef 1',       role: 'sef',       santiye: 'site2'     },
  'YOUR_SEF2_CHAT_ID':      { name: 'Şef 2',       role: 'sef',       santiye: 'site3'     },
  'YOUR_MUDUR_CHAT_ID':     { name: 'Müdür',        role: 'mudur',     santiye: 'site4'     },
};

const MAHAL_MAP = {
  site1: [
    '1. Bodrum', '2. Bodrum', 'Zemin Kat', '1. Kat', '2. Kat',
    '3. Kat', '4. Kat', 'Çatı', 'Genel / Dış Saha'
  ],
  site2: [
    'A Blok - Zemin', 'A Blok - 1. Kat', 'A Blok - 2. Kat',
    'A Blok - 3. Kat', 'A Blok - 4. Kat', 'A Blok - 5. Kat',
    'A Blok - Dublex (6-7.Kat)',
    'B Blok - Zemin', 'B Blok - 1. Kat', 'B Blok - 2. Kat',
    'B Blok - 3. Kat', 'B Blok - 4. Kat', 'B Blok - 5. Kat',
    'B Blok - Dublex (6-7.Kat)',
    'C Blok - Zemin', 'C Blok - 1. Kat', 'C Blok - 2. Kat',
    'C Blok - 3. Kat', 'C Blok - 4. Kat', 'C Blok - 5. Kat',
    'C Blok - Dublex (6-7.Kat)',
    'D Blok - Zemin', 'D Blok - 1. Kat', 'D Blok - 2. Kat',
    'D Blok - 3. Kat', 'D Blok - 4. Kat', 'D Blok - 5. Kat',
    'D Blok - Dublex (6-7.Kat)',
    'Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5',
    'Villa 6', 'Villa 7', 'Villa 8', 'Villa 9', 'Villa 10',
    'Villa 11', 'Villa 12', 'Villa 13', 'Villa 14', 'Villa 15',
    'Villa 16', 'Villa 17',
    'Genel / Dış Saha'
  ],
  site3: [
    'Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5',
    'Genel / Dış Saha'
  ],
  site4: [
    'Engelli Rampası', 'Merdiven', 'Ek Bina', 'Teknik Blok',
    'Operasyon Binası', 'Genel / Dış Saha'
  ]
};

// Set this to your company slug (lowercase, no spaces)
const DEFAULT_FIRMA_ID = 'your-company-slug';
const COLLECTIONS_TO_ADD_FIRMA_ID = [
  'is_takibi',
  'malzeme_takibi',
  'santiye_stoku',
  'depo_hareketleri',
  'is_plani',
  'gorevler',
  'kisiler',
  'agent_memory',
  'ai_gecmis',
  'gunluk_notlar',
  'sozlesmeler',
  'siparisler',
  'sevkiyatlar'
];

async function main() {
  try {
    console.log('ADIM 1: Firma oluştur');
    console.log('-'.repeat(70));

    const firmaData = {
      firma_id: DEFAULT_FIRMA_ID,
      ad: 'Your Company Name',
      durum: 'aktif',
      plan: 'enterprise',
      sahip: {
        telegram_id: 'YOUR_PATRON_CHAT_ID',
        isim: 'Patron'
      },
      ozellikler: {
        santiye_limiti: 10,
        kullanici_limiti: 50,
        ai_chatbot: true
      },
      olusturma_tarihi: new Date().toISOString()
    };

    console.log('Oluşturulacak firma:', JSON.stringify(firmaData, null, 2));

    if (!DRY_RUN) {
      await db.collection('firmalar').doc(DEFAULT_FIRMA_ID).set(firmaData);
      console.log('✓ Firma oluşturuldu');
    } else {
      console.log('(DRY RUN) Yazılacak');
    }
    console.log();

    // ADIM 2
    console.log('ADIM 2: Hardcoded USERS → kullanicilar koleksiyonu');
    console.log('-'.repeat(70));

    const userMigrations = Object.entries(USERS).map(([telegramId, userData]) => ({
      telegram_id: telegramId,
      firma_id: DEFAULT_FIRMA_ID,
      isim: userData.name,
      rol: userData.role,
      santiye_id: userData.santiye !== 'hepsi' ? userData.santiye : null,
      izinler: {
        is_kayit: true,
        malzeme_kayit: true,
        ai_sohbet: true
      },
      durum: 'aktif',
      created_at: new Date().toISOString()
    }));

    console.log(`${userMigrations.length} kullanıcı migrate edilecek:`);
    userMigrations.forEach(u => {
      console.log(`  ${u.telegram_id}: ${u.isim} (${u.rol})`);
    });

    if (!DRY_RUN) {
      for (const user of userMigrations) {
        await db.collection('kullanicilar').doc(user.telegram_id).set(user);
      }
      console.log(`✓ ${userMigrations.length} kullanıcı oluşturuldu`);
    } else {
      console.log('(DRY RUN) Yazılacak');
    }
    console.log();

    // ADIM 3
    console.log('ADIM 3: MAHAL_MAP → santiyeler koleksiyonu');
    console.log('-'.repeat(70));

    const santiyeMigrations = [];
    for (const [santiyeId, mahallar] of Object.entries(MAHAL_MAP)) {
      const docId = `${DEFAULT_FIRMA_ID}#${santiyeId}`;
      const sefi = null; // Set to site foreman chat ID if needed

      const santiyeData = {
        id: docId,
        firma_id: DEFAULT_FIRMA_ID,
        santiye_id: santiyeId,
        ad: `${santiyeId.toUpperCase()} Şantiyesi`,
        sefi,
        mahallar,
        durum: 'aktif',
        olusturma_tarihi: new Date().toISOString()
      };

      santiyeMigrations.push(santiyeData);
      console.log(`  ${santiyeId}: ${mahallar.length} mahalle`);
    }

    if (!DRY_RUN) {
      for (const santiye of santiyeMigrations) {
        await db.collection('santiyeler').doc(santiye.id).set(santiye);
      }
      console.log(`✓ ${santiyeMigrations.length} şantiye oluşturuldu`);
    } else {
      console.log('(DRY RUN) Yazılacak');
    }
    console.log();

    // ADIM 4
    console.log('ADIM 4: Tüm mevcut koleksiyonlara firma_id ekle');
    console.log('-'.repeat(70));

    for (const collectionName of COLLECTIONS_TO_ADD_FIRMA_ID) {
      const snap = await db.collection(collectionName).get();
      const docCount = snap.size;

      console.log(`  ${collectionName}: ${docCount} doküman`);

      if (!DRY_RUN && docCount > 0) {
        const batch = db.batch();
        let batchSize = 0;

        snap.docs.forEach(doc => {
          const data = doc.data();
          // Eğer firma_id yoksa ekle
          if (!data.firma_id) {
            batch.update(doc.ref, {
              firma_id: DEFAULT_FIRMA_ID,
              migrated_at: new Date().toISOString()
            });
            batchSize++;
          }
        });

        if (batchSize > 0) {
          await batch.commit();
          console.log(`    ✓ ${batchSize} doküman güncellendi`);
        } else {
          console.log(`    (hepsi zaten firma_id'si var)`);
        }
      } else if (DRY_RUN && docCount > 0) {
        console.log(`    (DRY RUN) ${docCount} doküman güncellenecek`);
      }
    }
    console.log();

    // ADIM 5
    console.log('ADIM 5: Firestore Composite Index gereksinimler');
    console.log('-'.repeat(70));
    console.log(`
Lütfen Firebase Console → Firestore → Indexes adresinde aşağıdaki
indeks'leri manuel olarak oluştur (otomatik oluşturma yapamıyoruz):

is_takibi:
  Fields: firma_id (Ascending), santiye (Ascending), tarih (Descending)

malzeme_takibi:
  Fields: firma_id (Ascending), tarih (Descending)

santiye_stoku:
  Fields: firma_id (Ascending), santiye (Ascending)

gorevler:
  Fields: firma_id (Ascending), durum (Ascending)

agent_memory:
  Fields: firma_id (Ascending), chatId (Ascending), createdAt (Descending)

Çoğu index 30 dakika - 2 saat içinde oluşur. Oluştuktan sonra
Faz B'ye geçebilirsin.
    `);

    console.log();
    console.log('='.repeat(70));
    if (DRY_RUN) {
      console.log('✓ DRY RUN BAŞARIYLA TAMAMLANDI');
      console.log();
      console.log('Gerçek migration için:');
      console.log('  DRY_RUN=false node migrate.js');
      console.log();
      console.log('UYARI: Migration sonrasinda:');
      console.log('  1. index.js e tek satir ekle: const mt = require(\'./multitenant/compat.js\');');
      console.log('  2. Render a deploy et (git push)');
      console.log('  3. Firestore composite indexleri olustur (Console)');
      console.log('  4. Faz B: /kurulum komutu aktive et');
    } else {
      console.log('MIGRATION BASARIYLA TAMAMLANDI');
      console.log();
      console.log('Sonraki adimlar:');
      console.log('  1. index.js e tek satir ekle: const mt = require(\'./multitenant/compat.js\');');
      console.log('     mt.initCompat(USERS);');
      console.log('  2. git add + commit + push (Render auto-deploy)');
      console.log('  3. Firebase Console - Firestore - Indexes: Composite indexleri olustur');
      console.log('  4. 2-3 saat sonra Faz B baslat');
    }
    console.log('='.repeat(70));

  } catch (error) {
    console.error('HATA:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();

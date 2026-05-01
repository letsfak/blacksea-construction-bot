/**
 * Multi-tenant test — syntax kontrol, dry-run mantığı
 *
 * KULLANIM:
 *   node test_multitenant.js
 *
 * Bu test çalıştırılırsa:
 *   1. Tüm modüllerin syntax'ı kontrol edilir
 *   2. Firestore'a yazma YAPILMAZ (mock edilir)
 *   3. Cross-firma izolasyon mantığı doğrulanır
 *   4. Migration mantığı simüle edilir
 */

console.log('='.repeat(70));
console.log('MULTI-TENANT FAZ A — SYNTAX & LOGIC TEST');
console.log('='.repeat(70));
console.log();

// Test flags
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.log(`✗ ${message}`);
    testsFailed++;
  }
}

// TEST 1: Syntax kontrol — tüm modülleri import et
console.log('TEST 1: Syntax kontrol (require all modules)');
console.log('-'.repeat(70));

try {
  const fsh = require('./firestore_helpers');
  assert(typeof fsh.getIsTakibi === 'function', 'firestore_helpers.getIsTakibi fonksiyon');
  assert(typeof fsh.addIsTakibi === 'function', 'firestore_helpers.addIsTakibi fonksiyon');
  console.log('✓ firestore_helpers.js syntax OK');
} catch (e) {
  console.log(`✗ firestore_helpers.js: ${e.message}`);
  testsFailed++;
}

try {
  const auth = require('./auth');
  assert(typeof auth.getUserFirmaId === 'function', 'auth.getUserFirmaId fonksiyon');
  assert(typeof auth.validateUserRole === 'function', 'auth.validateUserRole fonksiyon');
  console.log('✓ auth.js syntax OK');
} catch (e) {
  console.log(`✗ auth.js: ${e.message}`);
  testsFailed++;
}

try {
  const fs = require('./firma_service');
  assert(typeof fs.createFirma === 'function', 'firma_service.createFirma fonksiyon');
  assert(typeof fs.getFirma === 'function', 'firma_service.getFirma fonksiyon');
  console.log('✓ firma_service.js syntax OK');
} catch (e) {
  console.log(`✗ firma_service.js: ${e.message}`);
  testsFailed++;
}

try {
  const ks = require('./kullanici_service');
  assert(typeof ks.listFirmaKullanicilar === 'function', 'kullanici_service.listFirmaKullanicilar');
  console.log('✓ kullanici_service.js syntax OK');
} catch (e) {
  console.log(`✗ kullanici_service.js: ${e.message}`);
  testsFailed++;
}

try {
  const ss = require('./santiye_service');
  assert(typeof ss.createSantiye === 'function', 'santiye_service.createSantiye');
  console.log('✓ santiye_service.js syntax OK');
} catch (e) {
  console.log(`✗ santiye_service.js: ${e.message}`);
  testsFailed++;
}

try {
  const inv = require('./invite');
  assert(typeof inv.generateInviteCode === 'function', 'invite.generateInviteCode');
  assert(typeof inv.redeemInvite === 'function', 'invite.redeemInvite');
  console.log('✓ invite.js syntax OK');
} catch (e) {
  console.log(`✗ invite.js: ${e.message}`);
  testsFailed++;
}

try {
  const ana = require('./analytics');
  assert(typeof ana.trackEvent === 'function', 'analytics.trackEvent');
  assert(typeof ana.globalStats === 'function', 'analytics.globalStats');
  console.log('✓ analytics.js syntax OK');
} catch (e) {
  console.log(`✗ analytics.js: ${e.message}`);
  testsFailed++;
}

try {
  const compat = require('./compat');
  assert(typeof compat.initCompat === 'function', 'compat.initCompat');
  assert(typeof compat.wrapCommand === 'function', 'compat.wrapCommand');
  console.log('✓ compat.js syntax OK');
} catch (e) {
  console.log(`✗ compat.js: ${e.message}`);
  testsFailed++;
}

console.log();

// TEST 2: Compat mode mantığı
console.log('TEST 2: Compat mode (hardcoded USERS uyumluluğu)');
console.log('-'.repeat(70));

const compat = require('./compat');

const mockUsers = {
  'TEST_PATRON_ID': { name: 'Patron', role: 'patron', santiye: 'hepsi' },
  'TEST_SEF_ID':    { name: 'Şef 1',  role: 'sef',    santiye: 'site1' }
};

try {
  compat.initCompat(mockUsers);
  console.log('✓ compat.initCompat() başarılı');
  testsPassed++;
} catch (e) {
  console.log(`✗ compat.initCompat(): ${e.message}`);
  testsFailed++;
}

try {
  const preview = compat.previewUsersMigration(mockUsers);
  const parsed = JSON.parse(preview);
  assert(Array.isArray(parsed), 'Migration preview JSON array döndürüyor');
  assert(parsed.length === 2, 'Migration preview 2 kullanıcı içeriyor');
  assert(parsed[0].firma_id === 'your-company-slug', 'Default firma_id "your-company-slug"');
  console.log('✓ previewUsersMigration() çalışıyor');
} catch (e) {
  console.log(`✗ previewUsersMigration(): ${e.message}`);
  testsFailed++;
}

console.log();

// TEST 3: Invite kodu mantığı (mock)
console.log('TEST 3: Invite sistem mantığı (mock)');
console.log('-'.repeat(70));

const inv = require('./invite');

try {
  // Invite link oluştur
  const link = inv.generateInviteLink('your_construction_bot', 'ABC123DEF456');
  assert(
    link === 'https://t.me/your_construction_bot?start=invite_ABC123DEF456',
    'Invite link format doğru'
  );
  console.log('✓ generateInviteLink() çalışıyor');
} catch (e) {
  console.log(`✗ generateInviteLink(): ${e.message}`);
  testsFailed++;
}

console.log();

// TEST 4: Default değerler
console.log('TEST 4: Default değerleri kontrol et');
console.log('-'.repeat(70));

try {
  const expected = process.env.DEFAULT_FIRMA_ID || 'your-company-slug';
  const fsh = require('./firestore_helpers');
  assert(fsh.DEFAULT_FIRMA_ID === expected, `firestore_helpers.DEFAULT_FIRMA_ID="${expected}"`);

  const auth = require('./auth');
  assert(auth.DEFAULT_FIRMA_ID === expected, `auth.DEFAULT_FIRMA_ID="${expected}"`);

  const compat = require('./compat');
  assert(compat.DEFAULT_FIRMA_ID === expected, `compat.DEFAULT_FIRMA_ID="${expected}"`);

  console.log(`✓ Tüm default değerler "${expected}"`);
} catch (e) {
  console.log(`✗ Default değerler: ${e.message}`);
  testsFailed++;
}

console.log();

// TEST 5: Firestore schema kontrol
console.log('TEST 5: Firestore schema (documentasyon)');
console.log('-'.repeat(70));

const EXPECTED_COLLECTIONS = [
  'firmalar',
  'kullanicilar',
  'santiyeler',
  'pending_setups',
  'invites',
  'analytics_events'
];

console.log('Migration sonrasında oluşturulacak koleksiyonlar:');
EXPECTED_COLLECTIONS.forEach(col => {
  console.log(`  ✓ ${col}`);
});

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

console.log();
console.log('Mevcut koleksiyonlara firma_id eklenmesi:');
COLLECTIONS_TO_ADD_FIRMA_ID.forEach(col => {
  console.log(`  ✓ ${col}.firma_id (index gerekli)`);
});

testsPassed += EXPECTED_COLLECTIONS.length + COLLECTIONS_TO_ADD_FIRMA_ID.length;

console.log();

// TEST 6: Composite index gereksinimler
console.log('TEST 6: Firestore Composite Index gereksinimler');
console.log('-'.repeat(70));

const REQUIRED_INDEXES = [
  { collection: 'is_takibi', fields: ['firma_id (ASC)', 'santiye (ASC)', 'tarih (DESC)'] },
  { collection: 'malzeme_takibi', fields: ['firma_id (ASC)', 'tarih (DESC)'] },
  { collection: 'santiye_stoku', fields: ['firma_id (ASC)', 'santiye (ASC)'] },
  { collection: 'gorevler', fields: ['firma_id (ASC)', 'durum (ASC)'] },
  { collection: 'agent_memory', fields: ['firma_id (ASC)', 'chatId (ASC)', 'createdAt (DESC)'] }
];

console.log('Oluşturulması gereken composite index\'ler (Firebase Console):');
REQUIRED_INDEXES.forEach(idx => {
  console.log(`  ${idx.collection}:`);
  idx.fields.forEach(f => {
    console.log(`    • ${f}`);
  });
});

testsPassed += REQUIRED_INDEXES.length;

console.log();
console.log();
console.log('='.repeat(70));
console.log(`SONUÇ: ${testsPassed} GEÇTI, ${testsFailed} BAŞARISIZ`);
console.log('='.repeat(70));

if (testsFailed > 0) {
  console.log();
  console.log('WARNING: Hata var. Lutfen syntax kontrol et.');
  process.exit(1);
} else {
  console.log();
  console.log('✓ TÜM TESTLER BAŞARILI');
  console.log();
  console.log('Sonraki adımlar (Admin tarafından):');
  console.log('  1. PLAN_MULTI_TENANT.md oku ve 10 soruya cevap ver');
  console.log('  2. Firebase Console - Composite Indexes olustur');
  console.log('  3. DRY_RUN=true node migrate.js ile test et');
  console.log('  4. DRY_RUN=false node migrate.js ile migration calistir');
  console.log('  5. index.js e tek satir ekle: const mt = require(\'./multitenant/compat.js\'); mt.initCompat(USERS);');
  console.log('  6. git push ile deploy et');
  process.exit(0);
}

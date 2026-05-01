/**
 * Syntax-only test — Firebase'e ihtiyaç yok
 * Sadece modüllerin yüklenip yüklenmediklerini kontrol et
 */

console.log('='.repeat(70));
console.log('MULTI-TENANT FAZ A — SYNTAX-ONLY TEST');
console.log('='.repeat(70));
console.log();

let passed = 0;
let failed = 0;

function testModule(name, path) {
  try {
    require(path);
    console.log(`✓ ${name}`);
    passed++;
    return true;
  } catch (e) {
    // Firebase init hatası beklenen — sadece syntax hatalarını yakala
    if (e.message.includes('Firebase app does not exist')) {
      console.log(`✓ ${name} (syntax OK, Firebase init deferred)`);
      passed++;
      return true;
    }
    console.log(`✗ ${name}: ${e.message.split('\n')[0]}`);
    failed++;
    return false;
  }
}

console.log('Modülleri yükle:');
console.log('-'.repeat(70));

testModule('firestore_helpers.js', './firestore_helpers');
testModule('auth.js', './auth');
testModule('firma_service.js', './firma_service');
testModule('kullanici_service.js', './kullanici_service');
testModule('santiye_service.js', './santiye_service');
testModule('invite.js', './invite');
testModule('analytics.js', './analytics');
testModule('compat.js', './compat');

console.log();
console.log('='.repeat(70));
console.log(`RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(70));

console.log();
if (failed === 0) {
  console.log('✓ ALL MODULES LOADED SUCCESSFULLY (SYNTAX OK)');
  console.log();
  console.log('Firestore integration tests:');
  console.log('  - Migration script: DRY_RUN=true node migrate.js (test et, geçek çalıştırma)');
  console.log('  - Integration tests: Jest/Mocha ile (gelecekte)');
  console.log();
  process.exit(0);
} else {
  console.log('✗ MODULE LOAD ERRORS');
  process.exit(1);
}

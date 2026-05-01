/**
 * Onboarding wizard testleri — Firestore'u mock'la, state machine'i test et
 *
 * KULLANIM:
 *   node multitenant/test_onboarding.js
 *
 * Hiçbir Firestore/Telegram çağrısı yapmaz, in-memory mock kullanır.
 */

const Module = require('module');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────
// Mock: firebase-admin
// ──────────────────────────────────────────────────────────────────────────
const _firestoreData = {
  pending_setups: {},
  firmalar: {},
  kullanicilar: {},
  santiyeler: {},
  invites: {}
};

function makeDocRef(coll, id) {
  return {
    async get() {
      const exists = _firestoreData[coll] && _firestoreData[coll][id] !== undefined;
      const data = exists ? _firestoreData[coll][id] : null;
      return {
        exists,
        data: () => data
      };
    },
    async set(d) {
      if (!_firestoreData[coll]) _firestoreData[coll] = {};
      _firestoreData[coll][id] = JSON.parse(JSON.stringify(d));
    },
    async update(d) {
      if (!_firestoreData[coll]) _firestoreData[coll] = {};
      _firestoreData[coll][id] = { ...(_firestoreData[coll][id] || {}), ...JSON.parse(JSON.stringify(d)) };
    },
    async delete() {
      if (_firestoreData[coll]) delete _firestoreData[coll][id];
    }
  };
}

function makeQuery(coll) {
  let filters = [];
  let _limit = null;
  const q = {
    where(field, op, value) { filters.push([field, op, value]); return q; },
    limit(n) { _limit = n; return q; },
    async get() {
      const items = Object.entries(_firestoreData[coll] || {}).map(([id, d]) => ({ id, data: () => d, ref: makeDocRef(coll, id) }));
      let filtered = items.filter(it => {
        return filters.every(([f, op, v]) => {
          const val = it.data()[f];
          if (op === '==') return val === v;
          if (op === '<')  return val < v;
          if (op === '>=') return val >= v;
          if (op === '<=') return val <= v;
          return false;
        });
      });
      if (_limit) filtered = filtered.slice(0, _limit);
      return {
        empty: filtered.length === 0,
        size: filtered.length,
        docs: filtered
      };
    }
  };
  return q;
}

function makeDb() {
  return {
    collection(coll) {
      return {
        doc(id) { return makeDocRef(coll, id); },
        where(...args)  { return makeQuery(coll).where(...args); },
        async get()      { return makeQuery(coll).get(); },
        limit(n)         { return makeQuery(coll).limit(n); }
      };
    },
    batch() {
      return {
        delete() {},
        async commit() {}
      };
    }
  };
}

const mockAdmin = {
  initializeApp() {},
  credential: { cert: () => ({}) },
  firestore: () => makeDb(),
  apps: []
};

// ──────────────────────────────────────────────────────────────────────────
// Mock: node-fetch (Telegram API)
// ──────────────────────────────────────────────────────────────────────────
const _telegramCalls = [];
async function mockFetch(url, opts) {
  _telegramCalls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
  return { ok: true, status: 200, async text() { return '{}'; } };
}

// ──────────────────────────────────────────────────────────────────────────
// Module loader override
// ──────────────────────────────────────────────────────────────────────────
const _origResolve = Module._resolveFilename;
const _origLoad = Module._load;

Module._load = function(request, parent, ...rest) {
  if (request === 'firebase-admin') return mockAdmin;
  if (request === 'node-fetch') return mockFetch;
  return _origLoad(request, parent, ...rest);
};

// ──────────────────────────────────────────────────────────────────────────
// Test runner
// ──────────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    console.log(`✓ ${name}`);
    passed++;
  }).catch(e => {
    console.log(`✗ ${name}: ${e.message}`);
    failed++;
    failures.push({ name, error: e.message, stack: e.stack });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function resetData() {
  for (const k of Object.keys(_firestoreData)) {
    _firestoreData[k] = {};
  }
  _telegramCalls.length = 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Setup mocked send + onboarding init
// ──────────────────────────────────────────────────────────────────────────
const _sentMessages = [];
async function mockSend(chatId, text) {
  _sentMessages.push({ chatId: String(chatId), text });
}
function lastMessage(chatId) {
  const msgs = _sentMessages.filter(m => m.chatId === String(chatId));
  return msgs[msgs.length - 1];
}
function clearMessages() { _sentMessages.length = 0; }

const onboarding = require('./onboarding');
const { QUESTIONS_BY_ID, STEP_ORDER, PLAN_KEYS } = require('./onboarding_questions');

onboarding.init({
  db: makeDb(),
  send: mockSend,
  telegramApi: 'http://mock/bot',
  botUsername: 'test_bot'
});

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('='.repeat(70));
  console.log('ONBOARDING WIZARD — UNIT TESTS');
  console.log('='.repeat(70));
  console.log();

  // ========================================
  // Question validation
  // ========================================
  console.log('Group 1: Question validation');
  console.log('-'.repeat(70));

  await test('firma_adi: kısa input rejecte edilir', () => {
    const r = QUESTIONS_BY_ID.firma_adi.validate('Ab');
    assert(!r.ok && r.error.includes('kısa'));
  });

  await test('firma_adi: uzun input rejecte edilir', () => {
    const r = QUESTIONS_BY_ID.firma_adi.validate('A'.repeat(101));
    assert(!r.ok && r.error.includes('uzun'));
  });

  await test('firma_adi: geçerli isim kabul edilir', () => {
    const r = QUESTIONS_BY_ID.firma_adi.validate('Yıldız İnşaat A.Ş.');
    assert(r.ok); assertEq(r.value, 'Yıldız İnşaat A.Ş.');
  });

  await test('santiye_sayisi: 0 rejecte edilir', () => {
    const r = QUESTIONS_BY_ID.santiye_sayisi.validate('0');
    assert(!r.ok);
  });

  await test('santiye_sayisi: 11 rejecte edilir', () => {
    const r = QUESTIONS_BY_ID.santiye_sayisi.validate('11');
    assert(!r.ok);
  });

  await test('santiye_sayisi: 5 kabul edilir', () => {
    const r = QUESTIONS_BY_ID.santiye_sayisi.validate('5');
    assert(r.ok); assertEq(r.value, 5);
  });

  await test('santiye_sayisi: text rejecte edilir', () => {
    const r = QUESTIONS_BY_ID.santiye_sayisi.validate('beş');
    assert(!r.ok);
  });

  await test('ekip_sayisi: 0 kabul edilir', () => {
    const r = QUESTIONS_BY_ID.ekip_sayisi.validate('0');
    assert(r.ok); assertEq(r.value, 0);
  });

  await test('ekip_sayisi: 51 rejecte edilir', () => {
    const r = QUESTIONS_BY_ID.ekip_sayisi.validate('51');
    assert(!r.ok);
  });

  await test('santiye_isimleri: virgülle ayrılmış parse edilir', () => {
    const ctx = { answers: { santiye_sayisi: 3 } };
    const r = QUESTIONS_BY_ID.santiye_isimleri.validate('Akyazı, Trabzon, Of', ctx);
    assert(r.ok);
    assertEq(r.value.length, 3);
    assertEq(r.value[0], 'Akyazı');
  });

  await test('santiye_isimleri: sayı uyuşmazsa rejecte edilir', () => {
    const ctx = { answers: { santiye_sayisi: 3 } };
    const r = QUESTIONS_BY_ID.santiye_isimleri.validate('Akyazı, Trabzon', ctx);
    assert(!r.ok);
  });

  await test('mahalleler_loop: "yok" boş array döner', () => {
    const r = QUESTIONS_BY_ID.mahalleler_loop.validate('yok');
    assert(r.ok); assertEq(r.value.length, 0);
  });

  await test('mahalleler_loop: virgüllü liste parse edilir', () => {
    const r = QUESTIONS_BY_ID.mahalleler_loop.validate('Zemin, 1.Kat, 2.Kat, Çatı');
    assert(r.ok); assertEq(r.value.length, 4);
  });

  await test('ekip_uyeleri: "yok" boş array döner', () => {
    const ctx = { answers: { ekip_sayisi: 0 } };
    const r = QUESTIONS_BY_ID.ekip_uyeleri.validate('yok', ctx);
    assert(r.ok); assertEq(r.value.length, 0);
  });

  await test('ekip_uyeleri: çok satırlı liste parse edilir', () => {
    const ctx = { answers: { ekip_sayisi: 2, santiye_isimleri: ['Akyazı Sitesi', 'Trabzon Konut'] } };
    const r = QUESTIONS_BY_ID.ekip_uyeleri.validate(
      'Ahmet Yılmaz, sef, Akyazı Sitesi\nMehmet Kaya, isci, Trabzon Konut',
      ctx
    );
    assert(r.ok, 'parse OK');
    assertEq(r.value.length, 2);
    assertEq(r.value[0].rol, 'sef');
    assertEq(r.value[0].santiye, 'Akyazı Sitesi');
  });

  await test('ekip_uyeleri: bilinmeyen şantiye rejecte edilir', () => {
    const ctx = { answers: { ekip_sayisi: 1, santiye_isimleri: ['Akyazı'] } };
    const r = QUESTIONS_BY_ID.ekip_uyeleri.validate('Ahmet, sef, ZorlAn Bilinmeyen', ctx);
    assert(!r.ok);
  });

  await test('ekip_uyeleri: geçersiz rol rejecte edilir', () => {
    const ctx = { answers: { ekip_sayisi: 1, santiye_isimleri: ['Akyazı'] } };
    const r = QUESTIONS_BY_ID.ekip_uyeleri.validate('Ahmet, ceo, Akyazı', ctx);
    assert(!r.ok);
  });

  // ========================================
  // Internals: slugify + buildOzet
  // ========================================
  console.log('\nGroup 2: Internals');
  console.log('-'.repeat(70));

  await test('slugify: Türkçe karakterler düzgün dönüştürülür', () => {
    const s = onboarding._internal.slugify('Yıldız İnşaat A.Ş.');
    assert(/^[a-z0-9_]+$/.test(s), `${s} alphanumeric+underscore olmalı`);
  });

  await test('slugify: özel karakterler temizlenir', () => {
    const s = onboarding._internal.slugify('!!!Test***Firma###');
    assert(s === 'test_firma' || s === 'test_firma' || /test_?firma/.test(s));
  });

  await test('buildOzet: tüm alanları içerir', () => {
    const ozet = onboarding._internal.buildOzet({
      firma_adi: 'TestCo',
      sektor: 'İnşaat',
      plan: { plan: 'pro', label: 'Pro' },
      sahip_isim: 'Ahmet',
      sahip_rol: 'patron',
      santiye_sayisi: 2,
      santiye_isimleri: ['A', 'B'],
      ekip_sayisi: 3
    });
    assert(ozet.includes('TestCo'));
    assert(ozet.includes('İnşaat'));
    assert(ozet.includes('Pro'));
    assert(ozet.includes('Ahmet'));
  });

  // ========================================
  // State machine integration (Firestore mock)
  // ========================================
  console.log('\nGroup 3: State machine');
  console.log('-'.repeat(70));

  // Onboarding modülünü başlangıçta init ettik ama _db iç durum tutmak için
  // (mock data) ortak referans olmalı. Burada test'i basit tutuyoruz.

  await test('startOnboarding: yeni kullanıcı için pending oluşur', async () => {
    resetData();
    clearMessages();
    const tid = '999000001';
    const r = await onboarding.startOnboarding(tid, tid);
    assert(r.ok);
    assertEq(r.status, 'started');
    const pending = _firestoreData.pending_setups[tid];
    assert(pending, 'pending oluşmalı');
    assertEq(pending.step, 0);
  });

  await test('startOnboarding: kayıtlı kullanıcı için reddedilir', async () => {
    resetData();
    clearMessages();
    const tid = '999000002';
    _firestoreData.kullanicilar[tid] = { firma_id: 'existingco', isim: 'Var' };
    const r = await onboarding.startOnboarding(tid, tid);
    assertEq(r.ok, false);
    assertEq(r.reason, 'already_registered');
  });

  await test('startOnboarding: pending varsa resume promptu gösterir', async () => {
    resetData();
    clearMessages();
    const tid = '999000003';
    _firestoreData.pending_setups[tid] = {
      telegram_id: tid,
      chat_id: tid,
      step: 3,
      answers: { firma_adi: 'X' },
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    const r = await onboarding.startOnboarding(tid, tid);
    assertEq(r.status, 'resume_prompt');
  });

  await test('hasPendingSetup: pending var → true', async () => {
    resetData();
    const tid = '999000004';
    _firestoreData.pending_setups[tid] = {
      telegram_id: tid, chat_id: tid, step: 0, answers: {},
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    const r = await onboarding.hasPendingSetup(tid);
    assertEq(r, true);
  });

  await test('hasPendingSetup: pending yok → false', async () => {
    resetData();
    const r = await onboarding.hasPendingSetup('999000099');
    assertEq(r, false);
  });

  await test('handleOnboardingMessage: /iptal pending siler', async () => {
    resetData();
    clearMessages();
    const tid = '999000005';
    _firestoreData.pending_setups[tid] = {
      telegram_id: tid, chat_id: tid, step: 1, answers: { firma_adi: 'X' },
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    const consumed = await onboarding.handleOnboardingMessage({
      chat: { id: tid }, text: '/iptal'
    });
    assertEq(consumed, true);
    assert(!_firestoreData.pending_setups[tid], 'pending silinmeli');
  });

  await test('handleOnboardingMessage: pending yokken false döner', async () => {
    resetData();
    const r = await onboarding.handleOnboardingMessage({
      chat: { id: '999000006' }, text: 'rastgele'
    });
    assertEq(r, false);
  });

  await test('handleOnboardingMessage: text adımında validation', async () => {
    resetData();
    clearMessages();
    const tid = '999000007';
    _firestoreData.pending_setups[tid] = {
      telegram_id: tid, chat_id: tid, step: 0, answers: {},
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    // Kısa firma_adi reddedilmeli
    await onboarding.handleOnboardingMessage({ chat: { id: tid }, text: 'Ab' });
    const pending = _firestoreData.pending_setups[tid];
    assertEq(pending.step, 0); // adım ilerlemedi
    assertEq(pending.answers.firma_adi, undefined);
  });

  await test('handleOnboardingMessage: text adımında geçerli cevap ilerletir', async () => {
    resetData();
    clearMessages();
    const tid = '999000008';
    _firestoreData.pending_setups[tid] = {
      telegram_id: tid, chat_id: tid, step: 0, answers: {},
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    await onboarding.handleOnboardingMessage({ chat: { id: tid }, text: 'TestCo Limited' });
    const pending = _firestoreData.pending_setups[tid];
    assertEq(pending.step, 1); // step ilerledi
    assertEq(pending.answers.firma_adi, 'TestCo Limited');
  });

  await test('expired pending temizlenir', async () => {
    resetData();
    const tid = '999000009';
    _firestoreData.pending_setups[tid] = {
      telegram_id: tid, chat_id: tid, step: 0, answers: {},
      started_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      expires_at: new Date(Date.now() - 3600000).toISOString() // 1 saat önce expire
    };
    const has = await onboarding.hasPendingSetup(tid);
    assertEq(has, false, 'expired pending false dönmeli');
    assert(!_firestoreData.pending_setups[tid], 'pending silinmiş olmalı');
  });

  // ========================================
  // Sonuç
  // ========================================
  console.log();
  console.log('='.repeat(70));
  console.log(`SONUÇ: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\nBaşarısızlıklar:');
    failures.forEach(f => {
      console.log(`  • ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ TÜM TESTLER BAŞARILI');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('Test runner crash:', e);
  process.exit(2);
});

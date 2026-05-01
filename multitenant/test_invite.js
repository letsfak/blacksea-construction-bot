/**
 * Invite handler testleri — Firestore mock + invite redemption
 *
 * KULLANIM:
 *   node multitenant/test_invite.js
 */

const Module = require('module');

// ──────────────────────────────────────────────────────────────────────────
// Firestore mock (test_onboarding.js ile aynı pattern)
// ──────────────────────────────────────────────────────────────────────────
const _firestoreData = {
  invites: {},
  kullanicilar: {},
  firmalar: {}
};

function makeDocRef(coll, id) {
  return {
    async get() {
      const exists = _firestoreData[coll] && _firestoreData[coll][id] !== undefined;
      return { exists, data: () => (exists ? _firestoreData[coll][id] : null) };
    },
    async set(d) {
      if (!_firestoreData[coll]) _firestoreData[coll] = {};
      _firestoreData[coll][id] = JSON.parse(JSON.stringify(d));
    },
    async update(d) {
      if (!_firestoreData[coll]) _firestoreData[coll] = {};
      _firestoreData[coll][id] = { ...(_firestoreData[coll][id] || {}), ...JSON.parse(JSON.stringify(d)) };
    },
    async delete() { if (_firestoreData[coll]) delete _firestoreData[coll][id]; }
  };
}

function makeQuery(coll) {
  let filters = [];
  let _limit = null;
  const q = {
    where(f, op, v) { filters.push([f, op, v]); return q; },
    limit(n) { _limit = n; return q; },
    async get() {
      const items = Object.entries(_firestoreData[coll] || {}).map(([id, d]) => ({ id, data: () => d, ref: makeDocRef(coll, id) }));
      let filtered = items.filter(it => filters.every(([f, op, v]) => {
        const val = it.data()[f];
        if (op === '==') return val === v;
        if (op === '<')  return val < v;
        return false;
      }));
      if (_limit) filtered = filtered.slice(0, _limit);
      return { empty: filtered.length === 0, size: filtered.length, docs: filtered };
    }
  };
  return q;
}

function makeDb() {
  return {
    collection(coll) {
      return {
        doc(id) { return makeDocRef(coll, id); },
        where(...args) { return makeQuery(coll).where(...args); },
        async get() { return makeQuery(coll).get(); }
      };
    },
    batch() { return { delete() {}, async commit() {} }; }
  };
}

const mockAdmin = {
  initializeApp() {},
  credential: { cert: () => ({}) },
  firestore: () => makeDb(),
  apps: []
};

const _origLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === 'firebase-admin') return mockAdmin;
  return _origLoad(request, parent, ...rest);
};

// ──────────────────────────────────────────────────────────────────────────
// Test runner
// ──────────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error(`${m || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function reset() {
  for (const k of Object.keys(_firestoreData)) _firestoreData[k] = {};
  _sentMessages.length = 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Mock send
// ──────────────────────────────────────────────────────────────────────────
const _sentMessages = [];
async function mockSend(chatId, text) {
  _sentMessages.push({ chatId: String(chatId), text });
}

// Modülleri yükle
const inviteHandler = require('./invite_handler');
const inviteSvc = require('./invite');

inviteHandler.init({ db: makeDb(), send: mockSend });

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('='.repeat(70));
  console.log('INVITE HANDLER — UNIT TESTS');
  console.log('='.repeat(70));
  console.log();

  // ────── inviteSvc primitives ──────
  console.log('Group 1: Invite service primitives');
  console.log('-'.repeat(70));

  await test('generateInviteCode: 24 karakter HEX kod oluşturur', async () => {
    reset();
    const code = await inviteSvc.generateInviteCode('test_firma', 'site1', 'sef');
    assert(code, 'kod var');
    assert(/^[0-9A-F]+$/.test(code), 'sadece HEX karakter');
    assertEq(code.length, 24, '12 byte HEX = 24 char');
    assert(_firestoreData.invites[code], 'invite firestore\'a yazıldı');
  });

  await test('getInviteCode: yok olan kod null döner', async () => {
    reset();
    const r = await inviteSvc.getInviteCode('NONEXISTENT_CODE');
    assertEq(r, null);
  });

  await test('getInviteCode: expired kod null döner', async () => {
    reset();
    _firestoreData.invites['EXPIRED'] = {
      code: 'EXPIRED',
      firma_id: 'test',
      santiye_id: 'a',
      rol: 'sef',
      status: 'aktif',
      olusturma_tarihi: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    };
    const r = await inviteSvc.getInviteCode('EXPIRED');
    assertEq(r, null);
  });

  await test('redeemInvite: geçersiz kodda success=false', async () => {
    reset();
    const r = await inviteSvc.redeemInvite('FAKE', '111111', 'Test');
    assertEq(r.success, false);
  });

  await test('redeemInvite: geçerli kod kullanıcı oluşturur', async () => {
    reset();
    _firestoreData.invites['VALIDCODE'] = {
      code: 'VALIDCODE',
      firma_id: 'testco',
      santiye_id: 'sahaA',
      rol: 'sef',
      status: 'aktif',
      olusturma_tarihi: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString()
    };
    const r = await inviteSvc.redeemInvite('VALIDCODE', '7777777', 'Ahmet Test');
    assertEq(r.success, true);
    assert(_firestoreData.kullanicilar['7777777'], 'kullanıcı yaratıldı');
    assertEq(_firestoreData.kullanicilar['7777777'].firma_id, 'testco');
    assertEq(_firestoreData.kullanicilar['7777777'].rol, 'sef');
    assertEq(_firestoreData.invites['VALIDCODE'].status, 'kullanildi');
  });

  await test('redeemInvite: kullanılmış kod tekrar redempte edilmez', async () => {
    reset();
    _firestoreData.invites['USED'] = {
      code: 'USED',
      firma_id: 'testco',
      santiye_id: 'a',
      rol: 'sef',
      status: 'kullanildi',
      olusturma_tarihi: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    };
    const r = await inviteSvc.redeemInvite('USED', '8888', 'Test');
    assertEq(r.success, false);
  });

  await test('generateInviteLink: doğru format', () => {
    const link = inviteSvc.generateInviteLink('mybot', 'ABC123');
    assertEq(link, 'https://t.me/mybot?start=invite_ABC123');
  });

  // ────── handleInviteStart ──────
  console.log('\nGroup 2: handleInviteStart');
  console.log('-'.repeat(70));

  await test('handleInviteStart: /start olmayan mesajı false', async () => {
    reset();
    const r = await inviteHandler.handleInviteStart({ chat: { id: '111' }, text: 'merhaba' });
    assertEq(r, false);
  });

  await test('handleInviteStart: /start (token yok) false', async () => {
    reset();
    const r = await inviteHandler.handleInviteStart({ chat: { id: '111' }, text: '/start' });
    assertEq(r, false);
  });

  await test('handleInviteStart: /start invite_X formatı tanır', async () => {
    reset();
    _firestoreData.invites['VALIDX'] = {
      code: 'VALIDX', firma_id: 'co', santiye_id: 'a', rol: 'sef', status: 'aktif',
      olusturma_tarihi: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    };
    _firestoreData.firmalar['co'] = { firma_id: 'co', ad: 'TestFirma', sahip: { telegram_id: '999' } };
    const r = await inviteHandler.handleInviteStart({
      chat: { id: '5555' },
      from: { first_name: 'Yeni', last_name: 'Kişi', username: 'yenikisi' },
      text: '/start invite_VALIDX'
    });
    assertEq(r, true);
    assert(_firestoreData.kullanicilar['5555'], 'kullanıcı yaratıldı');
    assertEq(_firestoreData.kullanicilar['5555'].firma_id, 'co');
  });

  await test('handleInviteStart: geçersiz token kullanıcı yaratmaz', async () => {
    reset();
    const r = await inviteHandler.handleInviteStart({
      chat: { id: '6666' },
      from: { first_name: 'X' },
      text: '/start invite_BADTOKEN'
    });
    assertEq(r, true); // tüketildi (hata mesajı gönderildi)
    assert(!_firestoreData.kullanicilar['6666'], 'kullanıcı yaratılmadı');
    const lastMsg = _sentMessages[_sentMessages.length - 1];
    assert(lastMsg.text.includes('geçersiz') || lastMsg.text.includes('süresi'),
      'hata mesajı gönderildi');
  });

  await test('handleInviteStart: zaten kayıtlı kullanıcı reddedilir', async () => {
    reset();
    _firestoreData.kullanicilar['7777'] = { firma_id: 'oldco', isim: 'Var' };
    _firestoreData.invites['VALIDY'] = {
      code: 'VALIDY', firma_id: 'co', santiye_id: 'a', rol: 'sef', status: 'aktif',
      olusturma_tarihi: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    };
    const before = _firestoreData.kullanicilar['7777'].firma_id;
    const r = await inviteHandler.handleInviteStart({
      chat: { id: '7777' }, from: { first_name: 'X' },
      text: '/start invite_VALIDY'
    });
    assertEq(r, true);
    assertEq(_firestoreData.kullanicilar['7777'].firma_id, before, 'firma değişmemeli');
    assertEq(_firestoreData.invites['VALIDY'].status, 'aktif', 'invite tüketilmemeli');
  });

  await test('handleInviteStart: case-insensitive token (büyük/küçük harf)', async () => {
    reset();
    _firestoreData.invites['LOWERCASE123'] = {
      code: 'LOWERCASE123', firma_id: 'co', santiye_id: 'a', rol: 'sef', status: 'aktif',
      olusturma_tarihi: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString()
    };
    _firestoreData.firmalar['co'] = { firma_id: 'co', ad: 'TestFirma' };
    const r = await inviteHandler.handleInviteStart({
      chat: { id: '8888' },
      from: { first_name: 'A' },
      text: '/start invite_lowercase123'  // lowercase
    });
    assertEq(r, true);
    assert(_firestoreData.kullanicilar['8888'], 'token uppercase\'e çevrildi ve eşleşti');
  });

  // ──────
  console.log();
  console.log('='.repeat(70));
  console.log(`SONUÇ: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\nBaşarısızlıklar:');
    failures.forEach(f => console.log(`  • ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('\n✅ TÜM TESTLER BAŞARILI');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('Test crash:', e);
  process.exit(2);
});

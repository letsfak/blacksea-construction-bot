/**
 * Full flow integration test — onboarding wizard end-to-end
 *
 * Simüle eder:
 *   1. /yenifirma komutu
 *   2. 10 adımlı soru-cevap akışı
 *   3. Onay → Firma + Kullanıcı + Şantiye + Davetiyeler oluşur
 *   4. Davetiye linki ile yeni kullanıcı katılır
 *
 * Telegram/Firestore mock'lanır, gerçek I/O yok.
 *
 * KULLANIM:
 *   node multitenant/test_full_flow.js
 */

const Module = require('module');

// ────── Firestore mock (paylaşılan) ──────
const _data = {
  pending_setups: {},
  firmalar: {},
  kullanicilar: {},
  santiyeler: {},
  invites: {}
};

function makeDocRef(coll, id) {
  return {
    async get() {
      const exists = _data[coll] && _data[coll][id] !== undefined;
      return { exists, data: () => (exists ? _data[coll][id] : null) };
    },
    async set(d) {
      _data[coll] = _data[coll] || {};
      _data[coll][id] = JSON.parse(JSON.stringify(d));
    },
    async update(d) {
      _data[coll] = _data[coll] || {};
      _data[coll][id] = { ...(_data[coll][id] || {}), ...JSON.parse(JSON.stringify(d)) };
    },
    async delete() { if (_data[coll]) delete _data[coll][id]; }
  };
}

function makeQuery(coll) {
  let filters = [];
  let _limit = null;
  const q = {
    where(f, op, v) { filters.push([f, op, v]); return q; },
    limit(n) { _limit = n; return q; },
    async get() {
      const items = Object.entries(_data[coll] || {}).map(([id, d]) => ({ id, data: () => d, ref: makeDocRef(coll, id) }));
      let f2 = items.filter(it => filters.every(([fld, op, v]) => {
        const val = it.data()[fld];
        if (op === '==') return val === v;
        if (op === '<')  return val < v;
        return false;
      }));
      if (_limit) f2 = f2.slice(0, _limit);
      return { empty: f2.length === 0, size: f2.length, docs: f2 };
    }
  };
  return q;
}

function makeDb() {
  return {
    collection(coll) {
      return {
        doc(id) { return makeDocRef(coll, id); },
        where(...a) { return makeQuery(coll).where(...a); },
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

const _telegramCalls = [];
async function mockFetch(url, opts) {
  _telegramCalls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
  return { ok: true, status: 200, async text() { return '{}'; } };
}

const _origLoad = Module._load;
Module._load = function(req, p, ...rest) {
  if (req === 'firebase-admin') return mockAdmin;
  if (req === 'node-fetch') return mockFetch;
  return _origLoad(req, p, ...rest);
};

const _sentMessages = [];
async function mockSend(chatId, text) {
  _sentMessages.push({ chatId: String(chatId), text });
}

const onboarding = require('./onboarding');
const inviteHandler = require('./invite_handler');

onboarding.init({
  db: makeDb(),
  send: mockSend,
  telegramApi: 'http://mock/bot',
  botUsername: 'test_bot'
});
inviteHandler.init({ db: makeDb(), send: mockSend });

// ──────
function reset() {
  for (const k of Object.keys(_data)) _data[k] = {};
  _sentMessages.length = 0;
  _telegramCalls.length = 0;
}

function lastMsg(chatId) {
  const msgs = _sentMessages.filter(m => m.chatId === String(chatId));
  return msgs[msgs.length - 1];
}

let passed = 0, failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}: ${e.message}`); failed++; throw e; }
}

function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error(`${m || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ──────────────────────────────────────────────────────────────────────────
async function runFullFlow() {
  console.log('='.repeat(70));
  console.log('ONBOARDING — FULL FLOW INTEGRATION TEST');
  console.log('='.repeat(70));
  console.log();

  reset();
  const ownerTid = '5000001';

  await step('1. /yenifirma → pending oluşur', async () => {
    const r = await onboarding.startOnboarding(ownerTid, ownerTid);
    assertEq(r.ok, true);
    assertEq(r.status, 'started');
    assert(_data.pending_setups[ownerTid], 'pending var');
    assertEq(_data.pending_setups[ownerTid].step, 0);
  });

  await step('2. firma_adi cevabı', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: 'Test İnşaat A.Ş.'
    });
    assertEq(_data.pending_setups[ownerTid].step, 1);
    assertEq(_data.pending_setups[ownerTid].answers.firma_adi, 'Test İnşaat A.Ş.');
  });

  await step('3. sektor callback (inline)', async () => {
    await onboarding.handleOnboardingCallback({
      id: 'cb1', message: { chat: { id: ownerTid } }, data: 'onb_sek_insaat'
    });
    assertEq(_data.pending_setups[ownerTid].step, 2);
    assertEq(_data.pending_setups[ownerTid].answers.sektor, 'İnşaat/Müteahhitlik');
  });

  await step('4. plan callback (inline)', async () => {
    await onboarding.handleOnboardingCallback({
      id: 'cb2', message: { chat: { id: ownerTid } }, data: 'onb_plan_pro'
    });
    assertEq(_data.pending_setups[ownerTid].step, 3);
    assertEq(_data.pending_setups[ownerTid].answers.plan.plan, 'pro');
  });

  await step('5. sahip_isim cevabı', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: 'Ahmet Yılmaz'
    });
    assertEq(_data.pending_setups[ownerTid].step, 4);
    assertEq(_data.pending_setups[ownerTid].answers.sahip_isim, 'Ahmet Yılmaz');
  });

  await step('6. sahip_rol callback', async () => {
    await onboarding.handleOnboardingCallback({
      id: 'cb3', message: { chat: { id: ownerTid } }, data: 'onb_rol_patron'
    });
    assertEq(_data.pending_setups[ownerTid].step, 5);
    assertEq(_data.pending_setups[ownerTid].answers.sahip_rol, 'patron');
  });

  await step('7. santiye_sayisi cevabı', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: '2'
    });
    assertEq(_data.pending_setups[ownerTid].step, 6);
    assertEq(_data.pending_setups[ownerTid].answers.santiye_sayisi, 2);
  });

  await step('8. santiye_isimleri → mahalle döngüsüne giriş', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: 'Akyazı Sitesi, Trabzon Konut'
    });
    const p = _data.pending_setups[ownerTid];
    assertEq(p.in_mahalle_loop, true);
    assertEq(p.mahalle_index, 0);
    assertEq(p.answers.santiye_isimleri.length, 2);
  });

  await step('9. mahalle döngüsü 1/2 (Akyazı Sitesi)', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: 'Zemin, 1.Kat, 2.Kat, Çatı'
    });
    const p = _data.pending_setups[ownerTid];
    assertEq(p.mahalle_index, 1);
    assertEq(p.answers.mahaller_per_santiye['Akyazı Sitesi'].length, 4);
  });

  await step('10. mahalle döngüsü 2/2 (Trabzon Konut) → loop biter', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: 'A Blok, B Blok'
    });
    const p = _data.pending_setups[ownerTid];
    assertEq(p.in_mahalle_loop, false);
    assert(p.step >= 7, 'step ekip_sayisi\'na geçti');
    assertEq(p.answers.mahaller_per_santiye['Trabzon Konut'].length, 2);
  });

  await step('11. ekip_sayisi cevabı', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid }, text: '2'
    });
    assertEq(_data.pending_setups[ownerTid].answers.ekip_sayisi, 2);
  });

  await step('12. ekip_uyeleri cevabı', async () => {
    await onboarding.handleOnboardingMessage({
      chat: { id: ownerTid },
      text: 'Ahmet Yılmaz, sef, Akyazı Sitesi\nMehmet Kaya, isci, Trabzon Konut'
    });
    const p = _data.pending_setups[ownerTid];
    assertEq(p.answers.ekip_uyeleri.length, 2);
    assertEq(p.answers.ekip_uyeleri[0].rol, 'sef');
  });

  await step('13. onay = evet → completeOnboarding', async () => {
    await onboarding.handleOnboardingCallback({
      id: 'cb_onay', message: { chat: { id: ownerTid } }, data: 'onb_onay_evet'
    });
    // Pending silinmeli
    assert(!_data.pending_setups[ownerTid], 'pending silindi');

    // Firma yaratılmalı
    const firmas = Object.values(_data.firmalar);
    assertEq(firmas.length, 1, '1 firma yaratıldı');
    const firma = firmas[0];
    assertEq(firma.ad, 'Test İnşaat A.Ş.');
    assertEq(firma.plan, 'pro');
    assertEq(firma.sahip.telegram_id, ownerTid);

    // Owner kullanıcı yaratılmalı
    assert(_data.kullanicilar[ownerTid], 'owner user yaratıldı');
    assertEq(_data.kullanicilar[ownerTid].rol, 'patron');

    // 2 şantiye yaratılmalı
    const santiyeler = Object.values(_data.santiyeler);
    assertEq(santiyeler.length, 2, '2 şantiye');
    assertEq(santiyeler[0].firma_id, firma.firma_id);

    // 2 davetiye yaratılmalı
    const invites = Object.values(_data.invites);
    assertEq(invites.length, 2, '2 davetiye');
  });

  await step('14. davetiyeyle yeni kullanıcı katılır', async () => {
    const inviteCodes = Object.keys(_data.invites);
    const firstCode = inviteCodes[0];
    const newMemberTid = '6000002';

    const r = await inviteHandler.handleInviteStart({
      chat: { id: newMemberTid },
      from: { first_name: 'Yeni', last_name: 'Üye', username: 'yeniuye' },
      text: `/start invite_${firstCode}`
    });
    assertEq(r, true);
    assert(_data.kullanicilar[newMemberTid], 'yeni üye yaratıldı');
    assertEq(_data.invites[firstCode].status, 'kullanildi', 'invite kullanıldı');
  });

  await step('15. aynı davetiye tekrar kullanılamaz', async () => {
    const inviteCodes = Object.keys(_data.invites);
    const firstCode = inviteCodes[0]; // zaten kullanıldı
    const otherTid = '7000003';
    await inviteHandler.handleInviteStart({
      chat: { id: otherTid },
      from: { first_name: 'Z' },
      text: `/start invite_${firstCode}`
    });
    assert(!_data.kullanicilar[otherTid], 'kullanıcı yaratılmadı');
  });

  // ──────
  console.log();
  console.log('='.repeat(70));
  console.log(`SONUÇ: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  console.log('\n📊 Final Firestore state:');
  console.log(`  firmalar: ${Object.keys(_data.firmalar).length}`);
  console.log(`  kullanicilar: ${Object.keys(_data.kullanicilar).length}`);
  console.log(`  santiyeler: ${Object.keys(_data.santiyeler).length}`);
  console.log(`  invites: ${Object.keys(_data.invites).length} (kullanıldı: ${Object.values(_data.invites).filter(i => i.status === 'kullanildi').length})`);

  if (failed > 0) {
    console.log('\n❌ FULL FLOW BAŞARISIZ');
    process.exit(1);
  } else {
    console.log('\n✅ FULL FLOW BAŞARILI — onboarding end-to-end çalışıyor');
    process.exit(0);
  }
}

runFullFlow().catch(e => {
  console.error('\n💥 Test crash:', e.message);
  console.error(e.stack);
  process.exit(2);
});

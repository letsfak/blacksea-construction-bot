/**
 * Onboarding wizard — yeni firma kuruluş state machine
 *
 * Akış:
 *   1. /yenifirma → startOnboarding(chatId, telegramId)
 *   2. Kullanıcı her cevabı verdikçe handleOnboardingMessage / handleOnboardingCallback
 *   3. 10 adım tamamlanınca completeOnboarding → Firestore yazımı
 *
 * Pending state: pending_setups/{telegram_id} — 24h TTL
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const fetch = require('node-fetch');

const firmaSvc = require('./firma_service');
const inviteSvc = require('./invite');
const santiyeSvc = require('./santiye_service');

const { QUESTIONS_BY_ID, STEP_ORDER, PLAN_KEYS } = require('./onboarding_questions');

const PENDING_COLLECTION = 'pending_setups';
const SETUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
// Set this to your admin's Telegram chat ID (get from @userinfobot)
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'YOUR_ADMIN_CHAT_ID';
const SAFE_NAME_RE = /[^a-z0-9]+/g;

// Bağımlılıklar — index.js init sırasında set edilir
let _db = null;
let _send = null;
let _telegramApi = null; // örn: "https://api.telegram.org/bot{TOKEN}"
let _botUsername = process.env.BOT_USERNAME || 'your_construction_bot';

/**
 * Modülü init et — index.js'den bağımlılıkları al
 */
function init({ db, send, telegramApi, botUsername }) {
  _db = db || admin.firestore();
  _send = send;
  _telegramApi = telegramApi;
  if (botUsername) _botUsername = botUsername;
}

// ────────────────────────────────────────────────────────────────────────
// Yardımcı fonksiyonlar
// ────────────────────────────────────────────────────────────────────────

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(SAFE_NAME_RE, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function randomSuffix(len = 4) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

async function isUserAlreadyRegistered(telegramId) {
  // Firestore kullanicilar koleksiyonunda var mı?
  const doc = await _db.collection('kullanicilar').doc(String(telegramId)).get();
  if (doc.exists) {
    const data = doc.data();
    return { exists: true, firma_id: data.firma_id, isim: data.isim };
  }
  return { exists: false };
}

async function getPendingSetup(telegramId) {
  const doc = await _db.collection(PENDING_COLLECTION).doc(String(telegramId)).get();
  if (!doc.exists) return null;
  const data = doc.data();
  // Expired mi?
  const expiresAt = new Date(data.expires_at).getTime();
  if (Date.now() > expiresAt) {
    await _db.collection(PENDING_COLLECTION).doc(String(telegramId)).delete().catch(() => {});
    return null;
  }
  return data;
}

async function savePendingSetup(telegramId, state) {
  await _db.collection(PENDING_COLLECTION).doc(String(telegramId)).set(state);
}

async function deletePendingSetup(telegramId) {
  await _db.collection(PENDING_COLLECTION).doc(String(telegramId)).delete().catch(() => {});
}

async function sendInline(chatId, text, keyboard) {
  if (!_telegramApi) {
    // Fallback: sadece metin
    await _send(chatId, text);
    return;
  }
  const resp = await fetch(`${_telegramApi}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: keyboard }
    })
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error(`onboarding sendInline hata: ${resp.status}: ${err.slice(0, 200)}`);
    // Fallback metin
    await _send(chatId, text);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/**
 * /yenifirma komutu — onboarding başlat
 */
async function startOnboarding(chatId, telegramId, opts = {}) {
  const tid = String(telegramId);

  // 1. Zaten başka firmada kayıtlı mı?
  const existing = await isUserAlreadyRegistered(tid);
  if (existing.exists) {
    await _send(chatId,
      `Bu Telegram hesabı zaten "${existing.firma_id}" firmasına bağlı (${existing.isim || 'kayıt'}).\n\n` +
      `Yeni firma kurmak için farklı bir Telegram hesabı kullanın.`);
    return { ok: false, reason: 'already_registered' };
  }

  // 2. Mevcut pending var mı?
  const pending = await getPendingSetup(tid);
  if (pending && !opts.forceReset) {
    await sendInline(chatId,
      `Devam etmek istediğiniz bir kurulum var.\n` +
      `Şu anda adım: ${pending.step + 1}/10\n\n` +
      `Ne yapmak istersiniz?`,
      [
        [{ text: '▶️ Devam Et',     callback_data: 'onb_resume' }],
        [{ text: '🔄 Sıfırdan',     callback_data: 'onb_reset' }],
        [{ text: '❌ İptal',        callback_data: 'onb_cancel' }]
      ]
    );
    return { ok: true, status: 'resume_prompt' };
  }

  // 3. Yeni başlat
  const newState = {
    telegram_id: tid,
    chat_id: String(chatId),
    step: 0,
    answers: {},
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + SETUP_TTL_MS).toISOString(),
    // Mahalle döngüsü için yardımcı alanlar
    mahalle_index: -1
  };
  await savePendingSetup(tid, newState);

  await _send(chatId,
    `🚀 Yeni firma kurulumu başlıyor!\n\n` +
    `10 kısa soru, ~3 dakika.\n` +
    `İstediğiniz zaman "/iptal" yazarak çıkabilirsiniz.`);

  await askCurrentStep(chatId, newState);
  return { ok: true, status: 'started' };
}

/**
 * Mevcut adımın sorusunu kullanıcıya sor
 */
async function askCurrentStep(chatId, state) {
  // Mahalle döngüsü kontrol
  if (state.in_mahalle_loop) {
    const santiyeler = state.answers.santiye_isimleri || [];
    const idx = state.mahalle_index;
    if (idx >= 0 && idx < santiyeler.length) {
      const q = QUESTIONS_BY_ID.mahalleler_loop;
      const text = q.textTemplate(santiyeler[idx]) +
        `\n\n(Şantiye ${idx + 1}/${santiyeler.length})`;
      await _send(chatId, text);
      return;
    }
    // Loop bitti — santiye_isimleri'nin sonraki adımına geç
    state.in_mahalle_loop = false;
    state.step += 1; // ekip_sayisi
    await savePendingSetup(state.telegram_id, state);
  }

  const stepName = STEP_ORDER[state.step];
  if (!stepName) {
    // Tüm adımlar bitti — onaylama gösterilmiş olmalı
    return;
  }

  const q = QUESTIONS_BY_ID[stepName];
  if (!q) {
    console.error(`Onboarding: bilinmeyen adım ${stepName}`);
    return;
  }

  if (q.type === 'inline') {
    // Onay adımı için özet ekle
    let text = q.text;
    if (stepName === 'onay') {
      text = q.text.replace('{ozet}', buildOzet(state.answers));
    }
    await sendInline(chatId, text, q.keyboard);
  } else {
    await _send(chatId, q.text);
  }
}

function buildOzet(a) {
  const planObj = a.plan || {};
  const lines = [
    `📌 Firma: ${a.firma_adi}`,
    `📌 Sektör: ${a.sektor}`,
    `📌 Plan: ${planObj.label || planObj.plan}`,
    `📌 Sahip: ${a.sahip_isim} (${a.sahip_rol})`,
    `📌 Şantiye: ${a.santiye_sayisi} adet — ${(a.santiye_isimleri || []).join(', ')}`,
    `📌 Ekip: ${a.ekip_sayisi} kişi`
  ];
  return lines.join('\n');
}

/**
 * Kullanıcının text mesajını işle (mevcut bir setup varsa)
 * @returns {boolean} True = mesaj onboarding tarafından tüketildi
 */
async function handleOnboardingMessage(msg) {
  const chatId = String(msg.chat.id);
  const telegramId = chatId;
  const text = (msg.text || '').trim();

  const state = await getPendingSetup(telegramId);
  if (!state) return false;

  // İptal
  if (text === '/iptal' || text.toLowerCase() === 'iptal') {
    await deletePendingSetup(telegramId);
    await _send(chatId, '❌ Kurulum iptal edildi. Tekrar başlamak için /yenifirma yazın.');
    return true;
  }

  // /yenifirma tekrar geldi → resume promptu
  if (text === '/yenifirma') {
    return false; // index.js startOnboarding çağırır, o resume promptunu gösterir
  }

  // Mahalle döngüsü
  if (state.in_mahalle_loop) {
    return processMahalleAnswer(chatId, state, text);
  }

  const stepName = STEP_ORDER[state.step];
  const q = QUESTIONS_BY_ID[stepName];
  if (!q) return false;

  // Inline tipi metin ile cevap aldıysa hatırlat
  if (q.type === 'inline') {
    await _send(chatId, 'Lütfen yukarıdaki butonlardan birini seçin.');
    return true;
  }

  // Validate
  const result = q.validate(text, state);
  if (!result.ok) {
    await _send(chatId, `⚠️ ${result.error}`);
    return true;
  }

  return advanceStep(chatId, state, stepName, result.value);
}

async function processMahalleAnswer(chatId, state, text) {
  const q = QUESTIONS_BY_ID.mahalleler_loop;
  const result = q.validate(text);
  if (!result.ok) {
    await _send(chatId, `⚠️ ${result.error}`);
    return true;
  }

  // Bu şantiyenin mahallelerini sakla
  if (!state.answers.mahaller_per_santiye) {
    state.answers.mahaller_per_santiye = {};
  }
  const santiyeler = state.answers.santiye_isimleri || [];
  const currentSantiye = santiyeler[state.mahalle_index];
  state.answers.mahaller_per_santiye[currentSantiye] = result.value;

  // Sonraki şantiyeye geç
  state.mahalle_index += 1;
  await savePendingSetup(state.telegram_id, state);

  if (state.mahalle_index >= santiyeler.length) {
    // Loop bitti
    state.in_mahalle_loop = false;
    state.step += 1; // ekip_sayisi'na atla (santiye_isimleri'den sonraki adım)
    await savePendingSetup(state.telegram_id, state);
    await _send(chatId, '✅ Tüm mahalleler kaydedildi.');
  }

  await askCurrentStep(chatId, state);
  return true;
}

/**
 * Inline keyboard callback'ini işle
 * @returns {boolean} True = callback onboarding tarafından tüketildi
 */
async function handleOnboardingCallback(cb) {
  const chatId = String(cb.message.chat.id);
  const telegramId = chatId;
  const data = cb.data || '';

  if (!data.startsWith('onb_')) return false;

  // Telegram'a callback aldığımızı bildir
  if (_telegramApi) {
    await fetch(`${_telegramApi}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cb.id })
    }).catch(() => {});
  }

  // Resume / reset / cancel
  if (data === 'onb_resume') {
    const state = await getPendingSetup(telegramId);
    if (!state) {
      await _send(chatId, 'Kurulum bulunamadı. /yenifirma ile yeniden başlayın.');
      return true;
    }
    await _send(chatId, '▶️ Kurulum kaldığı yerden devam ediyor.');
    await askCurrentStep(chatId, state);
    return true;
  }
  if (data === 'onb_reset') {
    await deletePendingSetup(telegramId);
    await startOnboarding(chatId, telegramId, { forceReset: true });
    return true;
  }
  if (data === 'onb_cancel') {
    await deletePendingSetup(telegramId);
    await _send(chatId, '❌ Kurulum iptal edildi.');
    return true;
  }

  const state = await getPendingSetup(telegramId);
  if (!state) return false;

  const stepName = STEP_ORDER[state.step];
  const q = QUESTIONS_BY_ID[stepName];
  if (!q || q.type !== 'inline') return false;

  const result = q.validateCallback(data);
  if (!result.ok) {
    await _send(chatId, `⚠️ ${result.error}`);
    return true;
  }

  return advanceStep(chatId, state, stepName, result.value);
}

/**
 * Bir adımı bitir, cevabı sakla, sonraki adıma geç
 */
async function advanceStep(chatId, state, stepName, value) {
  state.answers[stepName] = value;

  // Onay adımı özel — kuruluma başla veya iptal et
  if (stepName === 'onay') {
    if (value === true) {
      await deletePendingSetup(state.telegram_id);
      await completeOnboarding(chatId, state);
      return true;
    } else {
      await deletePendingSetup(state.telegram_id);
      await _send(chatId, '❌ Kurulum iptal edildi. /yenifirma ile yeniden başlayabilirsiniz.');
      return true;
    }
  }

  // santiye_isimleri sonrası mahalle döngüsüne gir
  if (stepName === 'santiye_isimleri') {
    state.in_mahalle_loop = true;
    state.mahalle_index = 0;
    await savePendingSetup(state.telegram_id, state);
    await _send(chatId, '✅ Şantiyeler alındı. Şimdi her şantiye için mahalleleri girelim.');
    await askCurrentStep(chatId, state);
    return true;
  }

  state.step += 1;
  await savePendingSetup(state.telegram_id, state);
  await askCurrentStep(chatId, state);
  return true;
}

/**
 * Tüm cevaplar toplandı — Firestore'a yaz
 */
async function completeOnboarding(chatId, state) {
  const a = state.answers;
  const ownerTelegramId = state.telegram_id;

  await _send(chatId, '⏳ Firma kuruluyor...');

  // 1. Firma ID üret (slug + suffix)
  const firmaId = `${slugify(a.firma_adi)}_${randomSuffix(4)}`.replace(/^_+/, '');

  const planObj = a.plan || PLAN_KEYS.plan_basic;

  try {
    // Atomik olmayan ama sırayla — başarısızlıkta cleanup
    const written = { firma: false, owner: false, santiyeler: [], invites: [] };

    // 2. Firma yarat
    await firmaSvc.createFirma({
      firma_id: firmaId,
      ad: a.firma_adi,
      durum: 'aktif',
      plan: planObj.plan,
      sahip: { telegram_id: ownerTelegramId, isim: a.sahip_isim, rol: a.sahip_rol },
      ozellikler: {
        santiye_limiti: planObj.santiye_limiti,
        kullanici_limiti: planObj.kullanici_limiti,
        ai_chatbot: true
      }
    });
    // Sektörü ek olarak güncelle (createFirma şemasında yok ama güzel saklanır)
    await firmaSvc.updateFirma(firmaId, { sektor: a.sektor });
    written.firma = true;

    // 3. Owner kullanıcı yarat
    await _db.collection('kullanicilar').doc(ownerTelegramId).set({
      telegram_id: ownerTelegramId,
      firma_id: firmaId,
      isim: a.sahip_isim,
      rol: a.sahip_rol,
      santiye_id: null,
      izinler: { is_kayit: true, malzeme_kayit: true, ai_sohbet: true, admin: true },
      durum: 'aktif',
      created_at: new Date().toISOString(),
      onboarded_via: 'wizard'
    });
    written.owner = true;

    // 4. Şantiyeleri yarat
    const santiyeIdMap = {}; // ad → santiye_id
    for (const santiyeAd of (a.santiye_isimleri || [])) {
      const santiyeLocalId = slugify(santiyeAd) || `santiye_${randomSuffix(3)}`;
      const mahaller = (a.mahaller_per_santiye || {})[santiyeAd] || [];
      await santiyeSvc.createSantiye(firmaId, {
        santiye_id: santiyeLocalId,
        ad: santiyeAd,
        sefi: null,
        mahallar: mahaller,
        durum: 'aktif'
      });
      santiyeIdMap[santiyeAd] = santiyeLocalId;
      written.santiyeler.push(santiyeLocalId);
    }

    // 5. Davetiyeleri yarat
    const inviteLinks = [];
    for (const member of (a.ekip_uyeleri || [])) {
      const santiyeLocalId = santiyeIdMap[member.santiye] || null;
      const code = await inviteSvc.generateInviteCode(firmaId, santiyeLocalId, member.rol);
      // Link'e isim ekle (kullanıcı bilgisi için)
      await _db.collection('invites').doc(code).update({
        invitee_name: member.isim,
        invitee_role: member.rol,
        invitee_santiye_ad: member.santiye
      }).catch(() => {});
      const link = inviteSvc.generateInviteLink(_botUsername, code);
      inviteLinks.push({ name: member.isim, role: member.rol, santiye: member.santiye, link, code });
      written.invites.push(code);
    }

    // 6. Sahibe başarı mesajı
    let successMsg = `✅ "${a.firma_adi}" firmanız kuruldu!\n\n` +
      `🆔 Firma ID: ${firmaId}\n` +
      `📦 Plan: ${planObj.plan} (30 gün ücretsiz trial)\n` +
      `🏗️ Şantiye: ${written.santiyeler.length}\n` +
      `👥 Davet: ${written.invites.length}\n\n`;

    if (inviteLinks.length > 0) {
      successMsg += `📨 Davet linkleri:\n`;
      for (const inv of inviteLinks) {
        successMsg += `\n• ${inv.name} (${inv.role}, ${inv.santiye}):\n  https://t.me/${_botUsername}?start=invite_${inv.code}\n`;
      }
      successMsg += `\nLinkleri ekibinize gönderin. 7 gün içinde geçerli.`;
    } else {
      successMsg += `Ekip eklemediniz — sonra /davet ile davet edebilirsiniz.`;
    }

    await _send(chatId, successMsg);
    await _send(chatId,
      `\nBaşlamak için /start yazın.\n` +
      `Yardım için /yardim yazın.`);

    // 7. Admin'e bildirim
    try {
      await _send(ADMIN_CHAT_ID,
        `🎉 YENİ FIRMA\n━━━━━━━━━━━\n` +
        `📛 ${a.firma_adi}\n` +
        `🏷️ ${planObj.plan}\n` +
        `🏗️ ${written.santiyeler.length} şantiye\n` +
        `👥 ${written.invites.length} ekip üyesi\n` +
        `👤 Sahip: ${a.sahip_isim} (${a.sahip_rol})\n` +
        `📱 TG: ${ownerTelegramId}\n` +
        `🆔 ${firmaId}`);
    } catch (e) {
      console.error('Admin bildirim hatası:', e.message);
    }

    return { ok: true, firma_id: firmaId, invites: inviteLinks };

  } catch (err) {
    console.error('Onboarding completeOnboarding hata:', err);
    await _send(chatId,
      `❌ Kurulumda hata oluştu: ${err.message}\n\n` +
      `Admin'e haber verildi. /yenifirma ile tekrar deneyebilirsiniz.`);
    try {
      await _send(ADMIN_CHAT_ID,
        `⚠️ Onboarding HATA — ${a.firma_adi}\nTG: ${ownerTelegramId}\nHata: ${err.message}`);
    } catch (e) { /* swallow */ }

    // Pending'i geri yaz, kullanıcı tekrar deneyebilsin
    state.error_at = new Date().toISOString();
    state.error_message = err.message;
    await savePendingSetup(ownerTelegramId, state);

    return { ok: false, error: err.message };
  }
}

/**
 * Bir kullanıcının pending setup'u var mı? (lightweight check)
 */
async function hasPendingSetup(telegramId) {
  const state = await getPendingSetup(telegramId);
  return state !== null;
}

module.exports = {
  init,
  startOnboarding,
  handleOnboardingMessage,
  handleOnboardingCallback,
  hasPendingSetup,
  completeOnboarding,    // export for tests
  // internals exposed for testing
  _internal: {
    slugify,
    buildOzet,
    getPendingSetup,
    savePendingSetup,
    deletePendingSetup
  }
};

/**
 * Davetiye yönetimi — invite code oluşturma, redemption, expiry
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const db = admin.firestore();

/**
 * Şantiye şefi davetiye kodu oluştur
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @param {string} role - Rol (sef, supervisor vb)
 * @returns {Promise<string>} Davetiye kodu
 */
async function generateInviteCode(firmaId, santiyeId, role = 'sef') {
  const code = crypto.randomBytes(12).toString('hex').toUpperCase();

  const inviteData = {
    code,
    firma_id: firmaId,
    santiye_id: santiyeId,
    rol: role,
    status: 'aktif',
    olusturma_tarihi: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 gün
  };

  await db.collection('invites').doc(code).set(inviteData);
  return code;
}

/**
 * Davetiye kodunu kontrol et ve geçerli mi diye bak
 * @param {string} code - Davetiye kodu
 * @returns {Promise<object|null>} Invite verisi veya null
 */
async function getInviteCode(code) {
  const doc = await db.collection('invites').doc(code).get();
  if (!doc.exists) return null;

  const data = doc.data();

  // Süresi geçmişse null dön (cleanup için expiry_at kontrol edilecek)
  const expiresAt = new Date(data.expires_at);
  if (new Date() > expiresAt) {
    return null;
  }

  return data;
}

/**
 * Davetiye kodunu kullan (redemption)
 * Kullanıcıyı firma + şantiyeye atama + used mark
 *
 * @param {string} code - Davetiye kodu
 * @param {string} telegramId - Telegram ID
 * @param {string} isim - Kullanıcı ismi
 * @returns {Promise<object>} Redemption sonucu { success, message, user }
 */
async function redeemInvite(code, telegramId, isim) {
  const invite = await getInviteCode(code);

  if (!invite) {
    return {
      success: false,
      message: 'Davetiye kodu geçersiz veya süresi bitmiş.'
    };
  }

  if (invite.status === 'kullanildi') {
    return {
      success: false,
      message: 'Bu davetiye kodu zaten kullanılmış.'
    };
  }

  // Kullanıcı oluştur
  const kullaniciData = {
    telegram_id: telegramId,
    firma_id: invite.firma_id,
    isim,
    rol: invite.rol,
    santiye_id: invite.santiye_id,
    izinler: {
      is_kayit: true,
      malzeme_kayit: true,
      ai_sohbet: true
    },
    durum: 'aktif',
    created_at: new Date().toISOString(),
    invited_via_code: code
  };

  await db.collection('kullanicilar').doc(telegramId).set(kullaniciData);

  // Davetiye kodunu "kullanildi" olarak işaretle
  await db.collection('invites').doc(code).update({
    status: 'kullanildi',
    redeemed_by: telegramId,
    redeemed_at: new Date().toISOString()
  });

  return {
    success: true,
    message: `Hoş geldiniz, ${isim}! ${invite.firma_id} firmasına başarıyla eklendiniz.`,
    user: kullaniciData
  };
}

/**
 * Eski davetiye kodlarını kaldır (expires_at geçmişse)
 * @param {number} days - Kaç gün önceki kodları sil
 * @returns {Promise<number>} Silinen kod sayısı
 */
async function expireOldInvites(days = 7) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const snap = await db.collection('invites')
    .where('expires_at', '<', cutoffDate)
    .get();

  let deletedCount = 0;

  const batch = db.batch();
  snap.docs.forEach(doc => {
    batch.delete(doc.ref);
    deletedCount++;
  });

  if (deletedCount > 0) {
    await batch.commit();
  }

  return deletedCount;
}

/**
 * Firma'nın aktif davetiye kodlarını listele
 * @param {string} firmaId - Firma ID
 * @returns {Promise<Array>} Aktif invites
 */
async function listFirmaInvites(firmaId) {
  const snap = await db.collection('invites')
    .where('firma_id', '==', firmaId)
    .where('status', '==', 'aktif')
    .get();

  return snap.docs.map(d => d.data());
}

/**
 * Bir şantiye için davetiye kodları listele
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @returns {Promise<Array>} Invites
 */
async function listSantiyeInvites(firmaId, santiyeId) {
  const snap = await db.collection('invites')
    .where('firma_id', '==', firmaId)
    .where('santiye_id', '==', santiyeId)
    .where('status', '==', 'aktif')
    .get();

  return snap.docs.map(d => d.data());
}

/**
 * Davetiye kodunu iptal et (patron tarafından)
 * @param {string} code - Davetiye kodu
 * @returns {Promise<void>}
 */
async function revokeInviteCode(code) {
  await db.collection('invites').doc(code).update({
    status: 'iptal_edildi',
    revoked_at: new Date().toISOString()
  });
}

/**
 * Telegram bot'un davetiye linki oluştur
 * @param {string} botUsername - Bot username (örn: "your_construction_bot")
 * @param {string} inviteCode - Davetiye kodu
 * @returns {string} Tam davetiye linki
 */
function generateInviteLink(botUsername, inviteCode) {
  return `https://t.me/${botUsername}?start=invite_${inviteCode}`;
}

module.exports = {
  generateInviteCode,
  getInviteCode,
  redeemInvite,
  expireOldInvites,
  listFirmaInvites,
  listSantiyeInvites,
  revokeInviteCode,
  generateInviteLink
};

/**
 * Authentication middleware — firma_id bulma, rol doğrulama, admin kontrolü
 * Compat mode: hardcoded USERS dict'ten yeni kullanicilar koleksiyonuna geçiş
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// COMPAT: Mevcut hardcoded USERS — index.js'den import edilecek
let COMPAT_USERS = {};

/**
 * Compat modu için hardcoded USERS'ı set et
 * (index.js açılışında çağrılacak)
 * @param {object} users - Hardcoded USERS objekti
 */
function setCompatUsers(users) {
  COMPAT_USERS = users;
}

const DEFAULT_FIRMA_ID = process.env.DEFAULT_FIRMA_ID || 'your-company-slug';

/**
 * Telegram ID'den firma_id'yi bul
 * 1. Firestore kullanicilar koleksiyonunda ara
 * 2. Yoksa compat USERS'dan bul → firma_id=DEFAULT_FIRMA_ID (mevcut sistem)
 * 3. Hala yoksa null (yeni kullanıcı, /kurulum gerekli)
 *
 * @param {string} telegramId - Telegram ID (string)
 * @returns {Promise<string|null>} firma_id veya null
 */
async function getUserFirmaId(telegramId) {
  // 1. Firestore'da ara
  const userDoc = await db.collection('kullanicilar').doc(telegramId).get();
  if (userDoc.exists) {
    return userDoc.data().firma_id || null;
  }

  // 2. Compat USERS'dan ara (mevcut sistem)
  if (COMPAT_USERS[telegramId]) {
    return DEFAULT_FIRMA_ID;
  }

  // 3. Yeni kullanıcı — null dön
  return null;
}

/**
 * Kullanıcı bilgilerini al
 * Firestore → compat USERS fallback
 *
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<object|null>} Kullanıcı verisi
 */
async function getKullanici(telegramId) {
  // 1. Firestore
  const userDoc = await db.collection('kullanicilar').doc(telegramId).get();
  if (userDoc.exists) {
    return { ...userDoc.data() };
  }

  // 2. Compat USERS
  if (COMPAT_USERS[telegramId]) {
    return {
      telegram_id: telegramId,
      firma_id: DEFAULT_FIRMA_ID,
      isim: COMPAT_USERS[telegramId].name,
      rol: COMPAT_USERS[telegramId].role,
      santiye_id: COMPAT_USERS[telegramId].santiye || null,
      izinler: {
        is_kayit: true,
        malzeme_kayit: true,
        ai_sohbet: true
      }
    };
  }

  return null;
}

/**
 * Kullanıcı rolünü doğrula
 * @param {string} telegramId - Telegram ID
 * @param {string|string[]} role - İstenilen rol(ler)
 * @returns {Promise<boolean>} True/False
 */
async function validateUserRole(telegramId, role) {
  const user = await getKullanici(telegramId);
  if (!user) return false;

  const rolesArray = Array.isArray(role) ? role : [role];
  return rolesArray.includes(user.rol);
}

/**
 * Admin kontrolü
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<boolean>} True/False
 */
async function isAdmin(telegramId) {
  return validateUserRole(telegramId, 'admin');
}

/**
 * Patron kontrolü (firma sahibi)
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<boolean>} True/False
 */
async function isPatron(telegramId) {
  return validateUserRole(telegramId, 'patron');
}

/**
 * Şef kontrolü
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<boolean>} True/False
 */
async function isSef(telegramId) {
  return validateUserRole(telegramId, 'sef');
}

/**
 * Yeni kullanıcı oluştur (Firestore)
 * @param {string} telegramId - Telegram ID
 * @param {object} data - Kullanıcı verisi
 * @returns {Promise<object>} Oluşturulan kullanıcı
 */
async function createKullanici(telegramId, data) {
  const userData = {
    telegram_id: telegramId,
    firma_id: data.firma_id || DEFAULT_FIRMA_ID,
    isim: data.isim,
    rol: data.rol || 'kullanici',
    santiye_id: data.santiye_id || null,
    izinler: data.izinler || {
      is_kayit: true,
      malzeme_kayit: true,
      ai_sohbet: true
    },
    created_at: new Date().toISOString()
  };

  await db.collection('kullanicilar').doc(telegramId).set(userData);
  return userData;
}

/**
 * Kullanıcı rolü güncelle
 * @param {string} telegramId - Telegram ID
 * @param {string} role - Yeni rol
 * @returns {Promise<void>}
 */
async function updateUserRole(telegramId, role) {
  await db.collection('kullanicilar').doc(telegramId).update({
    rol: role,
    updated_at: new Date().toISOString()
  });
}

/**
 * Şantiye izni ver (kullanıcıyı belirli şantiyeye atama)
 * @param {string} telegramId - Telegram ID
 * @param {string} santiyeId - Şantiye ID
 * @returns {Promise<void>}
 */
async function assignToSantiye(telegramId, santiyeId) {
  await db.collection('kullanicilar').doc(telegramId).update({
    santiye_id: santiyeId,
    updated_at: new Date().toISOString()
  });
}

/**
 * Cross-firma izolasyon kontrolü
 * Bir kullanıcı başka firma verisine erişemiyor mu?
 * @param {string} telegramId - Telegram ID
 * @param {string} requestedFirmaId - İstenen firma
 * @returns {Promise<boolean>} True = erişim var
 */
async function canAccessFirma(telegramId, requestedFirmaId) {
  const user = await getKullanici(telegramId);
  if (!user) return false;

  // Admin hepsi erişebilir (single-firm'da tek admin)
  if (user.rol === 'admin') return true;

  // Diğerleri sadece kendi firmasına
  return user.firma_id === requestedFirmaId;
}

/**
 * Firma kuruluş kontrolü (patron kontrolü)
 * Bir kullanıcı bu firmaya yeni kullanıcı davet edebilir mi?
 * @param {string} telegramId - Telegram ID
 * @param {string} firmaId - Firma ID
 * @returns {Promise<boolean>} True/False
 */
async function canInviteToFirma(telegramId, firmaId) {
  const user = await getKullanici(telegramId);
  if (!user) return false;

  // Admin hepsi davet edebilir
  if (user.rol === 'admin') return true;

  // Patron sadece kendi firmasına davet edebilir
  if (user.rol === 'patron' && user.firma_id === firmaId) return true;

  return false;
}

module.exports = {
  setCompatUsers,
  DEFAULT_FIRMA_ID,
  getUserFirmaId,
  getKullanici,
  validateUserRole,
  isAdmin,
  isPatron,
  isSef,
  createKullanici,
  updateUserRole,
  assignToSantiye,
  canAccessFirma,
  canInviteToFirma
};

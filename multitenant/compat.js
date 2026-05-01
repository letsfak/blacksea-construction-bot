/**
 * Compat mode — mevcut sistem (hardcoded USERS) ile yeni sistem (Firestore) arasında köprü
 * Faz A'da hiçbir komut değişmeyecek, sadece auth wrapper'lar hazırlanıyor
 *
 * Faz B'de bu kullanılacak: router'lar bunu import edecek ve firma_id otomatik elde edecek
 */

const auth = require('./auth');

const DEFAULT_FIRMA_ID = process.env.DEFAULT_FIRMA_ID || 'your-company-slug';

/**
 * Index.js'i initialize et — COMPAT_USERS'ı auth modüle gönder
 * index.js'in başında çağrılacak:
 *   const { initCompat } = require('./multitenant/compat');
 *   initCompat(USERS);
 *
 * @param {object} users - Hardcoded USERS objekti
 */
function initCompat(users) {
  auth.setCompatUsers(users);
}

/**
 * Komut handler wrapper — otomatik firma_id elde et
 * Faz B'de kullanılacak pattern:
 *
 * const { wrapCommand } = require('./multitenant/compat');
 * const handler = wrapCommand(async (chatId, telegramId, firmaId, args) => {
 *   // firmaId otomatik elde edildi
 *   const data = await db.getIsTakibi(firmaId);
 * });
 *
 * @param {function} handlerFn - Async handler
 * @returns {function} Wrapped handler
 */
function wrapCommand(handlerFn) {
  return async (chatId, telegramId, args = {}) => {
    const firmaId = await auth.getUserFirmaId(telegramId) || DEFAULT_FIRMA_ID;
    return handlerFn(chatId, telegramId, firmaId, args);
  };
}

/**
 * Telegram ID validasyon + firma_id lookup
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<{firma_id: string, user: object}|null>}
 */
async function validateAndGetFirma(telegramId) {
  const user = await auth.getKullanici(telegramId);
  if (!user) return null;

  return {
    firma_id: user.firma_id,
    user
  };
}

/**
 * Cross-firma sızıntı testi (test amaçlı)
 * Belirli bir kullanıcının başka firma verisine erişemediğini kontrol et
 * @param {string} userTelegramId - Test kullanıcısı
 * @param {string} otherFirmaId - İstenmeyen firma
 * @returns {Promise<boolean>} True = izolasyon var (güvenli)
 */
async function testCrossFirmaIsolation(userTelegramId, otherFirmaId) {
  const userFirmaId = await auth.getUserFirmaId(userTelegramId);
  if (!userFirmaId) return true; // Kullanıcı yoksa sıkıntı yok

  // Aynı firma = güvenli
  if (userFirmaId === otherFirmaId) return true;

  // Farklı firma = sızıntı var
  return false;
}

/**
 * Mevcut USERS'ı JSON format'ında göster (migration hazırlığı)
 * @param {object} users - Hardcoded USERS
 * @returns {string} Formatted JSON
 */
function previewUsersMigration(users) {
  const migration = Object.entries(users).map(([telegramId, userData]) => ({
    telegram_id: telegramId,
    firma_id: DEFAULT_FIRMA_ID,
    isim: userData.name,
    rol: userData.role,
    santiye_id: userData.santiye !== 'hepsi' ? userData.santiye : null
  }));

  return JSON.stringify(migration, null, 2);
}

module.exports = {
  DEFAULT_FIRMA_ID,
  initCompat,
  wrapCommand,
  validateAndGetFirma,
  testCrossFirmaIsolation,
  previewUsersMigration
};

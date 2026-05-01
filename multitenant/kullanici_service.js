/**
 * Kullanıcı servisi — kullanıcı oluşturma, güncelleme, listeleme
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Firma kullanıcılarını listele
 * @param {string} firmaId - Firma ID
 * @returns {Promise<Array>} Kullanıcılar
 */
async function listFirmaKullanicilar(firmaId) {
  const snap = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .get();
  return snap.docs.map(d => d.data());
}

/**
 * Rol'e göre kullanıcı bul
 * @param {string} firmaId - Firma ID
 * @param {string} rol - Rol adı
 * @returns {Promise<Array>} Kullanıcılar
 */
async function getKullanicilarByRol(firmaId, rol) {
  const snap = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .where('rol', '==', rol)
    .get();
  return snap.docs.map(d => d.data());
}

/**
 * Şantiyenin şefini bul
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @returns {Promise<object|null>} Şef verisi
 */
async function getSantiyeSef(firmaId, santiyeId) {
  const snap = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .where('santiye_id', '==', santiyeId)
    .where('rol', '==', 'sef')
    .limit(1)
    .get();

  return snap.empty ? null : snap.docs[0].data();
}

/**
 * Şantiyeye ait tüm kullanıcıları bul
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @returns {Promise<Array>} Kullanıcılar
 */
async function getSantiyeKullanicilar(firmaId, santiyeId) {
  const snap = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .where('santiye_id', '==', santiyeId)
    .get();
  return snap.docs.map(d => d.data());
}

/**
 * Kullanıcı izinlerini güncelle
 * @param {string} telegramId - Telegram ID
 * @param {object} izinler - Yeni izinler
 * @returns {Promise<void>}
 */
async function updateKullaniciIzinler(telegramId, izinler) {
  await db.collection('kullanicilar').doc(telegramId).update({
    izinler,
    updated_at: new Date().toISOString()
  });
}

/**
 * Kullanıcıyı deaktive et (silme değil, durum={aktif:false})
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<void>}
 */
async function deactivateKullanici(telegramId) {
  await db.collection('kullanicilar').doc(telegramId).update({
    durum: 'pasif',
    deactivated_at: new Date().toISOString()
  });
}

/**
 * Kullanıcıyı reaktive et
 * @param {string} telegramId - Telegram ID
 * @returns {Promise<void>}
 */
async function reactivateKullanici(telegramId) {
  await db.collection('kullanicilar').doc(telegramId).update({
    durum: 'aktif',
    reactivated_at: new Date().toISOString()
  });
}

/**
 * Kullanıcı bilgisini güncelle
 * @param {string} telegramId - Telegram ID
 * @param {object} data - Güncellenecek veriler
 * @returns {Promise<void>}
 */
async function updateKullanici(telegramId, data) {
  await db.collection('kullanicilar').doc(telegramId).update({
    ...data,
    updated_at: new Date().toISOString()
  });
}

/**
 * Firma'nın tüm yönetici(patron+şef) kullanıcılarını bul
 * @param {string} firmaId - Firma ID
 * @returns {Promise<Array>} Yöneticiler
 */
async function getFirmaYoneticileri(firmaId) {
  const patronlar = await getKullanicilarByRol(firmaId, 'patron');
  const sefler = await getKullanicilarByRol(firmaId, 'sef');
  return [...patronlar, ...sefler];
}

/**
 * Firestore'da tüm firmaları ve kullanıcı sayısını getir
 * @returns {Promise<Array>} Firmalar + kullanıcı sayıları
 */
async function getSystemStats() {
  const firmalar = await db.collection('firmalar').get();
  const stats = [];

  for (const doc of firmalar.docs) {
    const firma = doc.data();
    const userCount = await db.collection('kullanicilar')
      .where('firma_id', '==', firma.firma_id)
      .get();

    stats.push({
      firma_id: firma.firma_id,
      ad: firma.ad,
      plan: firma.plan,
      kullanici_count: userCount.size,
      created: firma.olusturma_tarihi
    });
  }

  return stats;
}

module.exports = {
  listFirmaKullanicilar,
  getKullanicilarByRol,
  getSantiyeSef,
  getSantiyeKullanicilar,
  updateKullaniciIzinler,
  deactivateKullanici,
  reactivateKullanici,
  updateKullanici,
  getFirmaYoneticileri,
  getSystemStats
};

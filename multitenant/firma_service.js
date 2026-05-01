/**
 * Firma servisi — firma oluşturma, güncelleme, listeleme
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Yeni firma oluştur
 * @param {object} data - Firma verisi
 *   {
 *     firma_id: string (unique),
 *     ad: string,
 *     durum: "aktif|pasif",
 *     plan: "free|pro|enterprise",
 *     sahip: { telegram_id, isim },
 *     ozellikler: { santiye_limiti, kullanici_limiti, ai_chatbot }
 *   }
 * @returns {Promise<object>} Oluşturulan firma
 */
async function createFirma(data) {
  if (!data.firma_id || !data.ad) {
    throw new Error('firma_id ve ad zorunlu');
  }

  const firmaData = {
    firma_id: data.firma_id,
    ad: data.ad,
    durum: data.durum || 'aktif',
    plan: data.plan || 'free',
    sahip: data.sahip || {},
    ozellikler: {
      santiye_limiti: data.ozellikler?.santiye_limiti || 4,
      kullanici_limiti: data.ozellikler?.kullanici_limiti || 20,
      ai_chatbot: data.ozellikler?.ai_chatbot !== false
    },
    olusturma_tarihi: new Date().toISOString(),
    trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 gün
  };

  await db.collection('firmalar').doc(data.firma_id).set(firmaData);
  return firmaData;
}

/**
 * Firma bilgisini al
 * @param {string} firmaId - Firma ID
 * @returns {Promise<object|null>} Firma verisi
 */
async function getFirma(firmaId) {
  const doc = await db.collection('firmalar').doc(firmaId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Firma güncelle
 * @param {string} firmaId - Firma ID
 * @param {object} data - Güncellenecek veriler
 * @returns {Promise<object>} Güncellenmiş firma
 */
async function updateFirma(firmaId, data) {
  const updateData = {
    ...data,
    updated_at: new Date().toISOString()
  };

  await db.collection('firmalar').doc(firmaId).update(updateData);

  const doc = await db.collection('firmalar').doc(firmaId).get();
  return doc.data();
}

/**
 * Tüm firmaları listele
 * @param {object} options - Filtre ve limitler
 * @returns {Promise<Array>} Firmalar
 */
async function listFirmalar(options = {}) {
  let query = db.collection('firmalar');

  if (options.durum) {
    query = query.where('durum', '==', options.durum);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => d.data());
}

/**
 * Firma planını güncelle
 * @param {string} firmaId - Firma ID
 * @param {string} plan - Yeni plan (free|pro|enterprise)
 * @returns {Promise<void>}
 */
async function updatePlan(firmaId, plan) {
  await db.collection('firmalar').doc(firmaId).update({
    plan,
    plan_updated_at: new Date().toISOString()
  });
}

/**
 * Firma durumunu değiştir (aktif/pasif)
 * @param {string} firmaId - Firma ID
 * @param {string} durum - "aktif" veya "pasif"
 * @returns {Promise<void>}
 */
async function updateFirmaDurum(firmaId, durum) {
  await db.collection('firmalar').doc(firmaId).update({
    durum,
    updated_at: new Date().toISOString()
  });
}

/**
 * Trial sonlanma tarihini uzat
 * @param {string} firmaId - Firma ID
 * @param {number} days - Kaç gün uzatacak
 * @returns {Promise<void>}
 */
async function extendTrial(firmaId, days = 30) {
  await db.collection('firmalar').doc(firmaId).update({
    trial_expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  });
}

/**
 * Firma kullanıcı sayısını kontrol et
 * @param {string} firmaId - Firma ID
 * @returns {Promise<number>} Aktif kullanıcı sayısı
 */
async function countActiveFirmaUsers(firmaId) {
  const snap = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .get();
  return snap.size;
}

/**
 * Firma şantiye sayısını kontrol et
 * @param {string} firmaId - Firma ID
 * @returns {Promise<number>} Şantiye sayısı
 */
async function countFirmaSantiyeler(firmaId) {
  const snap = await db.collection('santiyeler')
    .where('firma_id', '==', firmaId)
    .get();
  return snap.size;
}

/**
 * Firma limitleri kontrol et (plan'a göre)
 * @param {string} firmaId - Firma ID
 * @returns {Promise<object>} Limit status
 */
async function checkFirmaLimits(firmaId) {
  const firma = await getFirma(firmaId);
  if (!firma) throw new Error('Firma bulunamadı');

  const userCount = await countActiveFirmaUsers(firmaId);
  const santiyeCount = await countFirmaSantiyeler(firmaId);

  return {
    kullanici: {
      current: userCount,
      limit: firma.ozellikler.kullanici_limiti,
      remaining: firma.ozellikler.kullanici_limiti - userCount
    },
    santiye: {
      current: santiyeCount,
      limit: firma.ozellikler.santiye_limiti,
      remaining: firma.ozellikler.santiye_limiti - santiyeCount
    },
    can_add_user: userCount < firma.ozellikler.kullanici_limiti,
    can_add_santiye: santiyeCount < firma.ozellikler.santiye_limiti
  };
}

module.exports = {
  createFirma,
  getFirma,
  updateFirma,
  listFirmalar,
  updatePlan,
  updateFirmaDurum,
  extendTrial,
  countActiveFirmaUsers,
  countFirmaSantiyeler,
  checkFirmaLimits
};

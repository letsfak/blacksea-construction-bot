/**
 * Şantiye servisi — şantiye oluşturma, listeleme, güncelleme
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Yeni şantiye oluştur
 * @param {string} firmaId - Firma ID
 * @param {object} data - Şantiye verisi
 *   {
 *     santiye_id: string (unique within firma),
 *     ad: string,
 *     sefi: string (telegram_id),
 *     mahallar: [string],
 *     durum: "aktif|pasif",
 *     konum: string (optional)
 *   }
 * @returns {Promise<object>} Oluşturulan şantiye
 */
async function createSantiye(firmaId, data) {
  if (!data.santiye_id || !data.ad) {
    throw new Error('santiye_id ve ad zorunlu');
  }

  const docId = `${firmaId}#${data.santiye_id}`;

  const santiyeData = {
    id: docId,
    firma_id: firmaId,
    santiye_id: data.santiye_id,
    ad: data.ad,
    sefi: data.sefi || null,
    mahallar: data.mahallar || [],
    durum: data.durum || 'aktif',
    konum: data.konum || null,
    olusturma_tarihi: new Date().toISOString()
  };

  await db.collection('santiyeler').doc(docId).set(santiyeData);
  return santiyeData;
}

/**
 * Şantiye bilgisini al
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID (local)
 * @returns {Promise<object|null>} Şantiye verisi
 */
async function getSantiye(firmaId, santiyeId) {
  const docId = `${firmaId}#${santiyeId}`;
  const doc = await db.collection('santiyeler').doc(docId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Firma'nın tüm şantiyelerini listele
 * @param {string} firmaId - Firma ID
 * @param {object} options - Filtre ve limitler
 * @returns {Promise<Array>} Şantiyeler
 */
async function listFirmaSantiyeler(firmaId, options = {}) {
  let query = db.collection('santiyeler').where('firma_id', '==', firmaId);

  if (options.durum) {
    query = query.where('durum', '==', options.durum);
  }

  const snap = await query.get();
  return snap.docs.map(d => d.data());
}

/**
 * Şantiye güncelle
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @param {object} data - Güncellenecek veriler
 * @returns {Promise<object>} Güncellenmiş şantiye
 */
async function updateSantiye(firmaId, santiyeId, data) {
  const docId = `${firmaId}#${santiyeId}`;

  const updateData = {
    ...data,
    updated_at: new Date().toISOString()
  };

  await db.collection('santiyeler').doc(docId).update(updateData);

  const doc = await db.collection('santiyeler').doc(docId).get();
  return doc.data();
}

/**
 * Şantiye şefini değiştir
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @param {string} yeniSefTelegramId - Yeni şefin Telegram ID
 * @returns {Promise<void>}
 */
async function assignSantiyeSef(firmaId, santiyeId, yeniSefTelegramId) {
  const docId = `${firmaId}#${santiyeId}`;
  await db.collection('santiyeler').doc(docId).update({
    sefi: yeniSefTelegramId,
    updated_at: new Date().toISOString()
  });
}

/**
 * Şantiye mahalllarını güncelle
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @param {Array<string>} mahallar - Yeni mahaller
 * @returns {Promise<void>}
 */
async function updateMahallar(firmaId, santiyeId, mahallar) {
  const docId = `${firmaId}#${santiyeId}`;
  await db.collection('santiyeler').doc(docId).update({
    mahallar,
    updated_at: new Date().toISOString()
  });
}

/**
 * Şantiye durumunu değiştir
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @param {string} durum - "aktif" veya "pasif"
 * @returns {Promise<void>}
 */
async function updateSantiyeDurum(firmaId, santiyeId, durum) {
  const docId = `${firmaId}#${santiyeId}`;
  await db.collection('santiyeler').doc(docId).update({
    durum,
    updated_at: new Date().toISOString()
  });
}

/**
 * Şantiye kullanıcı sayısını kontrol et
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @returns {Promise<number>} Kullanıcı sayısı
 */
async function countSantiyeKullanicilar(firmaId, santiyeId) {
  const snap = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .where('santiye_id', '==', santiyeId)
    .get();
  return snap.size;
}

/**
 * Şantiye iş kaydı sayısını kontrol et (belirli tarih aralığında)
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @param {Date} tarihBaslangic - Başlangıç tarihi
 * @param {Date} tarihBitis - Bitiş tarihi
 * @returns {Promise<number>} İş sayısı
 */
async function countSantiyeIsleri(firmaId, santiyeId, tarihBaslangic, tarihBitis) {
  const snap = await db.collection('is_takibi')
    .where('firma_id', '==', firmaId)
    .where('santiye', '==', santiyeId)
    .where('tarih', '>=', tarihBaslangic)
    .where('tarih', '<=', tarihBitis)
    .get();
  return snap.size;
}

/**
 * Şantiye toplam malzeme çıkış tutarını hesapla
 * @param {string} firmaId - Firma ID
 * @param {string} santiyeId - Şantiye ID
 * @returns {Promise<number>} Toplam tutar
 */
async function calculateSantiyeMalzemeTutari(firmaId, santiyeId) {
  const snap = await db.collection('malzeme_takibi')
    .where('firma_id', '==', firmaId)
    .where('santiye', '==', santiyeId)
    .where('hareket', '==', 'cikis')
    .get();

  let total = 0;
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (data.tutar) {
      total += parseFloat(data.tutar) || 0;
    }
  });

  return total;
}

module.exports = {
  createSantiye,
  getSantiye,
  listFirmaSantiyeler,
  updateSantiye,
  assignSantiyeSef,
  updateMahallar,
  updateSantiyeDurum,
  countSantiyeKullanicilar,
  countSantiyeIsleri,
  calculateSantiyeMalzemeTutari
};

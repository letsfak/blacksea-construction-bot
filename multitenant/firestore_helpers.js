/**
 * Firestore query wrapper'ları — tüm sorgulara firma_id filtresi otomatik ekleniyor
 * Compat mode: firma_id parametresi verilmezse DEFAULT_FIRMA_ID varsayılır
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// DEFAULT FIRMA: compat mode için (single-tenant uyumluluk)
// Set to your company slug — must match DEFAULT_FIRMA_ID in migrate.js
const DEFAULT_FIRMA_ID = process.env.DEFAULT_FIRMA_ID || 'your-company-slug';

/**
 * İş takibi koleksiyonu — firma_id filtreli
 * @param {string} firmaId - Firma ID (default: process.env.DEFAULT_FIRMA_ID)
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Dokümanlar
 */
async function getIsTakibi(firmaId = DEFAULT_FIRMA_ID, options = {}) {
  let query = db.collection('is_takibi').where('firma_id', '==', firmaId);

  if (options.santiye) {
    query = query.where('santiye', '==', options.santiye);
  }
  if (options.tarih) {
    query = query.where('tarih', '>=', options.tarih);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * İş takibine kayıt ekle
 * @param {string} firmaId - Firma ID
 * @param {object} data - Kayıt verisi (otomatik firma_id eklenir)
 * @returns {Promise<string>} Doküman ID
 */
async function addIsTakibi(firmaId = DEFAULT_FIRMA_ID, data) {
  const docRef = await db.collection('is_takibi').add({
    ...data,
    firma_id: firmaId,
    created_at: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Malzeme takibi — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Dokümanlar
 */
async function getMalzemeTakibi(firmaId = DEFAULT_FIRMA_ID, options = {}) {
  let query = db.collection('malzeme_takibi').where('firma_id', '==', firmaId);

  if (options.santiye) {
    query = query.where('santiye', '==', options.santiye);
  }
  if (options.tarih) {
    query = query.where('tarih', '>=', options.tarih);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Malzeme takibine kayıt ekle
 * @param {string} firmaId - Firma ID
 * @param {object} data - Kayıt verisi
 * @returns {Promise<string>} Doküman ID
 */
async function addMalzemeTakibi(firmaId = DEFAULT_FIRMA_ID, data) {
  const docRef = await db.collection('malzeme_takibi').add({
    ...data,
    firma_id: firmaId,
    created_at: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Şantiye stoku — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {string} santiye - Şantiye ID
 * @returns {Promise<Array>} Stok verisi
 */
async function getSantiyeStoku(firmaId = DEFAULT_FIRMA_ID, santiye = null) {
  let query = db.collection('santiye_stoku').where('firma_id', '==', firmaId);

  if (santiye) {
    query = query.where('santiye', '==', santiye);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Stok güncelle
 * @param {string} firmaId - Firma ID
 * @param {string} docId - Doküman ID
 * @param {object} data - Güncellenecek veriler
 * @returns {Promise<void>}
 */
async function updateSantiyeStoku(firmaId = DEFAULT_FIRMA_ID, docId, data) {
  await db.collection('santiye_stoku').doc(docId).update({
    ...data,
    updated_at: new Date().toISOString()
  });
}

/**
 * Görevler koleksiyonu — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Görevler
 */
async function getGorevler(firmaId = DEFAULT_FIRMA_ID, options = {}) {
  let query = db.collection('gorevler').where('firma_id', '==', firmaId);

  if (options.durum) {
    query = query.where('durum', '==', options.durum);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Görev ekle
 * @param {string} firmaId - Firma ID
 * @param {object} data - Görev verisi
 * @returns {Promise<string>} Doküman ID
 */
async function addGorev(firmaId = DEFAULT_FIRMA_ID, data) {
  const docRef = await db.collection('gorevler').add({
    ...data,
    firma_id: firmaId,
    created_at: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Agent memory — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {string} chatId - Chat ID
 * @returns {Promise<Array>} Memory records
 */
async function getAgentMemory(firmaId = DEFAULT_FIRMA_ID, chatId) {
  let query = db.collection('agent_memory')
    .where('firma_id', '==', firmaId)
    .where('chatId', '==', chatId)
    .orderBy('createdAt', 'desc')
    .limit(100);

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Memory ekle
 * @param {string} firmaId - Firma ID
 * @param {string} chatId - Chat ID
 * @param {object} data - Memory verisi
 * @returns {Promise<string>} Doküman ID
 */
async function addAgentMemory(firmaId = DEFAULT_FIRMA_ID, chatId, data) {
  const docRef = await db.collection('agent_memory').add({
    ...data,
    firma_id: firmaId,
    chatId,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Depo hareketleri — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Hareketler
 */
async function getDepoHareketleri(firmaId = DEFAULT_FIRMA_ID, options = {}) {
  let query = db.collection('depo_hareketleri').where('firma_id', '==', firmaId);

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * İş planı — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Planlı işler
 */
async function getIsPlan(firmaId = DEFAULT_FIRMA_ID, options = {}) {
  let query = db.collection('is_plani').where('firma_id', '==', firmaId);

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * AI geçmişi — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {string} chatId - Chat ID
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Konuşma geçmişi
 */
async function getAiGecmis(firmaId = DEFAULT_FIRMA_ID, chatId, options = {}) {
  let query = db.collection('ai_gecmis')
    .where('firma_id', '==', firmaId)
    .where('chatId', '==', chatId);

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * AI mesajı ekle
 * @param {string} firmaId - Firma ID
 * @param {string} chatId - Chat ID
 * @param {object} data - Mesaj verisi
 * @returns {Promise<string>} Doküman ID
 */
async function addAiMessage(firmaId = DEFAULT_FIRMA_ID, chatId, data) {
  const docRef = await db.collection('ai_gecmis').add({
    ...data,
    firma_id: firmaId,
    chatId,
    created_at: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Günlük notlar — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @param {object} options - Filter seçenekleri
 * @returns {Promise<Array>} Notlar
 */
async function getGunlukNotlar(firmaId = DEFAULT_FIRMA_ID, options = {}) {
  let query = db.collection('gunluk_notlar').where('firma_id', '==', firmaId);

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Sözleşmeler — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @returns {Promise<Array>} Sözleşmeler
 */
async function getSozlesmeler(firmaId = DEFAULT_FIRMA_ID) {
  const snap = await db.collection('sozlesmeler')
    .where('firma_id', '==', firmaId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Siparişler — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @returns {Promise<Array>} Siparişler
 */
async function getSiparisler(firmaId = DEFAULT_FIRMA_ID) {
  const snap = await db.collection('siparisler')
    .where('firma_id', '==', firmaId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Sevkiyatlar — firma_id filtreli
 * @param {string} firmaId - Firma ID
 * @returns {Promise<Array>} Sevkiyatlar
 */
async function getSevkiyatlar(firmaId = DEFAULT_FIRMA_ID) {
  const snap = await db.collection('sevkiyatlar')
    .where('firma_id', '==', firmaId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = {
  DEFAULT_FIRMA_ID,
  getIsTakibi,
  addIsTakibi,
  getMalzemeTakibi,
  addMalzemeTakibi,
  getSantiyeStoku,
  updateSantiyeStoku,
  getGorevler,
  addGorev,
  getAgentMemory,
  addAgentMemory,
  getDepoHareketleri,
  getIsPlan,
  getAiGecmis,
  addAiMessage,
  getGunlukNotlar,
  getSozlesmeler,
  getSiparisler,
  getSevkiyatlar
};

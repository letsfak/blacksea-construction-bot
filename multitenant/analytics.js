/**
 * Analytics — event tracking ve sistem istatistikleri
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Event'i logla (firma bazlı)
 * @param {string} firmaId - Firma ID
 * @param {string} event - Event adı (kurulum_basla, is_kayit, malzeme_cikmasi, vb)
 * @param {object} metadata - Ek veriler
 * @returns {Promise<string>} Doküman ID
 */
async function trackEvent(firmaId, event, metadata = {}) {
  const eventData = {
    firma_id: firmaId,
    event,
    metadata,
    timestamp: new Date().toISOString()
  };

  const docRef = await db.collection('analytics_events').add(eventData);
  return docRef.id;
}

/**
 * Firma bazlı istatistikleri al (belirli tarih aralığında)
 * @param {string} firmaId - Firma ID
 * @param {Date} baslangic - Başlangıç tarihi
 * @param {Date} bitis - Bitiş tarihi
 * @returns {Promise<object>} İstatistikler
 */
async function getFirmaStats(firmaId, baslangic, bitis) {
  const snap = await db.collection('analytics_events')
    .where('firma_id', '==', firmaId)
    .where('timestamp', '>=', baslangic.toISOString())
    .where('timestamp', '<=', bitis.toISOString())
    .get();

  const events = snap.docs.map(d => d.data());

  // Event sayılarını say
  const eventCounts = {};
  events.forEach(evt => {
    eventCounts[evt.event] = (eventCounts[evt.event] || 0) + 1;
  });

  // Günlük dağılım
  const dailyStats = {};
  events.forEach(evt => {
    const date = new Date(evt.timestamp).toISOString().split('T')[0];
    dailyStats[date] = (dailyStats[date] || 0) + 1;
  });

  return {
    firma_id: firmaId,
    period: {
      start: baslangic.toISOString(),
      end: bitis.toISOString()
    },
    total_events: events.length,
    event_counts: eventCounts,
    daily_stats: dailyStats
  };
}

/**
 * Global sistem istatistikleri (tüm firmalar)
 * @returns {Promise<object>} Sistem stats
 */
async function globalStats() {
  const firmalarSnap = await db.collection('firmalar').get();
  const firmaCount = firmalarSnap.size;

  const kullanicilarSnap = await db.collection('kullanicilar').get();
  const kullaniciCount = kullanicilarSnap.size;

  const santiyelerSnap = await db.collection('santiyeler').get();
  const santiyeCount = santiyelerSnap.size;

  // Son 24 saatin event'leri
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const eventsSnap = await db.collection('analytics_events')
    .where('timestamp', '>=', oneDayAgo)
    .get();

  const eventCounts = {};
  eventsSnap.docs.forEach(doc => {
    const event = doc.data().event;
    eventCounts[event] = (eventCounts[event] || 0) + 1;
  });

  // Aktif kullanıcılar (geçen hafta aktivite yapanlar)
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activeEventsSnap = await db.collection('analytics_events')
    .where('timestamp', '>=', oneWeekAgo)
    .get();

  const activeFirmas = new Set();
  activeEventsSnap.docs.forEach(doc => {
    activeFirmas.add(doc.data().firma_id);
  });

  return {
    summary: {
      total_firmas: firmaCount,
      total_kullanicilar: kullaniciCount,
      total_santiyeler: santiyeCount,
      aktif_firmalar_1week: activeFirmas.size
    },
    last_24h_events: eventCounts,
    timestamp: new Date().toISOString()
  };
}

/**
 * Firma'nın günlük mesaj/aktivite sayısını al
 * @param {string} firmaId - Firma ID
 * @param {number} days - Son kaç gün
 * @returns {Promise<object>} Günlük aktivite
 */
async function getFirmaDailyActivity(firmaId, days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const snap = await db.collection('analytics_events')
    .where('firma_id', '==', firmaId)
    .where('timestamp', '>=', cutoff)
    .get();

  const daily = {};
  snap.docs.forEach(doc => {
    const date = new Date(doc.data().timestamp).toISOString().split('T')[0];
    daily[date] = (daily[date] || 0) + 1;
  });

  return {
    firma_id: firmaId,
    days,
    daily_activity: daily,
    total_events: snap.size
  };
}

/**
 * Firma'nın plan durumunu ve kullanım kontrolü
 * @param {string} firmaId - Firma ID
 * @returns {Promise<object>} Plan status
 */
async function checkFirmaPlanUsage(firmaId) {
  const firmaSnap = await db.collection('firmalar').doc(firmaId).get();
  if (!firmaSnap.exists) return null;

  const firma = firmaSnap.data();

  // Kullanıcı sayısı
  const userCount = await db.collection('kullanicilar')
    .where('firma_id', '==', firmaId)
    .get();

  // Şantiye sayısı
  const santiyeCount = await db.collection('santiyeler')
    .where('firma_id', '==', firmaId)
    .get();

  // İş kaydı sayısı (geçen ay)
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const isCount = await db.collection('is_takibi')
    .where('firma_id', '==', firmaId)
    .where('tarih', '>=', oneMonthAgo)
    .get();

  const trialExpiry = firma.trial_expires_at
    ? new Date(firma.trial_expires_at)
    : null;
  const trialExpired = trialExpiry && new Date() > trialExpiry;

  return {
    firma_id: firmaId,
    plan: firma.plan,
    trial_expired: trialExpired,
    trial_expires_at: firma.trial_expires_at,
    usage: {
      kullanicilar: {
        current: userCount.size,
        limit: firma.ozellikler.kullanici_limiti
      },
      santiyeler: {
        current: santiyeCount.size,
        limit: firma.ozellikler.santiye_limiti
      },
      is_kayitlari_30day: isCount.size
    }
  };
}

/**
 * En aktif firmaları listele
 * @param {number} limit - Kaç firma?
 * @param {number} days - Son kaç gün?
 * @returns {Promise<Array>} Top firmalar
 */
async function getTopActiveFirmas(limit = 10, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const snap = await db.collection('analytics_events')
    .where('timestamp', '>=', cutoff)
    .get();

  const firmaCounts = {};
  snap.docs.forEach(doc => {
    const firmaId = doc.data().firma_id;
    firmaCounts[firmaId] = (firmaCounts[firmaId] || 0) + 1;
  });

  const sorted = Object.entries(firmaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([firmaId, count]) => ({ firma_id: firmaId, event_count: count }));

  return sorted;
}

module.exports = {
  trackEvent,
  getFirmaStats,
  globalStats,
  getFirmaDailyActivity,
  checkFirmaPlanUsage,
  getTopActiveFirmas
};

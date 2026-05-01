/**
 * Invite handler — /start invite_TOKEN linkini işler
 *
 * Akış:
 *   1. Kullanıcı bot'a t.me/YOUR_BOT_USERNAME?start=invite_XYZ ile geliyor
 *   2. /start invite_XYZ mesajı gelir
 *   3. Token doğrulanır → kullanıcı kullanicilar koleksiyonuna eklenir
 *   4. Davetiye "kullanildi" olarak işaretlenir
 *   5. Sahibe bildirim gönderilir
 */

const admin = require('firebase-admin');
const inviteSvc = require('./invite');
const firmaSvc = require('./firma_service');

// Set this to your admin's Telegram chat ID (get from @userinfobot)
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'YOUR_ADMIN_CHAT_ID';

let _db = null;
let _send = null;

function init({ db, send }) {
  _db = db || admin.firestore();
  _send = send;
}

/**
 * /start invite_TOKEN mesajını işle
 *
 * @param {object} msg - Telegram message
 * @returns {boolean} true = mesaj invite tarafından tüketildi
 */
async function handleInviteStart(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();

  // /start invite_XYZ formatı
  const match = text.match(/^\/start(?:\s+|@\w+\s+)invite[_-](\S+)$/i);
  if (!match) return false;

  const token = match[1].trim().toUpperCase();

  // 1. Kullanıcı zaten kayıtlı mı?
  const existingUser = await _db.collection('kullanicilar').doc(chatId).get();
  if (existingUser.exists) {
    const ud = existingUser.data();
    await _send(chatId,
      `Bu Telegram hesabı zaten kayıtlı.\n` +
      `Firma: ${ud.firma_id}\n` +
      `İsim: ${ud.isim}\n\n` +
      `Devam etmek için /start yazın.`);
    return true;
  }

  // 2. Davetiye geçerli mi?
  const invite = await inviteSvc.getInviteCode(token);
  if (!invite) {
    await _send(chatId,
      `❌ Bu davet bağlantısı geçersiz veya süresi doldu.\n\n` +
      `Firma sahibinizden yeni bir davet bağlantısı isteyin.`);
    return true;
  }

  if (invite.status === 'kullanildi') {
    await _send(chatId,
      `❌ Bu davet bağlantısı daha önce kullanılmış.\n\n` +
      `Firma sahibinizden yeni bir davet bağlantısı isteyin.`);
    return true;
  }

  // 3. Telegram bilgilerini al
  const tgAd = `${msg.from?.first_name || ''} ${msg.from?.last_name || ''}`.trim();
  const tgUsername = msg.from?.username || '';
  const isim = invite.invitee_name || tgAd || tgUsername || 'Kullanıcı';

  try {
    // 4. Davetiyeyi kullan (kullanıcı oluşturulur + invite işaretlenir)
    const result = await inviteSvc.redeemInvite(token, chatId, isim);

    if (!result.success) {
      await _send(chatId, `❌ ${result.message}`);
      return true;
    }

    // 5. Firma adı al
    const firma = await firmaSvc.getFirma(invite.firma_id);
    const firmaAd = firma?.ad || invite.firma_id;
    const santiyeAd = invite.invitee_santiye_ad || invite.santiye_id || 'belirtilmemiş';

    // 6. Hoş geldiniz mesajı
    await _send(chatId,
      `🎉 Hoş geldiniz, ${isim}!\n\n` +
      `📛 Firma: ${firmaAd}\n` +
      `👤 Rol: ${invite.rol}\n` +
      `🏗️ Şantiye: ${santiyeAd}\n\n` +
      `Komutları görmek için /yardim yazın.\n` +
      `Başlamak için /start yazın.`);

    // 7. Firma sahibine bildirim
    if (firma?.sahip?.telegram_id) {
      try {
        await _send(firma.sahip.telegram_id,
          `🆕 ${isim} (@${tgUsername || '-'}) ekibe katıldı.\n` +
          `Rol: ${invite.rol} — Şantiye: ${santiyeAd}`);
      } catch (e) {
        console.error('Owner bildirim hata:', e.message);
      }
    }

    // 8. Admin analytics bildirimi
    try {
      await _send(ADMIN_CHAT_ID,
        `👥 Yeni ekip üyesi: ${isim} → ${firmaAd} (${invite.rol}/${santiyeAd})`);
    } catch (e) { /* swallow */ }

    return true;

  } catch (err) {
    console.error('handleInviteStart hata:', err);
    await _send(chatId,
      `❌ Davet kabul edilirken bir hata oluştu: ${err.message}\n\n` +
      `Lütfen daha sonra tekrar deneyin veya firma sahibinize bildirin.`);
    return true;
  }
}

module.exports = {
  init,
  handleInviteStart
};

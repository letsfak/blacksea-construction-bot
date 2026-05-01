// Santiye Rehber Excel — node generate-rehber.js
const ExcelJS = require('exceljs');
const path = require('path');

const wb = new ExcelJS.Workbook();
wb.creator = 'Santiye Bot';
wb.created = new Date();

// ─── RENK PALETİ ─────────────────────────────────────────────────────────────
const LACIVERT = '1A3A5C';
const ACIK     = 'EBF2FA';
const SARI     = 'FFF8E1';
const YESIL    = 'D4EDDA';
const TURUNCU  = 'FFF3CD';
const BEYAZ    = 'FFFFFF';
const GRI      = 'F5F5F5';

function baslik(ws, row, col, text, bg = LACIVERT, fg = BEYAZ, sz = 12) {
  const cell = ws.getCell(row, col);
  cell.value = text;
  cell.font  = { bold: true, color: { argb: 'FF' + fg }, size: sz };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
}

function deger(ws, row, col, text, bg = BEYAZ) {
  const cell = ws.getCell(row, col);
  cell.value = text;
  cell.font  = { size: 11 };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bg } };
  cell.alignment = { vertical: 'middle', wrapText: true };
  cell.border = { bottom: { style: 'hair', color: { argb: 'FFEEEEEE' } } };
}

function satirBaslik(ws, row, cols, texts, bgs) {
  texts.forEach((t, i) => baslik(ws, row, cols + i, t, bgs[i] || LACIVERT));
}

function bolumBasligi(ws, row, text, merge = 'A:F') {
  const cell = ws.getCell(`A${row}`);
  cell.value = text;
  cell.font  = { bold: true, color: { argb: 'FF' + BEYAZ }, size: 13 };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LACIVERT } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.mergeCells(`A${row}:F${row}`);
  ws.getRow(row).height = 24;
}

// ══════════════════════════════════════════════════════════════════════════════
// SAYFA 1 — KULLANICILAR
// ══════════════════════════════════════════════════════════════════════════════
const ws1 = wb.addWorksheet('Kullanıcılar & Roller', { properties: { tabColor: { argb: 'FF1A3A5C' } } });
ws1.columns = [
  { width: 22 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 30 }, { width: 20 }
];

ws1.getRow(1).height = 36;
const title1 = ws1.getCell('A1');
title1.value = 'ŞANTİYE BOTU — KULLANICILAR & ROLLER';
title1.font = { bold: true, size: 15, color: { argb: 'FF' + LACIVERT } };
title1.alignment = { vertical: 'middle' };
ws1.mergeCells('A1:F1');

ws1.getRow(2).height = 20;
satirBaslik(ws1, 2, 1, ['Kişi', 'Rol', 'Şantiye', 'Durum', 'Ne Yapabilir', 'Telegram'], [LACIVERT,LACIVERT,LACIVERT,LACIVERT,LACIVERT,LACIVERT]);

const kullanicilar = [
  ['Patron',      'Patron',    'Tümü',    'Aktif',           'AI chatbot, /stok, görev atama, satış modülü, Dropbox', 'Aktif'],
  ['Müdür',       'Müdür',     'Site 4',  'Aktif',           'İş girişi, malzeme, stok — TÜM şantiyeler stok, AI chatbot, görev atama', 'Aktif'],
  ['Satınalma',   'Satınalma', '—',       'Aktif',           'Bağlantı, sevkiyat, ana depo, şantiye stok görme', 'Aktif'],
  ['Şef 3',       'Şef',       'Site 3',  'Aktif',           'İş girişi, malzeme, stok kullandım, stok durumu (kendi şantiyesi)', 'Aktif'],
  ['Şef 2',       'Şef',       'Site 2',  'Aktif',           'İş girişi, malzeme, stok kullandım, stok durumu (kendi şantiyesi)', 'Aktif'],
  ['Şef 1',       'Şef',       'Site 1',  'BEKLEYEN',        'İş girişi, malzeme, stok kullandım, stok durumu (kendi şantiyesi)', 'Bota /start yazması bekleniyor'],
  ['Admin',       'Admin',     'Tümü',    'Aktif',           'Tüm yetkiler', 'Aktif'],
];

kullanicilar.forEach((r, i) => {
  const row = 3 + i;
  ws1.getRow(row).height = 20;
  const bg = r[3] === 'BEKLEYEN' ? TURUNCU : (i % 2 === 0 ? BEYAZ : GRI);
  r.forEach((v, c) => deger(ws1, row, c + 1, v, bg));
});

// ══════════════════════════════════════════════════════════════════════════════
// SAYFA 2 — ŞEF TALİMATLARI
// ══════════════════════════════════════════════════════════════════════════════
const ws2 = wb.addWorksheet('Şef Talimatları', { properties: { tabColor: { argb: 'FF2E7D32' } } });
ws2.columns = [{ width: 5 }, { width: 25 }, { width: 40 }, { width: 35 }, { width: 25 }];

let r2 = 1;
ws2.getRow(r2).height = 36;
const t2 = ws2.getCell('A1');
t2.value = 'ŞEF / MÜDÜR — ADIM ADIM KULLANIM TALİMATLARI';
t2.font = { bold: true, size: 14, color: { argb: 'FF' + LACIVERT } };
t2.alignment = { vertical: 'middle' };
ws2.mergeCells('A1:E1');

const sefMenu = [
  ['1', 'İş Girişi Yap',            'Günlük yapılan imalatı kayıt altına alır',              'İş gücü → Adam sayısı → Ne yapıldı → Miktar/birim → Mahal → Açıklama → Görev → Fotoğraf',  'Patron + Admin\'e bildirim gider'],
  ['2', 'Malzeme Girişi',           'Şantiyeye gelen malzemeyi kaydeder, stoka ekler',       'Ne geldi → Miktar/birim → Firma → Not',                                                     'santiye_stoku\'na giriş eklenir'],
  ['3', 'Stok Kullandım',           'Malzeme nerede kullanıldı, stoktan düşer',              'Malzeme → Miktar/birim → Nerede kullanıldı',                                                'santiye_stoku\'na çıkış eklenir'],
  ['4', 'Stok Durumu',              'Şantiyenin anlık stok durumu (Müdür: tüm şantiyeler)', '— (listeleme, adım yok)',                                                                   'Şef: kendi şantiyesi / Müdür: tümü'],
  ['5', 'Günlük Not',               'Serbest metin, gün sonu notu',                          'Metin yaz',                                                                                 'gunluk_notlar koleksiyonuna kaydedilir'],
  ['6', 'Depodan Malzeme Al',       'Ana depodan alınan malzeme',                   'Ne alınıyor → Miktar/birim → Not',                                                          'depo_hareketleri\'ne cikis kaydedilir'],
];

r2 = 2;
ws2.getRow(r2).height = 18;
satirBaslik(ws2, r2, 1, ['#', 'Menü Seçeneği', 'Ne Yapar', 'Adımlar', 'Notlar'], [LACIVERT,LACIVERT,LACIVERT,LACIVERT,LACIVERT]);

sefMenu.forEach((row, i) => {
  r2++;
  ws2.getRow(r2).height = 36;
  row.forEach((v, c) => deger(ws2, r2, c + 1, v, i % 2 === 0 ? BEYAZ : ACIK));
});

r2 += 2;
bolumBasligi(ws2, r2, '► ÖRNEK DİYALOG — İŞ GİRİŞİ');
r2++;
const ornek = [
  ['Bot sorar', 'Şef yanıtlar', '', '', ''],
  ['İş gücü?', '4 (Demir Ekibi)', '', '', ''],
  ['Kaç adam?', '4', '', '', ''],
  ['Ne yapıldı?', 'Kolon demiri', '', '', ''],
  ['Miktar ve birim?', '250kg', '', '', ''],
  ['Mahal?', '3. Kat  veya  Teknik Blok  veya  A Blok Zemin Kat', '', '', ''],
  ['Açıklama?', 'A aksı kolonlar tamamlandı', '', '', ''],
  ['Görev?', 'Genel (veya atanmış görevi seçer)', '', '', ''],
  ['Fotoğraf gönder veya "yok" yaz.', '[fotoğraf gönderir]', '', '', ''],
];
ornek.forEach((row, i) => {
  ws2.getRow(r2).height = 18;
  deger(ws2, r2, 1, row[0], i === 0 ? LACIVERT : (i % 2 === 0 ? SARI : BEYAZ));
  if (i === 0) { ws2.getCell(r2, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; }
  deger(ws2, r2, 2, row[1], i === 0 ? LACIVERT : (i % 2 === 0 ? SARI : BEYAZ));
  if (i === 0) { ws2.getCell(r2, 2).font = { bold: true, color: { argb: 'FFFFFFFF' } }; }
  r2++;
});

// ══════════════════════════════════════════════════════════════════════════════
// SAYFA 3 — SATINALMA TALİMATLARI
// ══════════════════════════════════════════════════════════════════════════════
const ws3 = wb.addWorksheet('Satınalma Talimatları', { properties: { tabColor: { argb: 'FFE65100' } } });
ws3.columns = [{ width: 5 }, { width: 28 }, { width: 40 }, { width: 35 }, { width: 25 }];

let r3 = 1;
ws3.getRow(r3).height = 36;
const t3 = ws3.getCell('A1');
t3.value = 'SATINALMA — KULLANIM TALİMATLARI';
t3.font = { bold: true, size: 14, color: { argb: 'FF' + LACIVERT } };
t3.alignment = { vertical: 'middle' };
ws3.mergeCells('A1:E1');

const satinalmaMenu = [
  ['1', 'Yeni Bağlantı Gir',       'Tedarikçi anlaşması sisteme girilir',               'Malzeme → Toplam miktar → Birim → Firma → Not',                         'siparisler koleksiyonuna kaydedilir'],
  ['2', 'Açık Bağlantılar',        'Devam eden bağlantıların anlık durumu',             '— (listeleme)',                                                         'Kalan miktarlar gösterilir'],
  ['3', 'Şantiyeye Gönder',        'Tedarikçi malı gönderince kalan miktarı düşürür',   'Bağlantı seç → Gönderilen miktar → Hangi şantiye',                      'kalan_miktar azalır, sevkiyatlar\'a kayıt'],
  ['4', 'Depoya Giriş Yap',        'Ana depoya mal konuldu',                   'Malzeme → Miktar/birim → Not',                                          'depo_hareketleri tip:giris'],
  ['5', 'Depodan Çıkış Yap',       'Ana depodan mal alındı',                   'Malzeme → Miktar/birim → Şantiye → Kim aldı → Not',                     'depo_hareketleri tip:cikis'],
  ['6', 'Depo Stok Durumu',        'Ana depo anlık stok',                      '— (listeleme)',                                                         'Giriş − Çıkış = Kalan'],
  ['7', 'Şantiye Stok Durumu',     'Tüm şantiyelerde şeflerin kaydettiği stok',         '— (listeleme)',                                                         'Şeflerin girdiği malzeme hareketleri'],
];

r3 = 2;
ws3.getRow(r3).height = 18;
satirBaslik(ws3, r3, 1, ['#', 'Menü Seçeneği', 'Ne Yapar', 'Adımlar', 'Firestore'], [LACIVERT,LACIVERT,LACIVERT,LACIVERT,LACIVERT]);
satinalmaMenu.forEach((row, i) => {
  r3++;
  ws3.getRow(r3).height = 36;
  row.forEach((v, c) => deger(ws3, r3, c + 1, v, i % 2 === 0 ? BEYAZ : ACIK));
});

r3 += 2;
bolumBasligi(ws3, r3, '► ÖRNEK: TEDARİK → ŞANTİYE AKIŞI');
r3++;
const akis = [
  ['Adım', 'Kim', 'Yapar', 'Sonuç'],
  ['1', 'Satınalma', '"Tedarikçiden 10 ton demir aldık" → Bağlantı girer', 'kalan_miktar = 10 ton'],
  ['2', 'Satınalma', '"2 ton Site 2\'ye gönderildi" → Şantiyeye gönder', 'kalan_miktar = 8 ton'],
  ['3', 'Şef 2', '"2 ton demir geldi" → Malzeme girişi', 'Site 2 santiye_stoku +2 ton'],
  ['4', 'Şef 2', '"500kg 1. Kat tabliyede kullandık" → Stok kullandım', 'santiye_stoku kalan: 1.5 ton'],
  ['5', 'Satınalma', '"7" → Şantiye stok durumu', 'Site 2: 1.5 ton kaldı görünür'],
  ['6', 'Patron', '"/stok" yazıyor', 'Tüm şantiyeler + ana depo raporu'],
];
akis.forEach((row, i) => {
  ws3.getRow(r3).height = i === 0 ? 18 : 28;
  row.forEach((v, c) => {
    deger(ws3, r3, c + 1, v, i === 0 ? LACIVERT : (i % 2 === 0 ? YESIL : BEYAZ));
    if (i === 0) ws3.getCell(r3, c + 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  r3++;
});

// ══════════════════════════════════════════════════════════════════════════════
// SAYFA 4 — ŞANTİYELER & MAHAL
// ══════════════════════════════════════════════════════════════════════════════
const ws4 = wb.addWorksheet('Şantiyeler & Mahal', { properties: { tabColor: { argb: 'FF6A1B9A' } } });
ws4.columns = [{ width: 16 }, { width: 22 }, { width: 60 }, { width: 20 }];

let r4 = 1;
ws4.getRow(r4).height = 36;
const t4 = ws4.getCell('A1');
t4.value = 'ŞANTİYELER, ŞEFLER VE MAHAL LİSTESİ';
t4.font = { bold: true, size: 14, color: { argb: 'FF' + LACIVERT } };
t4.alignment = { vertical: 'middle' };
ws4.mergeCells('A1:D1');

r4 = 2;
ws4.getRow(r4).height = 18;
satirBaslik(ws4, r4, 1, ['Şantiye', 'Şef', 'Mahal Seçenekleri', 'Durum'], [LACIVERT,LACIVERT,LACIVERT,LACIVERT]);

const santiyeler = [
  ['Site 1', 'Şef 1', '1.Bodrum, 2.Bodrum, Zemin Kat, 1.Kat, 2.Kat, 3.Kat, 4.Kat, Çatı Katı, Genel', 'Şef bekleniyor'],
  ['Site 2', 'Şef 2', 'A/B/C/D Blok × (Zemin, 1.Kat, 2.Kat, 3.Kat, 4.Kat, 5.Kat, Dublex 6-7.Kat), Villa 1-17, Genel', 'Aktif'],
  ['Site 3', 'Şef 3', 'Villa 1, Villa 2, Villa 3, Villa 4, Villa 5, Genel', 'Aktif'],
  ['Site 4', 'Müdür', 'Engelli Rampası, Merdiven, Ek Bina - İç, Ek Bina - Dış / Arası, Teknik Blok, Çatı, Genel / Dış Saha', 'Aktif'],
];
santiyeler.forEach((row, i) => {
  r4++;
  ws4.getRow(r4).height = 40;
  row.forEach((v, c) => {
    const bg = row[3] === 'Şef bekleniyor' ? TURUNCU : (i % 2 === 0 ? BEYAZ : ACIK);
    deger(ws4, r4, c + 1, v, bg);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// KAYDET
// ══════════════════════════════════════════════════════════════════════════════
const outPath = path.join(process.cwd(), 'santiye-rehber.xlsx');
wb.xlsx.writeFile(outPath).then(() => {
  console.log('✅ Excel kaydedildi: ' + outPath);
}).catch(e => { console.error(e); process.exit(1); });

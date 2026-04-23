'use strict';
const PDFDocument = require('pdfkit');
const fs = require('fs');
const sharp = require('sharp');

// ─── Indonesian date helpers ────────────────────────────────
const HARI_ID  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];

const ANGKA_TEXT = ['','Satu','Dua','Tiga','Empat','Lima','Enam','Tujuh',
  'Delapan','Sembilan','Sepuluh','Sebelas','Dua Belas','Tiga Belas',
  'Empat Belas','Lima Belas','Enam Belas','Tujuh Belas','Delapan Belas',
  'Sembilan Belas','Dua Puluh','Dua Puluh Satu','Dua Puluh Dua',
  'Dua Puluh Tiga','Dua Puluh Empat','Dua Puluh Lima','Dua Puluh Enam',
  'Dua Puluh Tujuh','Dua Puluh Delapan','Dua Puluh Sembilan','Tiga Puluh',
  'Tiga Puluh Satu'];

const TAHUN_TEXT = {
  2024: 'Dua Ribu Dua Puluh Empat',
  2025: 'Dua Ribu Dua Puluh Lima',
  2026: 'Dua Ribu Dua Puluh Enam',
  2027: 'Dua Ribu Dua Puluh Tujuh',
};

function parseDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d) ? new Date() : d;
}

function fmtShort(val) {        // dd/mm/yyyy
  const d = parseDate(val);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtLong(val) {         // day, tanggal bulan tahun (dd/mm/yyyy)
  const d   = parseDate(val);
  const tgl = d.getDate();
  const bln = d.getMonth();
  const thn = d.getFullYear();
  const tglTxt = ANGKA_TEXT[tgl] || String(tgl);
  const thnTxt = TAHUN_TEXT[thn] || String(thn);
  return `${HARI_ID[d.getDay()]} tanggal ${tglTxt} bulan ${BULAN_ID[bln]} tahun ${thnTxt} (${fmtShort(val)})`;
}

// ─── Auto signature via SVG ─────────────────────────────────
async function autoSig(name) {
  const n = (name || 'Pelanggan').trim();
  const display = n.length > 22 ? n.substring(0,20) + '..' : n;
  const svg = `<svg width="220" height="70" xmlns="http://www.w3.org/2000/svg">
    <text x="110" y="32" font-family="Georgia,serif" font-size="21" font-style="italic"
      fill="#1a2060" text-anchor="middle" letter-spacing="1">${display}</text>
    <path d="M15 45 C 60 38, 160 38, 205 45" stroke="#1a2060" stroke-width="1.2" fill="none"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Conclusion text ────────────────────────────────────────
function kesimpulan(r) {
  const c1 = parseInt(r.tera_conclution1) || 0;
  const c2 = parseInt(r.tera_conclution2) || 0;
  if (c1 === 1 && c2 === 0)  return 'Meter masih akurat, tidak perlu diganti';
  if (c1 === 0 && c2 === 0)  return `Diusulkan ganti meter (${r.tera_desc || 'water meter rusak'})`;
  if (c1 === 1 && c2 === 2)  return `Diusulkan penggantian kaca meter (${r.tera_desc || 'buram'})`;
  if (c1 === 0 && c2 === 2)  return `Diusulkan ganti kaca & meter (${r.tera_desc || '-'})`;
  return r.tera_desc || 'Perlu pengecekan lebih lanjut';
}

// ─── Main ───────────────────────────────────────────────────
async function generatePDF(record, sigPetugasPath, sigKetuaPath, outPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const W  = 595.28;
  const mL = 45, mR = 45, mT = 0;
  const CW = W - mL - mR;   // usable content width

  // colour palette
  const C_DARK   = '#002060';
  const C_TEXT   = '#111111';
  const C_GRAY   = '#f2f2f2';
  const C_BORDER = '#999999';
  const C_LINE   = '#cccccc';

  // ── helpers ──────────────────────────────────────────────
  let y = mT;

  function ln(size = 8.5) { return size * 1.35; }

  function text(str, x, yPos, opts = {}) {
    doc.text(str, x, yPos, opts);
  }

  function infoRow(label, value, xL, yPos, labelW = 160) {
    doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
       .text(label,        xL,           yPos, { width: labelW });
    doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
       .text(`: ${value || '-'}`, xL + labelW, yPos, { width: CW - labelW });
    return yPos + ln(8.5);
  }

  function hLine(yPos, x1 = mL, x2 = mL + CW) {
    doc.moveTo(x1, yPos).lineTo(x2, yPos).strokeColor(C_LINE).lineWidth(0.5).stroke();
  }

  // ════════════════════════════════════════════════════════
  // HEADER
  // ════════════════════════════════════════════════════════
  y = 20;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C_DARK)
     .text('PERUMDA AIR MINUM TIRTA MAKMUR', mL, y, { width: CW, align: 'center' });
  y += ln(13);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C_DARK)
     .text('KABUPATEN SUKOHARJO', mL, y, { width: CW, align: 'center' });
  y += ln(11) + 2;
  doc.rect(mL, y, CW, 1.5).fill(C_DARK);
  y += 6;

  // ════════════════════════════════════════════════════════
  // SURAT PERINTAH KERJA  (top half, matches original)
  // ════════════════════════════════════════════════════════
  const spkDate = record.spk_date || record.ba_date || record.cc_date;

  // SPK title
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C_DARK)
     .text('SURAT PERINTAH KERJA TERA WATER METER SAMBUNGAN RUMAH PELANGGAN',
           mL, y, { width: CW, align: 'center' });
  y += ln(10) + 4;

  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Diperintahkan kepada pegawai berikut ini :', mL, y);
  y += ln(8.5) + 2;

  y = infoRow('Nama', record.petugasnm, mL, y);
  y = infoRow('Jabatan', 'Kasubbag Penagihan dan Meter segel', mL, y);
  y += 3;

  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Untuk melaksanakan peneraan water meter sambungan rumah pelanggan dibawah ini :', mL, y);
  y += ln(8.5) + 2;

  y = infoRow('Nama Pelanggan',  record.cust_name,    mL, y);
  y = infoRow('Alamat Sambungan',record.cust_address, mL, y);
  y = infoRow('Nomor Sambungan', String(record.cust_code || '-'), mL, y);
  y = infoRow('Keterangan',      record.tera_desc || '-', mL, y);
  y += 3;

  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Demikian surat perintah ini diterbitkan untuk dilaksanakan dengan penuh tanggung jawab.', mL, y);
  y += ln(8.5) + 3;

  // Ketua signature block (right-aligned)
  const spkRightX = mL + CW * 0.55;
  const spkSigW   = CW * 0.45;

  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text(`Sukoharjo, ${fmtShort(spkDate)}`, spkRightX, y, { width: spkSigW, align: 'center' });
  y += ln(8.5);
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Dibuat Oleh :', spkRightX, y, { width: spkSigW, align: 'center' });
  y += ln(8.5);
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text(`Korhublang, ${record.officenm || 'SUKOHARJO SELATAN'}`, spkRightX, y, { width: spkSigW, align: 'center' });
  y += ln(8.5);

  const spkSigTop = y;

  // Place ketua signature image
  if (sigKetuaPath && fs.existsSync(sigKetuaPath)) {
    try {
      doc.image(sigKetuaPath, spkRightX + (spkSigW - 100) / 2, y, { width: 100, height: 42 });
    } catch(e) {}
  }
  y += 50;

  // Ketua name line
  const lineX1 = spkRightX + 10;
  const lineX2 = spkRightX + spkSigW - 10;
  doc.moveTo(lineX1, y).lineTo(lineX2, y).strokeColor(C_TEXT).lineWidth(0.7).stroke();
  y += 3;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C_TEXT)
     .text('Harsono, S.H.', spkRightX, y, { width: spkSigW, align: 'center' });
  y += ln(8.5);
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('NIPP. 000477085', spkRightX, y, { width: spkSigW, align: 'center' });
  y += ln(8.5) + 4;

  hLine(y);
  y += 8;

  // ════════════════════════════════════════════════════════
  // BERITA ACARA
  // ════════════════════════════════════════════════════════
  const baDate = record.ba_date || record.spk_date || record.cc_date;

  // date top-right
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text(`Sukoharjo, ${fmtShort(baDate)}`, mL, y, { width: CW, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Dibuat Oleh :', mL, y + ln(8.5), { width: CW, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Petugas Tera Meter', mL, y + ln(8.5) * 2, { width: CW, align: 'right' });

  // BA title centred
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C_DARK)
     .text('BERITA ACARA TERA METER AIR PELANGGAN', mL, y, { width: CW * 0.65, align: 'center' });
  y += ln(10) + 4;

  // Preamble
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text(`Pada hari ini ${fmtLong(baDate)}`, mL, y, { width: CW });
  y += ln(8.5);
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Yang bertanda tangan di bawah ini :', mL, y);
  y += ln(8.5) + 2;

  y = infoRow('Nama',    record.petugasnm, mL, y);
  y = infoRow('Jabatan', 'Kasubbag Penagihan dan Meter segel', mL, y);
  y += 2;

  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Telah mengadakan peneraan/pengecekan meter pelanggan dengan alamat sbb :', mL, y);
  y += ln(8.5) + 2;

  y = infoRow('Nama Pelanggan',   record.cust_name,    mL, y);
  y = infoRow('Alamat Sambungan', record.cust_address, mL, y);
  y = infoRow('Nomor Sambungan',  String(record.cust_code || '-'), mL, y);
  y = infoRow('Merk Meter',       record.merk_meter || 'amico', mL, y);
  y = infoRow('Nomor Seri Meter Air', record.cust_wmno || '-', mL, y);
  const hasilTera = (record.tera_equipment || 'gelas ukur').toLowerCase().includes('gelas')
    ? 'Pengecekan menggunakan gelas ukur/ember'
    : (record.tera_equipment || 'Pengecekan menggunakan gelas ukur/ember');
  y = infoRow('Hasil Tera Meter', hasilTera, mL, y);
  y += 4;

  // ── Measurement table ──────────────────────────────────
  // Column widths (total = CW)
  const tCols = [30, 95, 95, 75, 75, 65, 70];  // No | WM ml | GU ml | Dev ml | Dev % | Akurat
  // headers
  const tHdr  = ['No.', 'WATER METER', 'GELAS UKUR', 'DEVIASI', 'DEVIASI (%)', 'AKURAT'];
  const tHdrColspan = [1, 2, 2, 1, 1, 1];  // but we'll flatten
  const ROW_H = 14;
  const HDR_H = 16;

  // Draw outer border
  const tableW = tCols.reduce((s,v) => s+v, 0);
  const tableStartY = y;

  // Header row - single row with shortened labels
  const colLabels = ['No.', 'WATER\nMETER', 'VOL. WM\n(ml)', 'GELAS\nUKUR', 'VOL. GU\n(ml)', 'DEVIASI', 'AKURAT'];
  // Simplified 7-column table matching original
  const cols7 = [28, 45, 55, 45, 55, 60, 60]; // No | WM | Vol WM | GU | Vol GU | DEVIASI | AKURAT
  // Actually original has: No. | WATER METER (ml) | GELAS UKUR (ml) | DEVIASI | DEVIASI% | AKURAT
  // Let's use original columns: No | WM vol | GU vol | Dev (ml) | Dev (%) | Akurat
  const fCols  = [25, 80, 80, 70, 70, 60];   // 6 columns, total = 385
  const fLabels= ['No.', 'WATER METER (ml)', 'GELAS UKUR (ml)', 'DEVIASI (ml)', 'DEVIASI (%)', 'AKURAT'];
  const fW     = fCols.reduce((a,b) => a+b, 0);  // 385
  const tOffX  = mL + (CW - fW) / 2;  // center the table

  // Draw header
  doc.rect(tOffX, y, fW, HDR_H).fill(C_DARK);
  let cx = tOffX;
  fLabels.forEach((lbl, i) => {
    doc.fillColor('white').font('Helvetica-Bold').fontSize(7.5)
       .text(lbl, cx + 2, y + 4, { width: fCols[i] - 4, align: 'center' });
    cx += fCols[i];
  });
  y += HDR_H;

  // Data rows
  const rows = [
    { wm: record.t1_wm_vol, gu: record.t1_eq_vol, dev: record.t1_vol_deviation,
      pct: record.t1_persen_deviation, ok: record.t1_isaccurate },
    { wm: record.t2_wm_vol, gu: record.t2_eq_vol, dev: record.t2_vol_deviation,
      pct: record.t2_persen_deviation, ok: record.t2_isaccurate },
    { wm: record.t3_wm_vol, gu: record.t3_eq_vol, dev: record.t3_vol_deviation,
      pct: record.t3_persen_deviation, ok: record.t3_isaccurate },
  ];

  rows.forEach((r, i) => {
    const bg = i % 2 === 0 ? 'white' : C_GRAY;
    doc.rect(tOffX, y, fW, ROW_H).fill(bg).stroke(C_LINE);
    const isOk = parseInt(r.ok) === 1;
    const vals = [
      String(i + 1),
      String(r.wm ?? '-'),
      String(r.gu ?? '-'),
      String(r.dev ?? '-'),
      String(r.pct ?? '-'),
      isOk ? 'AKURAT' : 'TIDAK',
    ];
    cx = tOffX;
    vals.forEach((v, j) => {
      const color = j === 5 ? (isOk ? '#1b5e20' : '#b71c1c') : C_TEXT;
      const weight = j === 5 ? 'Helvetica-Bold' : 'Helvetica';
      doc.fillColor(color).font(weight).fontSize(8)
         .text(v, cx + 2, y + 3, { width: fCols[j] - 4, align: 'center' });
      cx += fCols[j];
    });
    y += ROW_H;
  });

  // Outer table border
  doc.rect(tOffX, tableStartY, fW, HDR_H + ROW_H * 3)
     .strokeColor(C_BORDER).lineWidth(0.8).stroke();
  y += 5;

  // Kesimpulan
  const kes = kesimpulan(record);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C_TEXT)
     .text(`Kesimpulan : ${kes}`, mL, y, { width: CW });
  y += ln(8.5) + 3;

  // Demikian
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Demikian Berita Acara ini dibuat dan disetujui oleh kedua belah pihak untuk dipergunakan sebagaimana mestinya.',
           mL, y, { width: CW });
  y += ln(8.5) * 2 + 2;

  // ── Signature area ──────────────────────────────────────
  const sigLX  = mL + 10;
  const sigRX  = mL + CW * 0.55;
  const sigW   = CW * 0.4;
  const sigTop = y;

  // Labels
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Pelanggan', sigLX, y, { width: sigW, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Dibuat Oleh :', sigRX, y, { width: sigW, align: 'center' });
  y += ln(8.5);
  doc.font('Helvetica').fontSize(8.5).fillColor(C_TEXT)
     .text('Petugas Tera Meter', sigRX, y, { width: sigW, align: 'center' });
  y += ln(8.5) + 2;

  // Signatures
  const sigImgTop = y;

  // Pelanggan auto-sig
  try {
    const buf = await autoSig(record.cust_name || 'Pelanggan');
    doc.image(buf, sigLX + (sigW - 110) / 2, sigImgTop, { width: 110, height: 44 });
  } catch(e) {}

  // Petugas photo-sig
  if (sigPetugasPath && fs.existsSync(sigPetugasPath)) {
    try {
      doc.image(sigPetugasPath, sigRX + (sigW - 110) / 2, sigImgTop, { width: 110, height: 44 });
    } catch(e) {}
  }
  y = sigImgTop + 50;

  // Name lines + names
  doc.moveTo(sigLX, y).lineTo(sigLX + sigW, y).strokeColor(C_TEXT).lineWidth(0.7).stroke();
  doc.moveTo(sigRX, y).lineTo(sigRX + sigW, y).strokeColor(C_TEXT).lineWidth(0.7).stroke();
  y += 3;

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C_TEXT)
     .text(record.cust_name || '-', sigLX, y, { width: sigW, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C_TEXT)
     .text(record.petugasnm || '-', sigRX, y, { width: sigW, align: 'center' });
  y += ln(8.5) + 8;

  // ── Footer ───────────────────────────────────────────────
  hLine(y);
  y += 3;
  const now = new Date();
  doc.font('Helvetica').fontSize(7).fillColor('#888')
     .text(`Dicetak: ${fmtShort(now)} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} | No. BA: ${record.ba_no || '-'} | No. SPK: ${record.spk_no || '-'}`,
           mL, y, { width: CW, align: 'center' });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generatePDF };

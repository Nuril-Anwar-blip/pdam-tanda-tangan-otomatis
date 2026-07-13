'use strict';
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const xlsx     = require('xlsx');
const { v4: uuid } = require('uuid');
const { generatePDF } = require('./pdfGenerator');

const app  = express();
const PORT = 3001;

// ── Directories ───────────────────────────────────────────────────────────────
const ROOT  = __dirname;
const DIRS  = {
  sig    : path.join(ROOT, 'signatures'),
  out    : path.join(ROOT, 'output'),
  up     : path.join(ROOT, 'uploads'),
  data   : path.join(ROOT, 'data'),
  pub    : path.join(ROOT, 'public'),
  custom : path.join(ROOT, 'custom-data'),
};
Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

const CUSTOM_FILE = path.join(DIRS.custom, 'records.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(DIRS.pub));
app.use('/signatures', express.static(DIRS.sig));
app.use('/output',     express.static(DIRS.out));

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, DIRS.up),
  filename:    (_, f, cb) => cb(null, uuid() + path.extname(f.originalname).toLowerCase()),
});
const upload  = multer({ storage, limits: { fileSize: 8e6 },
  fileFilter: (_, f, cb) => cb(null, /\.(jpe?g|png|gif|webp)$/i.test(f.originalname)) });

// ── Data loading ──────────────────────────────────────────────────────────────
let xlsRecords    = [];
let customRecords = [];
let petugasList   = [];

function loadXls() {
  try {
    const wb  = xlsx.readFile(path.join(DIRS.data, 'CabangSelatan.xls'), { cellDates: true });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    xlsRecords = xlsx.utils.sheet_to_json(ws, { defval: null });
    refreshPetugasList();
    console.log(`✅ XLS: ${xlsRecords.length} baris dimuat`);
  } catch(e) { console.error('XLS load error:', e.message); }
}

function loadCustom() {
  try {
    customRecords = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8'));
  } catch(_) { customRecords = []; }
  refreshPetugasList();
}

function saveCustom() {
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customRecords, null, 2));
  refreshPetugasList();
}

function refreshPetugasList() {
  const all = [...xlsRecords, ...customRecords];
  petugasList = [...new Set(
    all.map(r => String(r.petugasnm || '').trim()).filter(Boolean)
  )].sort();
}

function allRecords() {
  return [
    ...xlsRecords.map((r, i) => ({ ...r, _src: 'xls', _idx: i })),
    ...customRecords.map((r, i) => ({ ...r, _src: 'custom', _idx: i })),
  ];
}

loadXls();
loadCustom();

// ── Signature helpers ─────────────────────────────────────────────────────────
function sigPath(type, name) {
  return path.join(DIRS.sig, `${type}_${name.replace(/[^a-zA-Z0-9]/g,'_')}.png`);
}

function getSigStatus() {
  const petugas = {};
  petugasList.forEach(p => { petugas[p] = fs.existsSync(sigPath('petugas', p)); });
  return { ketua: fs.existsSync(sigPath('ketua', 'Harsono')), petugas };
}

async function resizeSig(src, dst) {
  const sharp = require('sharp');
  await sharp(src)
    .resize(220, 80, { fit: 'contain', background: { r:255,g:255,b:255,alpha:0 } })
    .png()
    .toFile(dst);
  fs.unlinkSync(src);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function getKesimpulan(r) {
  const c1 = parseInt(r.tera_conclution1)||0, c2 = parseInt(r.tera_conclution2)||0;
  if (c1===1&&c2===0) return 'Akurat';
  if (c1===0&&c2===0) return 'Ganti Meter';
  if (c1===1&&c2===2) return 'Ganti Kaca';
  return 'Perlu Cek';
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── Status ────────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const sig = getSigStatus();
  res.json({
    totalXls:         xlsRecords.length,
    totalCustom:      customRecords.length,
    totalRecords:     xlsRecords.length + customRecords.length,
    totalPetugas:     petugasList.length,
    uploadedPetugas:  Object.values(sig.petugas).filter(Boolean).length,
    ketuaUploaded:    sig.ketua,
    petugasList,
    sigStatus:        sig,
  });
});

// ── Records list ──────────────────────────────────────────────────────────────
app.get('/api/records', (req, res) => {
  const page    = Math.max(1, parseInt(req.query.page)  || 1);
  const limit   = Math.max(1, parseInt(req.query.limit) || 30);
  const search  = (req.query.search  || '').toLowerCase();
  const petugas = (req.query.petugas || '');
  const src     = (req.query.src     || '');  // 'xls' | 'custom' | ''

  let recs = allRecords();

  if (src)     recs = recs.filter(r => r._src === src);
  if (search)  recs = recs.filter(r =>
    String(r.cust_name    ||'').toLowerCase().includes(search) ||
    String(r.cust_code    ||'').toLowerCase().includes(search) ||
    String(r.cust_address ||'').toLowerCase().includes(search)
  );
  if (petugas) recs = recs.filter(r => String(r.petugasnm||'') === petugas);

  const total   = recs.length;
  const start   = (page-1)*limit;
  const pageData= recs.slice(start, start+limit).map(r => ({
    _id:        r._id || null,
    _src:       r._src,
    _idx:       r._idx,
    globalIdx:  allRecords().indexOf(r),
    nama:       r.cust_name,
    alamat:     r.cust_address,
    noSambungan:String(r.cust_code||'-'),
    petugas:    r.petugasnm,
    tanggal:    r.ba_date ? String(r.ba_date).substring(0,10) : (r.spk_date ? String(r.spk_date).substring(0,10) : '-'),
    kesimpulan: getKesimpulan(r),
    spkNo:      r.spk_no,
    baNo:       r.ba_no,
  }));

  res.json({ total, page, limit, data: pageData });
});

// ── Download single PDF (GET so browser can open directly) ────────────────────
app.get('/api/pdf/:src/:idx', async (req, res) => {
  const { src, idx } = req.params;
  let record;

  if (src === 'xls') {
    record = xlsRecords[parseInt(idx)];
  } else {
    record = customRecords[parseInt(idx)];
  }

  if (!record) return res.status(404).json({ error: 'Data tidak ditemukan' });

  const pName = String(record.petugasnm || '').trim();
  const sp    = sigPath('petugas', pName);
  const sk    = sigPath('ketua', 'Harsono');
  const tmp   = path.join(DIRS.out, `tmp_${uuid()}.pdf`);

  try {
    await generatePDF(
      record,
      fs.existsSync(sp) ? sp : null,
      fs.existsSync(sk) ? sk : null,
      tmp
    );

    const safeName = (record.cust_name||'dokumen').replace(/[^a-zA-Z0-9 ]/g,'_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="BA_${safeName}.pdf"`);
    const stream = fs.createReadStream(tmp);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(tmp); } catch(_){} });
    stream.on('error', () => res.end());
  } catch(e) {
    console.error('PDF error:', e);
    try { fs.unlinkSync(tmp); } catch(_){}
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Bulk generate (returns job id) ────────────────────────────────────────────
app.post('/api/generate-bulk', async (req, res) => {
  const { src, indices } = req.body;  // src: 'all'|'xls'|'custom'|'selected', indices: array
  let targets = [];

  if (src === 'all') {
    targets = allRecords();
  } else if (src === 'xls') {
    targets = xlsRecords.map((r,i) => ({...r,_src:'xls',_idx:i}));
  } else if (src === 'custom') {
    targets = customRecords.map((r,i) => ({...r,_src:'custom',_idx:i}));
  } else if (src === 'selected' && Array.isArray(indices)) {
    const all = allRecords();
    targets = indices.map(i => all[i]).filter(Boolean);
  }

  if (!targets.length) return res.status(400).json({ error: 'Tidak ada data' });

  const jobId  = uuid().substring(0,8);
  const jobDir = path.join(DIRS.out, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  res.json({ jobId, total: targets.length });

  // Background
  (async () => {
    let success = 0, failed = 0;
    const files = [];

    for (const rec of targets) {
      const pName = String(rec.petugasnm||'').trim();
      const sp    = sigPath('petugas', pName);
      const sk    = sigPath('ketua', 'Harsono');
      const safe  = String(rec.cust_code || rec.cc_id || uuid().substring(0,6)).replace(/[^a-zA-Z0-9]/g,'');
      const fname = `BA_${safe}.pdf`;
      const fout  = path.join(jobDir, fname);
      try {
        await generatePDF(
          rec,
          fs.existsSync(sp) ? sp : null,
          fs.existsSync(sk) ? sk : null,
          fout
        );
        success++;
        files.push({ name: fname, path: `/output/${jobId}/${fname}` });
      } catch(e) {
        failed++;
        console.error('Bulk PDF error:', e.message);
      }
    }

    fs.writeFileSync(path.join(jobDir, 'result.json'),
      JSON.stringify({ success, failed, files }));
    console.log(`Job ${jobId}: ${success} ok, ${failed} fail`);
  })();
});

// ── Job status ────────────────────────────────────────────────────────────────
app.get('/api/job/:id', (req, res) => {
  const dir = path.join(DIRS.out, req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Job tidak ada' });
  const rf  = path.join(dir, 'result.json');
  if (!fs.existsSync(rf)) {
    const done = fs.readdirSync(dir).filter(f=>f.endsWith('.pdf')).length;
    return res.json({ status: 'running', generated: done });
  }
  res.json({ status: 'done', ...JSON.parse(fs.readFileSync(rf, 'utf8')) });
});

// ── Signature upload ──────────────────────────────────────────────────────────
app.post('/api/sig/ketua', upload.single('sig'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File tidak ada' });
  try {
    await resizeSig(req.file.path, sigPath('ketua','Harsono'));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sig/petugas', upload.single('sig'), async (req, res) => {
  const name = req.body.name;
  if (!req.file || !name) return res.status(400).json({ error: 'File / nama tidak ada' });
  try {
    await resizeSig(req.file.path, sigPath('petugas', name));
    refreshPetugasList();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sig/:type/:name', (req, res) => {
  const sp = req.params.type === 'ketua'
    ? sigPath('ketua','Harsono')
    : sigPath('petugas', decodeURIComponent(req.params.name));
  try { if (fs.existsSync(sp)) fs.unlinkSync(sp); } catch(_){}
  res.json({ ok: true });
});

// ── Custom records CRUD ───────────────────────────────────────────────────────
app.get('/api/custom', (req, res) => {
  res.json(customRecords.map((r,i) => ({ ...r, _idx: i })));
});

app.post('/api/custom', (req, res) => {
  const r = { ...req.body, _id: uuid(), _src: 'custom' };
  customRecords.push(r);
  saveCustom();
  res.json({ ok: true, _id: r._id, _idx: customRecords.length-1 });
});

app.put('/api/custom/:idx', (req, res) => {
  const i = parseInt(req.params.idx);
  if (i < 0 || i >= customRecords.length) return res.status(404).json({ error: 'Not found' });
  customRecords[i] = { ...customRecords[i], ...req.body };
  saveCustom();
  res.json({ ok: true });
});

app.delete('/api/custom/:idx', (req, res) => {
  const i = parseInt(req.params.idx);
  if (i < 0 || i >= customRecords.length) return res.status(404).json({ error: 'Not found' });
  customRecords.splice(i, 1);
  saveCustom();
  res.json({ ok: true });
});

// ── Serve frontend ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(DIRS.pub, 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 Aplikasi berjalan → http://localhost:${PORT}`);
  console.log(`📊 ${xlsRecords.length} data dari Excel  |  ${customRecords.length} data kustom`);
  console.log(`👥 ${petugasList.length} petugas terdaftar\n`);
});

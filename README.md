# Sistem Tanda Tangan Tera Meter v2.0
## PERUMDA AIR MINUM TIRTA MAKMUR — SUKOHARJO SELATAN

### CARA INSTALL (lakukan sekali saja)

1. Install **Node.js** dari: https://nodejs.org  (pilih versi LTS)
2. Extract file ZIP ini ke folder mana saja
3. Buka folder `tera-app`, klik kanan di area kosong → **"Open in Terminal"**
   (Windows: klik kanan sambil tekan Shift → "Open PowerShell window here")
4. Ketik perintah berikut, tekan Enter, tunggu selesai:
   ```
   npm install
   ```

### CARA MENJALANKAN (setiap kali ingin pakai)

1. Buka Terminal di folder `tera-app`
2. Ketik:
   ```
   npm start
   ```
3. Buka **Google Chrome** atau **Microsoft Edge**
4. Ketik di address bar:
   ```
   http://localhost:3000
   ```

### CARA PAKAI

**Langkah 1 — Upload Tanda Tangan:**
- Buka menu "Tanda Tangan"
- Upload foto TTD Harsono, S.H. (Ketua)
- Upload foto TTD setiap petugas

**Langkah 2 — Buat PDF:**
- Buka menu "Buat PDF"
- Klik tombol 📄 Unduh di baris pelanggan, ATAU
- Klik tombol ⚡ Buat Semua PDF

**Langkah 3 — Tambah Data Baru:**
- Buka menu "Tambah Data"
- Isi formulir dan klik Simpan
- Data baru langsung muncul di daftar dan bisa dibuat PDF

### CATATAN PENTING
- Tanda tangan PELANGGAN dibuat OTOMATIS — tidak perlu upload
- Tanda tangan tersimpan permanen, tidak perlu upload ulang
- Data Excel asli (3.494 baris) sudah tersimpan di folder data/
- Data baru tersimpan di folder custom-data/records.json
- PDF tersimpan di folder output/

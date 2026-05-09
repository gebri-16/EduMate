const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');

// FIX: Parse tanggal manual dari string YYYY-MM-DD agar tidak kena offset timezone
function formatTanggal(tglStr) {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const parts = (tglStr instanceof Date)
    ? [tglStr.getFullYear(), tglStr.getMonth() + 1, tglStr.getDate()]
    : tglStr.toString().split('T')[0].split('-').map(Number);
  return `${parts[2]} ${bulan[parts[1] - 1]} ${parts[0]}`;
}

// POST /api/sesi — buat ajakan sesi belajar baru
router.post('/', verifyToken, async (req, res) => {
  console.log('POST /api/sesi dipanggil, pengirim_id:', req.user.id);
  const pengirim_id = req.user.id;
  const { penerima_id, mata_kuliah, tanggal, jam_mulai, jam_selesai, lokasi, link_meeting } = req.body;

  if (!penerima_id || !mata_kuliah || !tanggal || !jam_mulai || !jam_selesai)
    return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });

  const query = `
    INSERT INTO _sesi_belajar (pengirim_id, penerima_id, mata_kuliah, tanggal, jam_mulai, jam_selesai, lokasi, link_meeting, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    RETURNING id
  `;

  try {
    const result = await db.query(query, [pengirim_id, penerima_id, mata_kuliah, tanggal, jam_mulai, jam_selesai, lokasi, link_meeting || null]);
    const sesi_id = result.rows[0].id;
    await kirimNotifAjakan(pengirim_id, penerima_id, mata_kuliah, tanggal, sesi_id);
    res.json({ success: true, message: 'Ajakan berhasil dikirim!', sesi_id });
  } catch (err) {
  console.error('[SESI POST ERROR]', err.stack);
  res.status(500).json({ success: false, message: 'Gagal buat sesi', error: err.message });
}
});

async function kirimNotifAjakan(pengirim_id, penerima_id, mata_kuliah, tanggal, sesi_id) {
  try {
    const userResult = await db.query('SELECT nama FROM _users WHERE id = $1', [pengirim_id]);
    if (userResult.rows.length > 0) {
      const namaPengirim = userResult.rows[0].nama;
      const tglFormatted = formatTanggal(tanggal);
      const pesan = `${namaPengirim} mengajakmu belajar ${mata_kuliah} pada ${tglFormatted}`;
      await db.query(
        `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Ajakan Belajar Baru', $2, 'ajakan')`,
        [penerima_id, pesan]
      );
    }
  } catch (err) {
    console.error('Gagal insert notif:', err.message);
  }
}

// GET /api/sesi — ambil semua sesi user
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT s.*,
      u1.nama as pengirim_nama, u1.foto as pengirim_foto,
      u2.nama as penerima_nama, u2.foto as penerima_foto
    FROM _sesi_belajar s
    JOIN _users u1 ON s.pengirim_id = u1.id
    JOIN _users u2 ON s.penerima_id = u2.id
    WHERE s.pengirim_id = $1 OR s.penerima_id = $1
    ORDER BY s.created_at DESC
  `;
  try {
    const results = await db.query(query, [userId]);
    res.json({ success: true, sesi: results.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil sesi' });
  }
});

// PUT /api/sesi/:id — update status sesi
router.put('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;

  try {
    const sesiResult = await db.query('SELECT * FROM _sesi_belajar WHERE id = $1', [id]);
    if (sesiResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });

    const sesi = sesiResult.rows[0];
    const isPengirim = sesi.pengirim_id === userId;
    const isPenerima = sesi.penerima_id === userId;

    if (status === 'diterima') {
      if (!isPenerima)
        return res.status(403).json({ success: false, message: 'Hanya penerima yang bisa mengkonfirmasi sesi' });
    } else if (status === 'ditolak') {
      if (!isPengirim && !isPenerima)
        return res.status(403).json({ success: false, message: 'Kamu tidak memiliki akses ke sesi ini' });
    } else {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    const result = await db.query(
      'UPDATE _sesi_belajar SET status = $1 WHERE id = $2',
      [status, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });

    // Kirim notifikasi
    try {
      const userResult = await db.query('SELECT nama FROM _users WHERE id = $1', [userId]);
      if (userResult.rows.length > 0) {
        const namaUser = userResult.rows[0].nama;
        const targetId = isPengirim ? sesi.penerima_id : sesi.pengirim_id;
        let judul = '', pesan = '';

        if (status === 'diterima') {
          judul = 'Ajakan Belajar Diterima';
          pesan = `${namaUser} menerima ajakanmu belajar ${sesi.mata_kuliah}`;
        } else if (status === 'ditolak') {
          if (isPengirim) {
            judul = 'Sesi Belajar Dibatalkan';
            pesan = `${namaUser} membatalkan ajakan belajar ${sesi.mata_kuliah}`;
          } else {
            judul = 'Ajakan Belajar Ditolak';
            pesan = `${namaUser} tidak dapat menghadiri sesi ${sesi.mata_kuliah} yang kamu ajukan`;
          }
        }

        if (pesan) {
          await db.query(
            `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, $2, $3, 'ajakan')`,
            [targetId, judul, pesan]
          );
        }
      }
    } catch (notifErr) {
      console.error('Gagal insert notif:', notifErr.message);
    }

    res.json({ success: true, message: `Sesi berhasil ${status}` });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update status', error: err.message });
  }
});

// DELETE /api/sesi/:id — hapus sesi
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const sesiResult = await db.query('SELECT * FROM _sesi_belajar WHERE id = $1', [id]);
    if (sesiResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });

    const sesi = sesiResult.rows[0];

    if (sesi.pengirim_id !== userId && sesi.penerima_id !== userId)
      return res.status(403).json({ success: false, message: 'Tidak punya akses ke sesi ini' });

    if (sesi.status !== 'ditolak' && sesi.status !== 'selesai')
      return res.status(400).json({ success: false, message: 'Hanya sesi selesai atau dibatalkan yang bisa dihapus' });

    await db.query('DELETE FROM _sesi_belajar WHERE id = $1', [id]);
    res.json({ success: true, message: 'Sesi berhasil dihapus' });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal hapus sesi' });
  }
});

// ===== AUTO-COMPLETE SESI =====
async function autoCompleteSesi() {
  const query = `
    UPDATE _sesi_belajar
    SET status = 'selesai'
    WHERE status = 'diterima'
      AND (tanggal || ' ' || jam_selesai)::timestamp <= NOW()
  `;
  try {
    const result = await db.query(query);
    if (result.rowCount > 0)
      console.log(`[AutoComplete] ${result.rowCount} sesi ditandai selesai.`);
  } catch (err) {
    console.error('[AutoComplete] Gagal update sesi:', err.message);
  }
}

setInterval(autoCompleteSesi, 60_000);
autoCompleteSesi();

module.exports = router;
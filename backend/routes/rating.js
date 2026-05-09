const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');

// POST /api/rating — beri rating setelah sesi selesai
router.post('/', verifyToken, async (req, res) => {
  const pemberi_id = req.user.id;
  const { sesi_id, penerima_id, nilai, review } = req.body;

  if (!sesi_id || !penerima_id || !nilai)
    return res.status(400).json({ success: false, message: 'sesi_id, penerima_id, dan nilai wajib diisi' });

  if (nilai < 1 || nilai > 5)
    return res.status(400).json({ success: false, message: 'Nilai rating harus antara 1–5' });

  try {
    // Cek apakah sudah pernah beri rating untuk sesi ini
    const existing = await db.query(
      'SELECT id FROM _rating WHERE sesi_id = $1 AND pemberi_id = $2',
      [sesi_id, pemberi_id]
    );
    if (existing.rows.length > 0)
      return res.status(400).json({ success: false, message: 'Kamu sudah memberi rating untuk sesi ini' });

    // Simpan rating
    const result = await db.query(
      'INSERT INTO _rating (sesi_id, pemberi_id, penerima_id, nilai, review) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [sesi_id, pemberi_id, penerima_id, nilai, review || null]
    );

    // Kirim notifikasi ke penerima rating
    try {
      const userResult = await db.query('SELECT nama FROM _users WHERE id = $1', [pemberi_id]);
      if (userResult.rows.length > 0) {
        const namaPemberi = userResult.rows[0].nama;
        const bintang = '★'.repeat(nilai) + '☆'.repeat(5 - nilai);
        const pesan = `${namaPemberi} memberimu rating ${bintang} (${nilai}/5)${review ? ` — "${review}"` : ''}`;
        await db.query(
          `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Kamu Mendapat Rating Baru!', $2, 'rating')`,
          [penerima_id, pesan]
        );
      }
    } catch (notifErr) {
      console.error('Gagal kirim notifikasi rating:', notifErr.message);
    }

    res.json({ success: true, message: 'Rating berhasil dikirim!', rating_id: result.rows[0].id });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal simpan rating', error: err.message });
  }
});

// GET /api/rating/diberikan — ambil semua rating yang diberikan user
router.get('/diberikan', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT r.*, u.nama as penerima_nama, u.foto as penerima_foto
    FROM _rating r
    JOIN _users u ON r.penerima_id = u.id
    WHERE r.pemberi_id = $1
    ORDER BY r.created_at DESC
  `;
  try {
    const results = await db.query(query, [userId]);
    res.json({ success: true, rating: results.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil rating' });
  }
});

// GET /api/rating/sesi/:sesiId — cek apakah sudah beri rating untuk sesi ini
// PENTING: route ini harus di atas /:userId agar tidak bentrok
router.get('/sesi/:sesiId', verifyToken, async (req, res) => {
  const { sesiId } = req.params;
  const userId = req.user.id;
  try {
    const results = await db.query(
      'SELECT id FROM _rating WHERE sesi_id = $1 AND pemberi_id = $2',
      [sesiId, userId]
    );
    res.json({ success: true, sudahRating: results.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/rating/:userId — ambil semua rating untuk user tertentu
router.get('/:userId', verifyToken, async (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT r.*, u.nama as pemberi_nama, u.foto as pemberi_foto
    FROM _rating r
    JOIN _users u ON r.pemberi_id = u.id
    WHERE r.penerima_id = $1
    ORDER BY r.created_at DESC
  `;
  try {
    const results = await db.query(query, [userId]);
    const rataRata = results.rows.length > 0
      ? (results.rows.reduce((sum, r) => sum + r.nilai, 0) / results.rows.length).toFixed(1)
      : null;
    res.json({ success: true, rating: results.rows, rata_rata: rataRata, total: results.rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil rating' });
  }
});

module.exports = router;
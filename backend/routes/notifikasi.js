const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');

// GET /api/notifikasi — ambil semua notifikasi user
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const results = await db.query(
      'SELECT * FROM _notifikasi WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json({ success: true, notifikasi: results.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil notifikasi' });
  }
});

// PUT /api/notifikasi/baca-semua — tandai semua notifikasi sudah dibaca
router.put('/baca-semua', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    await db.query(
      'UPDATE _notifikasi SET is_read = 1 WHERE user_id = $1',
      [userId]
    );
    res.json({ success: true, message: 'Semua notifikasi ditandai dibaca' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update notifikasi' });
  }
});

// GET /api/notifikasi/unread-count — jumlah notifikasi belum dibaca
router.get('/unread-count', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const results = await db.query(
      'SELECT COUNT(*) as count FROM _notifikasi WHERE user_id = $1 AND is_read = 0',
      [userId]
    );
    res.json({ success: true, count: parseInt(results.rows[0].count) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil count' });
  }
});

// PUT /api/notifikasi/:id/baca — tandai satu notifikasi sudah dibaca
router.put('/:id/baca', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await db.query(
      'UPDATE _notifikasi SET is_read = 1 WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    res.json({ success: true, message: 'Notifikasi ditandai dibaca' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update notifikasi' });
  }
});

// DELETE /api/notifikasi/hapus-semua — hapus semua notifikasi yang sudah dibaca
router.delete('/hapus-semua', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(
      'DELETE FROM _notifikasi WHERE user_id = $1 AND is_read = 1',
      [userId]
    );
    res.json({ success: true, message: `${result.rowCount} notifikasi berhasil dihapus` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal hapus notifikasi' });
  }
});

// DELETE /api/notifikasi/:id — hapus satu notifikasi
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const result = await db.query(
      'DELETE FROM _notifikasi WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'Notifikasi tidak ditemukan' });
    res.json({ success: true, message: 'Notifikasi berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal hapus notifikasi' });
  }
});

module.exports = router;
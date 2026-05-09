const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');

const jadwalMap = {
  'Senin Pagi':     { hari: 'Senin',   jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Senin Siang':    { hari: 'Senin',   jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Senin Sore':     { hari: 'Senin',   jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Senin Malam':    { hari: 'Senin',   jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
  'Selasa Pagi':    { hari: 'Selasa',  jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Selasa Siang':   { hari: 'Selasa',  jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Selasa Sore':    { hari: 'Selasa',  jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Selasa Malam':   { hari: 'Selasa',  jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
  'Rabu Pagi':      { hari: 'Rabu',    jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Rabu Siang':     { hari: 'Rabu',    jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Rabu Sore':      { hari: 'Rabu',    jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Rabu Malam':     { hari: 'Rabu',    jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
  'Kamis Pagi':     { hari: 'Kamis',   jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Kamis Siang':    { hari: 'Kamis',   jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Kamis Sore':     { hari: 'Kamis',   jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Kamis Malam':    { hari: 'Kamis',   jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
  'Jumat Pagi':     { hari: 'Jumat',   jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Jumat Siang':    { hari: 'Jumat',   jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Jumat Sore':     { hari: 'Jumat',   jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Jumat Malam':    { hari: 'Jumat',   jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
  'Sabtu Pagi':     { hari: 'Sabtu',   jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Sabtu Siang':    { hari: 'Sabtu',   jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Sabtu Sore':     { hari: 'Sabtu',   jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Sabtu Malam':    { hari: 'Sabtu',   jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
  'Minggu Pagi':    { hari: 'Minggu',  jam_mulai: '06:00:00', jam_selesai: '11:00:00' },
  'Minggu Siang':   { hari: 'Minggu',  jam_mulai: '11:00:00', jam_selesai: '14:00:00' },
  'Minggu Sore':    { hari: 'Minggu',  jam_mulai: '14:00:00', jam_selesai: '18:00:00' },
  'Minggu Malam':   { hari: 'Minggu',  jam_mulai: '18:00:00', jam_selesai: '22:00:00' },
};

// Urutan hari untuk sorting manual (pengganti FIELD() MySQL)
const hariOrder = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];

// ==================== GET /api/jadwal ====================
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const results = await db.query(
      'SELECT * FROM _jadwal_kosong WHERE user_id = $1 ORDER BY jam_mulai',
      [userId]
    );
    // Sort by hari order
    const sorted = results.rows.sort((a, b) =>
      hariOrder.indexOf(a.hari) - hariOrder.indexOf(b.hari) ||
      a.jam_mulai.localeCompare(b.jam_mulai)
    );
    res.json({ success: true, jadwal: sorted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil jadwal' });
  }
});

// ==================== GET /api/jadwal/user/:id ====================
router.get('/user/:id', verifyToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!targetId || isNaN(targetId))
    return res.status(400).json({ success: false, message: 'ID tidak valid' });

  try {
    const results = await db.query(
      'SELECT hari, jam_mulai, jam_selesai FROM _jadwal_kosong WHERE user_id = $1 ORDER BY jam_mulai',
      [targetId]
    );
    const sorted = results.rows.sort((a, b) =>
      hariOrder.indexOf(a.hari) - hariOrder.indexOf(b.hari) ||
      a.jam_mulai.localeCompare(b.jam_mulai)
    );
    res.json({ success: true, jadwal: sorted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal ambil jadwal' });
  }
});

// ==================== POST /api/jadwal ====================
router.post('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { hari, jam_mulai, jam_selesai, jadwal, replace } = req.body;

  // ── Format BARU: { hari, jam_mulai, jam_selesai } dari jadwal.html ──
  if (hari && jam_mulai && jam_selesai) {
    const hariValid = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
    if (!hariValid.includes(hari))
      return res.status(400).json({ success: false, message: 'Hari tidak valid' });

    const mulai   = jam_mulai.length === 5 ? jam_mulai + ':00' : jam_mulai;
    const selesai = jam_selesai.length === 5 ? jam_selesai + ':00' : jam_selesai;
    const values  = [[userId, hari, mulai, selesai]];

    try {
      if (replace === true) {
        await db.query('DELETE FROM _jadwal_kosong WHERE user_id = $1', [userId]);
        await insertJadwal(values);
      } else {
        const existing = await db.query(
          'SELECT id FROM _jadwal_kosong WHERE user_id = $1 AND hari = $2 AND jam_mulai = $3',
          [userId, hari, mulai]
        );
        if (existing.rows.length > 0)
          return res.json({ success: true, message: 'Jadwal sudah ada' });
        await insertJadwal(values);
      }
      res.json({ success: true, message: 'Jadwal berhasil disimpan' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Gagal simpan jadwal', error: err.message });
    }
    return;
  }

  // ── Format LAMA: { jadwal: ["Senin Pagi", ...] } dari onboarding & profil ──
  if (!jadwal || jadwal.length === 0)
    return res.status(400).json({ success: false, message: 'Jadwal tidak boleh kosong' });

  const values2 = jadwal
    .filter(j => jadwalMap[j])
    .map(j => [userId, jadwalMap[j].hari, jadwalMap[j].jam_mulai, jadwalMap[j].jam_selesai]);

  if (values2.length === 0)
    return res.status(400).json({ success: false, message: 'Jadwal tidak valid' });

  try {
    if (replace === true) {
      await db.query('DELETE FROM _jadwal_kosong WHERE user_id = $1', [userId]);
      await insertJadwal(values2);
    } else {
      const existing = await db.query(
        'SELECT hari, jam_mulai FROM _jadwal_kosong WHERE user_id = $1',
        [userId]
      );
      const existingSet = new Set(existing.rows.map(e => `${e.hari}_${e.jam_mulai}`));
      const newValues   = values2.filter(v => !existingSet.has(`${v[1]}_${v[2]}`));
      if (newValues.length === 0)
        return res.json({ success: true, message: 'Jadwal sudah ada' });
      await insertJadwal(newValues);
    }
    res.json({ success: true, message: 'Jadwal berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal simpan jadwal', error: err.message });
  }
});

// ==================== DELETE /api/jadwal/:id ====================
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await db.query(
      'DELETE FROM _jadwal_kosong WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan' });
    res.json({ success: true, message: 'Jadwal berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal hapus jadwal' });
  }
});

// ==================== HELPER ====================
async function insertJadwal(values) {
  for (const v of values) {
    await db.query(
      'INSERT INTO _jadwal_kosong (user_id, hari, jam_mulai, jam_selesai) VALUES ($1, $2, $3, $4)',
      v
    );
  }
}

module.exports = router;
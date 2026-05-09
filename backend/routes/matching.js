const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const db = require('../config/database');

// ==================== ALGORITMA SCORING MATCHING ====================
function hitungSkor(userA, userB, jadwalA, jadwalB) {
  let skor = 0;

  // 1. Skill/Mata Kuliah sama (30 poin)
  if (userA.skill && userB.skill) {
    const skillA = userA.skill.toLowerCase().split(',').map(s => s.trim());
    const skillB = userB.skill.toLowerCase().split(',').map(s => s.trim());
    const skillSama = skillA.some(s => skillB.includes(s));
    if (skillSama) skor += 30;
  }

  // 2. Topik belajar sama (25 poin)
  if (userA.topik_belajar && userB.topik_belajar) {
    const topikA = userA.topik_belajar.toLowerCase().split(',').map(s => s.trim());
    const topikB = userB.topik_belajar.toLowerCase().split(',').map(s => s.trim());
    const topikSama = topikA.some(t => topikB.includes(t));
    if (topikSama) skor += 25;
  }

  // 3. Jadwal nyambung (20 poin)
  if (jadwalA.length > 0 && jadwalB.length > 0) {
    const jadwalASet = jadwalA.map(j => j.hari);
    const jadwalBSet = jadwalB.map(j => j.hari);
    const jadwalSama = jadwalASet.some(h => jadwalBSet.includes(h));
    if (jadwalSama) skor += 20;
  }

  // 4. Lokasi cocok (15 poin)
  if (userA.lokasi_belajar && userB.lokasi_belajar) {
    if (
      userA.lokasi_belajar.toLowerCase() === userB.lokasi_belajar.toLowerCase() ||
      userA.lokasi_belajar.toLowerCase() === 'online' ||
      userB.lokasi_belajar.toLowerCase() === 'online'
    ) {
      skor += 15;
    }
  }

  // 5. Gaya belajar sama (10 poin)
  if (userA.gaya_belajar && userB.gaya_belajar) {
    if (userA.gaya_belajar.toLowerCase() === userB.gaya_belajar.toLowerCase()) {
      skor += 10;
    }
  }

  return skor;
}

// helper
function getOnlineStatus(lastActive) {
  if (!lastActive) return { online: false, label: 'Offline' };
  const diff  = Date.now() - new Date(lastActive).getTime();
  const menit = Math.floor(diff / 60000);
  if (menit < 5)  return { online: true,  label: 'Online' };
  if (menit < 60) return { online: false, label: `${menit} mnt lalu` };
  const jam = Math.floor(menit / 60);
  if (jam < 24)   return { online: false, label: `${jam} jam lalu` };
  const hari = Math.floor(jam / 24);
  if (hari === 1) return { online: false, label: 'Kemarin' };
  return { online: false, label: `${hari} hari lalu` };
}

// GET /api/matching
router.get('/', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Ambil profil user yang sedang login
    const queryUserSaya = `
      SELECT u.id, u.nama, u.email, u.foto, u.jurusan, u.universitas,
             u.last_active,
             pb.skill, pb.topik_belajar, pb.tingkat_kemampuan, pb.gaya_belajar, pb.lokasi_belajar
      FROM _users u
      LEFT JOIN _profil_belajar pb ON u.id = pb.user_id
      WHERE u.id = $1
    `;
    const userSayaResult = await db.query(queryUserSaya, [userId]);
    if (userSayaResult.rows.length === 0)
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    const userSaya = userSayaResult.rows[0];

    // 2. Ambil jadwal user yang sedang login
    const jadwalSayaResult = await db.query(
      'SELECT * FROM _jadwal_kosong WHERE user_id = $1',
      [userId]
    );
    const jadwalSaya = jadwalSayaResult.rows;

    // 3. Ambil semua user lain beserta profil belajar
    const querySemuaUser = `
      SELECT u.id, u.nama, u.email, u.foto, u.jurusan, u.universitas,
             u.last_active,
             pb.skill, pb.topik_belajar, pb.tingkat_kemampuan, pb.gaya_belajar, pb.lokasi_belajar
      FROM _users u
      LEFT JOIN _profil_belajar pb ON u.id = pb.user_id
      WHERE u.id != $1
    `;
    const semuaUserResult = await db.query(querySemuaUser, [userId]);
    const semuaUser = semuaUserResult.rows;

    if (semuaUser.length === 0)
      return res.json({ success: true, matches: [] });

    // 4. Ambil jadwal semua user lain
    const userIds = semuaUser.map(u => u.id);
    const semuaJadwalResult = await db.query(
      `SELECT * FROM _jadwal_kosong WHERE user_id = ANY($1)`,
      [userIds]
    );
    const semuaJadwal = semuaJadwalResult.rows;

    // 5. Hitung skor matching untuk setiap user
    const matches = semuaUser.map(userLain => {
      const jadwalLain = semuaJadwal.filter(j => j.user_id === userLain.id);
      const skor = hitungSkor(userSaya, userLain, jadwalSaya, jadwalLain);
      const status = getOnlineStatus(userLain.last_active);
      return {
        ...userLain,
        skor,
        persentase: skor,
        online: status.online,
        label:  status.label,
      };
    });

    // 6. Urutkan dari skor tertinggi
    const hasil = matches.sort((a, b) => b.skor - a.skor);

    res.json({ success: true, matches: hasil });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error', error: err.message });
  }
});

module.exports = router;
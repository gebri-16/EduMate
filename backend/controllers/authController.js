const db = require('../config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ==================== HELPER: cek status online ====================
function getOnlineStatus(lastActive) {
  if (!lastActive) return { online: false, label: 'Tidak diketahui' };
  const diff  = Date.now() - new Date(lastActive).getTime();
  const menit = Math.floor(diff / 60000);
  if (menit < 5)  return { online: true,  label: 'Online' };
  if (menit < 60) return { online: false, label: `${menit} menit lalu` };
  const jam = Math.floor(menit / 60);
  if (jam < 24)   return { online: false, label: `${jam} jam lalu` };
  const hari = Math.floor(jam / 24);
  if (hari === 1) return { online: false, label: 'Kemarin' };
  return { online: false, label: `${hari} hari lalu` };
}

// ==================== GOOGLE CALLBACK ====================
exports.googleCallback = (req, res) => {
  req.session.regenerate((err) => {
    if (err) {
      console.error('Session regenerate error:', err);
      return res.redirect('/pages/login.html?error=session');
    }
    const user = req.user;
    if (!user) return res.redirect('/pages/login.html?error=no_user');

    const token = jwt.sign(
      { id: user.id, nama: user.nama, email: user.email, foto: user.foto },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const sudahIsiProfil = user.jurusan !== null && user.jurusan !== undefined && user.jurusan !== '';

    req.session.pendingToken   = token;
    req.session.redirectTarget = sudahIsiProfil ? 'dashboard' : 'onboarding';

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.redirect('/pages/login.html?error=session');
      }
      res.redirect('/api/auth/token-exchange');
    });
  });
};

// ==================== TOKEN EXCHANGE ====================
exports.tokenExchange = (req, res) => {
  const token          = req.session.pendingToken;
  const redirectTarget = req.session.redirectTarget;
  if (!token) return res.redirect('/pages/login.html?error=no_token');

  delete req.session.pendingToken;
  delete req.session.redirectTarget;

  const page = redirectTarget === 'dashboard' ? 'dashboard' : 'onboarding';
  res.send(`
    <!DOCTYPE html>
    <html>
      <body>
        <script>
          localStorage.removeItem('sb_token');
          localStorage.setItem('sb_token', ${JSON.stringify(token)});
          window.location.replace('/pages/${page}.html');
        </script>
      </body>
    </html>
  `);
};

// ==================== GET CURRENT USER ====================
exports.getMe = async (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT
      u.id, u.nama, u.email, u.foto, u.jurusan, u.universitas,
      u.bio, u.no_hp, u.last_active, u.created_at,
      pb.skill, pb.topik_belajar, pb.tingkat_kemampuan,
      pb.gaya_belajar, pb.lokasi_belajar
    FROM _users u
    LEFT JOIN _profil_belajar pb ON u.id = pb.user_id
    WHERE u.id = $1
  `;
  try {
    const results = await db.query(query, [userId]);
    if (results.rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    const user   = results.rows[0];
    const status = getOnlineStatus(user.last_active);
    res.json({ success: true, user: { ...user, ...status } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error', error: err.message });
  }
};

// ==================== GET USER BY ID (PROFIL PUBLIK) ====================
exports.getUserById = async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (!targetId || isNaN(targetId)) {
    return res.status(400).json({ success: false, message: 'ID tidak valid' });
  }
  const query = `
    SELECT
      u.id, u.nama, u.foto, u.jurusan, u.universitas,
      u.bio, u.no_hp, u.last_active, u.created_at,
      pb.skill, pb.topik_belajar, pb.tingkat_kemampuan,
      pb.gaya_belajar, pb.lokasi_belajar
    FROM _users u
    LEFT JOIN _profil_belajar pb ON u.id = pb.user_id
    WHERE u.id = $1
  `;
  try {
    const results = await db.query(query, [targetId]);
    if (results.rows.length === 0) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    const user   = results.rows[0];
    const status = getOnlineStatus(user.last_active);
    res.json({ success: true, user: { ...user, ...status } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error', error: err.message });
  }
};

// ==================== PING (update last_active) ====================
exports.ping = async (req, res) => {
  const userId = req.user.id;
  try {
    await db.query('UPDATE _users SET last_active = NOW() WHERE id = $1', [userId]);
    res.json({ success: true });
 } catch (err) {
  console.error('[PING ERROR]', err.stack);
  res.status(500).json({ success: false });
}
};

// ==================== UPDATE PROFIL ====================
exports.updateProfil = async (req, res) => {
  const userId = req.user.id;
  const { nama, jurusan, universitas, bio, no_hp } = req.body;
  const sanitizedHp = no_hp ? no_hp.replace(/[^\d\s\+\-]/g, '').trim() : null;
  try {
    await db.query(
      `UPDATE _users SET nama=$1, jurusan=$2, universitas=$3, bio=$4, no_hp=$5 WHERE id=$6`,
      [nama, jurusan, universitas, bio, sanitizedHp, userId]
    );
    res.json({ success: true, message: 'Profil berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update profil' });
  }
};

// ==================== UPDATE PROFIL BELAJAR ====================
exports.updateProfilBelajar = async (req, res) => {
  const userId = req.user.id;
  const { skill, topik_belajar, tingkat_kemampuan, gaya_belajar, lokasi_belajar } = req.body;
  const query = `
    INSERT INTO _profil_belajar (user_id, skill, topik_belajar, tingkat_kemampuan, gaya_belajar, lokasi_belajar)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id) DO UPDATE SET
      skill = EXCLUDED.skill,
      topik_belajar = EXCLUDED.topik_belajar,
      tingkat_kemampuan = EXCLUDED.tingkat_kemampuan,
      gaya_belajar = EXCLUDED.gaya_belajar,
      lokasi_belajar = EXCLUDED.lokasi_belajar
  `;
  try {
    await db.query(query, [userId, skill, topik_belajar, tingkat_kemampuan, gaya_belajar, lokasi_belajar]);
    res.json({ success: true, message: 'Profil belajar berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal update profil belajar' });
  }
};

// ==================== PUBLIC STATS (tanpa login) ====================
exports.getPublicStats = async (req, res) => {
  try {
    const [r1, r2, r3] = await Promise.all([
  db.query('SELECT COUNT(*) as total FROM _users'),
  db.query("SELECT COUNT(*) as online FROM _users WHERE last_active::timestamp >= NOW() - INTERVAL '5 minutes'"),
  db.query("SELECT COUNT(*) as sesi FROM _sesi_belajar WHERE status = 'selesai'"),
]);
res.json({
  success: true,
  total_users:  parseInt(r1.rows[0].total)  || 0,
  online_users: parseInt(r2.rows[0].online) || 0,
  total_sesi:   parseInt(r3.rows[0].sesi)   || 0,
});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error', error: err.message });
  }
};

// ==================== LOGOUT ====================
exports.logout = async (req, res) => {
  const userId = req.user ? req.user.id : null;

  if (userId) {
    try {
      await db.query('UPDATE _users SET last_active = NULL WHERE id = $1', [userId]);
    } catch (err) {
      console.error('Error reset last_active:', err);
    }
  }

  req.logout((logoutErr) => {
    if (logoutErr) console.error('Logout error:', logoutErr);
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('Session destroy error:', destroyErr);
        return res.status(500).json({ success: false, message: 'Gagal logout' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Logout berhasil' });
    });
  });
};
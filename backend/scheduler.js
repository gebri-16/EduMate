const cron = require('node-cron');
const db = require('./config/database');

// ==================== AUTO SELESAI ====================
cron.schedule('*/5 * * * *', async () => {
  const query = `
    UPDATE _sesi_belajar
    SET status = 'selesai'
    WHERE status = 'diterima'
    AND (tanggal || ' ' || jam_selesai)::timestamp < NOW()
  `;

  try {
    const result = await db.query(query);
    if (result.rowCount > 0) {
      console.log(`[Scheduler] ${result.rowCount} sesi otomatis ditandai selesai`);

      // Kirim notifikasi ke pengirim & penerima sesi yang baru selesai
      const notifQuery = `
        SELECT s.id, s.pengirim_id, s.penerima_id, s.mata_kuliah,
               u1.nama as pengirim_nama, u2.nama as penerima_nama
        FROM _sesi_belajar s
        JOIN _users u1 ON s.pengirim_id = u1.id
        JOIN _users u2 ON s.penerima_id = u2.id
        WHERE s.status = 'selesai'
        AND (s.tanggal || ' ' || s.jam_selesai)::timestamp >= NOW() - INTERVAL '5 minutes'
        AND (s.tanggal || ' ' || s.jam_selesai)::timestamp < NOW()
      `;

      const sesiList = await db.query(notifQuery);
      for (const s of sesiList.rows) {
        const pesan = `Sesimu bersama ${s.penerima_nama} — ${s.mata_kuliah} — telah selesai. Jangan lupa beri rating!`;
        const pesanPenerima = `Sesimu bersama ${s.pengirim_nama} — ${s.mata_kuliah} — telah selesai. Jangan lupa beri rating!`;
        await db.query(
          `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Sesi Belajar Selesai', $2, 'sesi')`,
          [s.pengirim_id, pesan]
        ).catch(err => console.error('Gagal notif pengirim:', err.message));
        await db.query(
          `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Sesi Belajar Selesai', $2, 'sesi')`,
          [s.penerima_id, pesanPenerima]
        ).catch(err => console.error('Gagal notif penerima:', err.message));
      }
    }
  } catch (err) {
    console.error('[Scheduler] Gagal auto-selesai sesi:', err.message);
  }
});

// ==================== REMINDER H-1 ====================
cron.schedule('0 8 * * *', async () => {
  const query = `
    SELECT s.*,
      u1.nama as pengirim_nama, u2.nama as penerima_nama
    FROM _sesi_belajar s
    JOIN _users u1 ON s.pengirim_id = u1.id
    JOIN _users u2 ON s.penerima_id = u2.id
    WHERE s.status = 'diterima'
    AND s.tanggal::date = (NOW() + INTERVAL '1 day')::date
  `;

  try {
    const sesiList = await db.query(query);
    for (const s of sesiList.rows) {
      const jam = s.jam_mulai ? s.jam_mulai.substring(0, 5) : '';
      const pesan = `Besok kamu ada sesi belajar ${s.mata_kuliah} bersama ${s.penerima_nama} pukul ${jam}. Jangan lupa!`;
      const pesanPenerima = `Besok kamu ada sesi belajar ${s.mata_kuliah} bersama ${s.pengirim_nama} pukul ${jam}. Jangan lupa!`;
      await db.query(
        `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Pengingat Sesi Besok', $2, 'sesi')`,
        [s.pengirim_id, pesan]
      ).catch(err => console.error('Gagal notif H-1 pengirim:', err.message));
      await db.query(
        `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Pengingat Sesi Besok', $2, 'sesi')`,
        [s.penerima_id, pesanPenerima]
      ).catch(err => console.error('Gagal notif H-1 penerima:', err.message));
    }
    if (sesiList.rows.length > 0)
      console.log(`[Scheduler] Reminder H-1 dikirim untuk ${sesiList.rows.length} sesi`);
  } catch (err) {
    console.error('[Scheduler] Gagal cek reminder H-1:', err.message);
  }
});

// ==================== REMINDER 1 JAM SEBELUM ====================
cron.schedule('*/30 * * * *', async () => {
  const query = `
    SELECT s.*,
      u1.nama as pengirim_nama, u2.nama as penerima_nama
    FROM _sesi_belajar s
    JOIN _users u1 ON s.pengirim_id = u1.id
    JOIN _users u2 ON s.penerima_id = u2.id
    WHERE s.status = 'diterima'
    AND (s.tanggal || ' ' || s.jam_mulai)::timestamp 
        BETWEEN NOW() + INTERVAL '55 minutes' AND NOW() + INTERVAL '65 minutes'
  `;

  try {
    const sesiList = await db.query(query);
    for (const s of sesiList.rows) {
      const jam = s.jam_mulai ? s.jam_mulai.substring(0, 5) : '';
      const pesan = `Sesimu bersama ${s.penerima_nama} — ${s.mata_kuliah} — dimulai dalam 1 jam (pukul ${jam}). Bersiaplah!`;
      const pesanPenerima = `Sesimu bersama ${s.pengirim_nama} — ${s.mata_kuliah} — dimulai dalam 1 jam (pukul ${jam}). Bersiaplah!`;
      await db.query(
        `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Sesi Dimulai dalam 1 Jam', $2, 'sesi')`,
        [s.pengirim_id, pesan]
      ).catch(err => console.error('Gagal notif 1jam pengirim:', err.message));
      await db.query(
        `INSERT INTO _notifikasi (user_id, judul, pesan, tipe) VALUES ($1, 'Sesi Dimulai dalam 1 Jam', $2, 'sesi')`,
        [s.penerima_id, pesanPenerima]
      ).catch(err => console.error('Gagal notif 1jam penerima:', err.message));
    }
    if (sesiList.rows.length > 0)
      console.log(`[Scheduler] Reminder 1 jam dikirim untuk ${sesiList.rows.length} sesi`);
  } catch (err) {
    console.error('[Scheduler] Gagal cek reminder 1 jam:', err.message);
  }
});

console.log('[Scheduler] ✅ Semua cron job aktif');
module.exports = {};
const { Pool } = require("pg");
require("dotenv").config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // wajib untuk Supabase
  },
});

// Test koneksi saat startup
db.connect((err, client, release) => {
  if (err) {
    console.log("Koneksi database gagal:", err.message);
    return;
  }
  console.log("Koneksi database berhasil! ✅");
  release();
});

module.exports = db;
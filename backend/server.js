const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const passport = require("./config/passport");
require("dotenv").config();

const app = express();
app.set('trust proxy', 1);

// Scheduler (auto-selesai & reminder)
require("./scheduler");

// Middleware
app.use(cors({
  origin: ['https://edu-mate-fx6a.vercel.app', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// FIX: Pakai MemoryStore saja — tidak butuh MySQL session store
// Session hanya dipakai sebentar saat OAuth redirect (< 1 menit)
// Token JWT yang handle auth jangka panjang, bukan session
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    // Tidak pakai store — pakai MemoryStore default
    // MemoryStore cukup karena session hanya hidup saat OAuth berlangsung
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 5 * 60 * 1000, // 5 menit — cukup untuk proses OAuth
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
  })
);

// Passport — harus setelah session
app.use(passport.initialize());
app.use(passport.session());

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Root redirect ke login
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
});

// Test route
app.get("/api", (req, res) => {
  res.json({ message: "EduMate API berjalan! ✅" });
});

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/jadwal", require("./routes/jadwal"));
app.use("/api/matching", require("./routes/matching"));
app.use("/api/sesi", require("./routes/sesi"));
app.use("/api/notifikasi", require("./routes/notifikasi"));
app.use("/api/rating", require("./routes/rating"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT} ✅`);
});
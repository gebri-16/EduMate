const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');
require('dotenv').config();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '') + '/api/auth/google/callback',
  passReqToCallback: true
},
async (req, accessToken, refreshToken, profile, done) => {
  const email = profile.emails[0].value;
  const nama = profile.displayName;
  const foto = profile.photos[0].value;

  try {
    // Cek apakah user sudah ada di database
    const result = await db.query('SELECT * FROM _users WHERE email = $1', [email]);

    if (result.rows.length > 0) {
      // User sudah ada, langsung login
      return done(null, result.rows[0]);
    } else {
      // User belum ada, buat akun baru
      const newUser = await db.query(
        'INSERT INTO _users (nama, email, foto) VALUES ($1, $2, $3) RETURNING *',
        [nama, email, foto]
      );
      return done(null, newUser.rows[0]);
    }
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query('SELECT * FROM _users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
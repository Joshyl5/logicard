const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const MEMBERSHIP_START = 10010121;

// ── Connection pool ────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Schema setup (runs once on start) ─────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      membership_number  INTEGER PRIMARY KEY,
      company_name       TEXT,
      role               TEXT,
      first_name         TEXT NOT NULL,
      last_name          TEXT NOT NULL,
      email              TEXT UNIQUE NOT NULL,
      phone              TEXT,
      date_of_birth      TEXT,
      address_line1      TEXT,
      address_line2      TEXT,
      city               TEXT,
      county             TEXT,
      postcode           TEXT,
      country            TEXT,
      password_hash      TEXT,
      verified           BOOLEAN DEFAULT TRUE,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      referred_by        INTEGER,
      total_referrals    INTEGER DEFAULT 0,
      monthly_entries    INTEGER DEFAULT 0,
      marketing_consent  BOOLEAN DEFAULT FALSE,
      marketing_consent_at TIMESTAMPTZ,
      gdpr_consent       BOOLEAN DEFAULT TRUE,
      reset_token        TEXT,
      reset_token_expiry BIGINT
    )
  `);

  // Safe migrations for existing tables
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS promo_code TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS free_year BOOLEAN DEFAULT FALSE`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS giveaway_history (
      id                SERIAL PRIMARY KEY,
      membership_number INTEGER,
      name              TEXT,
      email             TEXT,
      entries           INTEGER,
      drawn_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

initDb().catch(err => console.error('DB init error:', err.message));

// ── Row → camelCase member object ──────────────────────────────
function toMember(row) {
  if (!row) return null;
  return {
    membershipNumber:   row.membership_number,
    companyName:        row.company_name,
    role:               row.role,
    firstName:          row.first_name,
    lastName:           row.last_name,
    email:              row.email,
    phone:              row.phone,
    dateOfBirth:        row.date_of_birth,
    addressLine1:       row.address_line1,
    addressLine2:       row.address_line2,
    city:               row.city,
    county:             row.county,
    postcode:           row.postcode,
    country:            row.country,
    passwordHash:       row.password_hash,
    verified:           row.verified,
    createdAt:          row.created_at,
    referredBy:         row.referred_by,
    totalReferrals:     row.total_referrals  || 0,
    monthlyEntries:     row.monthly_entries  || 0,
    marketingConsent:   row.marketing_consent,
    marketingConsentAt: row.marketing_consent_at,
    gdprConsent:        row.gdpr_consent,
    resetToken:         row.reset_token,
    resetTokenExpiry:   row.reset_token_expiry,
    promoCode:          row.promo_code,
    freeYear:           row.free_year,
  };
}

// ── Public API ─────────────────────────────────────────────────
async function emailExists(email) {
  const r = await pool.query('SELECT 1 FROM members WHERE email = $1', [email.toLowerCase()]);
  return r.rows.length > 0;
}

async function createMember(data) {
  const {
    companyName, role, firstName, lastName, email, phone, dateOfBirth,
    addressLine1, addressLine2, city, county, postcode, country,
    password, gdprConsent, marketingConsent, referredBy,
    promoCode = null, freeYear = false,
  } = data;

  // Next membership number
  const maxRes = await pool.query('SELECT MAX(membership_number) AS m FROM members');
  const membershipNumber = (maxRes.rows[0].m || MEMBERSHIP_START - 1) + 1;

  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
  const now = new Date().toISOString();

  await pool.query(`
    INSERT INTO members (
      membership_number, company_name, role, first_name, last_name,
      email, phone, date_of_birth, address_line1, address_line2,
      city, county, postcode, country, password_hash, verified, created_at,
      referred_by, total_referrals, monthly_entries,
      marketing_consent, marketing_consent_at, gdpr_consent,
      promo_code, free_year
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,$16,
      $17,0,0,$18,$19,$20,$21,$22
    )
  `, [
    membershipNumber, companyName, role, firstName, lastName,
    email.toLowerCase(), phone, dateOfBirth || null,
    addressLine1, addressLine2 || null,
    city, county || null, postcode.toUpperCase(), country,
    passwordHash, now,
    referredBy ? Number(referredBy) : null,
    !!marketingConsent,
    marketingConsent ? now : null,
    !!gdprConsent,
    promoCode || null,
    !!freeYear,
  ]);

  if (referredBy) {
    await pool.query(`
      UPDATE members
      SET total_referrals = total_referrals + 1,
          monthly_entries = monthly_entries + 1
      WHERE membership_number = $1
    `, [Number(referredBy)]);
  }

  return { membershipNumber };
}

async function findMemberByEmail(email) {
  const r = await pool.query('SELECT * FROM members WHERE email = $1', [email.toLowerCase()]);
  return toMember(r.rows[0]);
}

async function getMemberByNumber(membershipNumber) {
  const r = await pool.query('SELECT * FROM members WHERE membership_number = $1', [membershipNumber]);
  return toMember(r.rows[0]);
}

async function getAllMembers() {
  const r = await pool.query('SELECT * FROM members ORDER BY membership_number');
  return r.rows.map(toMember);
}

async function setResetToken(email, token, expiry) {
  const r = await pool.query(
    'UPDATE members SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3',
    [token, expiry, email.toLowerCase()]
  );
  return r.rowCount > 0;
}

async function findMemberByResetToken(token) {
  const r = await pool.query('SELECT * FROM members WHERE reset_token = $1', [token]);
  return toMember(r.rows[0]);
}

async function clearResetToken(email, newPasswordHash) {
  const r = await pool.query(
    'UPDATE members SET password_hash=$1, reset_token=NULL, reset_token_expiry=NULL WHERE email=$2',
    [newPasswordHash, email.toLowerCase()]
  );
  return r.rowCount > 0;
}

async function resetMonthlyEntries() {
  await pool.query('UPDATE members SET monthly_entries = 0');
}

async function recordGiveawayWinner(winner) {
  await pool.query(
    'INSERT INTO giveaway_history (membership_number, name, email, entries) VALUES ($1,$2,$3,$4)',
    [winner.membershipNumber, `${winner.firstName} ${winner.lastName}`, winner.email, winner.monthlyEntries]
  );
}

async function getGiveawayHistory() {
  const r = await pool.query('SELECT * FROM giveaway_history ORDER BY drawn_at DESC');
  return r.rows.map(row => ({
    membershipNumber: row.membership_number,
    name:    row.name,
    email:   row.email,
    entries: row.entries,
    drawnAt: row.drawn_at,
  }));
}

module.exports = {
  createMember, emailExists, findMemberByEmail, getMemberByNumber, getAllMembers,
  setResetToken, findMemberByResetToken, clearResetToken,
  resetMonthlyEntries, recordGiveawayWinner, getGiveawayHistory,
};

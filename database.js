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

  // Proof-of-employment verification — existing members keep their current
  // verified=TRUE value; only new signups default to unverified from here on.
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS verification_method TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS work_email TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS work_email_token TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS work_email_token_expiry BIGINT`);
  await pool.query(`ALTER TABLE members ALTER COLUMN verified SET DEFAULT FALSE`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_documents (
      id                 SERIAL PRIMARY KEY,
      membership_number  INTEGER NOT NULL REFERENCES members(membership_number),
      doc_type           TEXT NOT NULL,
      file_key           TEXT,
      original_filename  TEXT,
      mime_type          TEXT,
      note               TEXT,
      status             TEXT DEFAULT 'pending',
      submitted_at       TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at        TIMESTAMPTZ,
      rejection_reason   TEXT
    )
  `);

  // file_key/original_filename are nulled out once a reviewed document is
  // purged (see reviewVerificationDocument purge sweep in server.js), so
  // they can't stay NOT NULL.
  await pool.query(`ALTER TABLE verification_documents ALTER COLUMN file_key DROP NOT NULL`);
  await pool.query(`ALTER TABLE verification_documents ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ`);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS offers (
      id             SERIAL PRIMARY KEY,
      merchant_name  TEXT NOT NULL,
      title          TEXT NOT NULL,
      description    TEXT,
      category       TEXT,
      discount_text  TEXT,
      voucher_code   TEXT,
      affiliate_url  TEXT NOT NULL,
      image_url      TEXT,
      is_active      BOOLEAN DEFAULT TRUE,
      sort_order     INTEGER DEFAULT 0,
      click_count    INTEGER DEFAULT 0,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // One-time-use coupon pool — lets marketing hand over a batch of unique
  // codes per offer instead of one shared code that can leak publicly.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_coupon_codes (
      id            SERIAL PRIMARY KEY,
      offer_id      INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      code          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'available',
      claimed_by    INTEGER REFERENCES members(membership_number),
      claimed_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (offer_id, code)
    )
  `);
  // One claimed code per member per offer — the DB itself is the source of
  // truth against a member ending up with two codes from a double-click race.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_coupon_member
    ON offer_coupon_codes (offer_id, claimed_by) WHERE claimed_by IS NOT NULL
  `);

  // Tracks the first time a member actually goes to redeem an offer (clicks
  // "Get This Deal") — the source for the "offers accepted" dashboard stat.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_redemptions (
      id                 SERIAL PRIMARY KEY,
      offer_id           INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      membership_number  INTEGER NOT NULL REFERENCES members(membership_number),
      redeemed_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (offer_id, membership_number)
    )
  `);

  // "Notify me" list for offers that have run out of unique codes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_waitlist (
      id                 SERIAL PRIMARY KEY,
      offer_id           INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      membership_number  INTEGER NOT NULL REFERENCES members(membership_number),
      registered_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (offer_id, membership_number)
    )
  `);

  // Generic in-app notification queue — currently only used for restock alerts.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id                 SERIAL PRIMARY KEY,
      membership_number  INTEGER NOT NULL REFERENCES members(membership_number),
      title              TEXT NOT NULL,
      body               TEXT,
      link_url           TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      read_at            TIMESTAMPTZ
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
    verificationStatus: row.verification_status,
    verificationMethod: row.verification_method,
    verifiedAt:         row.verified_at,
    rejectionReason:    row.rejection_reason,
    workEmail:          row.work_email,
    workEmailToken:       row.work_email_token,
    workEmailTokenExpiry: row.work_email_token_expiry,
  };
}

// ── Row → camelCase verification document object ───────────────
function toVerificationDoc(row) {
  if (!row) return null;
  return {
    id:               row.id,
    membershipNumber: row.membership_number,
    docType:          row.doc_type,
    fileKey:          row.file_key,
    originalFilename: row.original_filename,
    mimeType:         row.mime_type,
    note:             row.note,
    status:           row.status,
    submittedAt:      row.submitted_at,
    reviewedAt:       row.reviewed_at,
    rejectionReason:  row.rejection_reason,
    purgedAt:         row.purged_at,
  };
}

// ── Row → camelCase offer object ────────────────────────────────
function toOffer(row) {
  if (!row) return null;
  return {
    id:            row.id,
    merchantName:  row.merchant_name,
    title:         row.title,
    description:   row.description,
    category:      row.category,
    discountText:  row.discount_text,
    voucherCode:   row.voucher_code,
    affiliateUrl:  row.affiliate_url,
    imageUrl:      row.image_url,
    isActive:      row.is_active,
    sortOrder:     row.sort_order,
    clickCount:    row.click_count,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

// ── Public API ─────────────────────────────────────────────────
async function emailExists(email) {
  const r = await pool.query('SELECT 1 FROM members WHERE email = $1', [email.toLowerCase()]);
  return r.rows.length > 0;
}

async function createMember(data) {
  const {
    companyName, role, firstName, lastName, email, phone, dateOfBirth = null,
    addressLine1 = null, addressLine2 = null, city = null, county = null,
    postcode, country = null,
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
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE,$16,
      $17,0,0,$18,$19,$20,$21,$22
    )
  `, [
    membershipNumber, companyName, role, firstName, lastName,
    email.toLowerCase(), phone, dateOfBirth || null,
    addressLine1 || null, addressLine2 || null,
    city || null, county || null, postcode ? postcode.toUpperCase() : null, country || null,
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

async function getActiveOffers() {
  const r = await pool.query(
    'SELECT * FROM offers WHERE is_active = true ORDER BY sort_order ASC, created_at DESC, id ASC'
  );
  return r.rows.map(toOffer);
}

async function getAllOffers() {
  const r = await pool.query('SELECT * FROM offers ORDER BY sort_order ASC, created_at DESC, id ASC');
  return r.rows.map(toOffer);
}

async function getOfferById(id) {
  const r = await pool.query('SELECT * FROM offers WHERE id = $1', [id]);
  return toOffer(r.rows[0]);
}

async function createOffer(data) {
  const {
    merchantName, title, description = null, category = null,
    discountText = null, voucherCode = null, affiliateUrl, imageUrl = null,
    isActive = true, sortOrder = 0,
  } = data;

  const r = await pool.query(`
    INSERT INTO offers (
      merchant_name, title, description, category, discount_text,
      voucher_code, affiliate_url, image_url, is_active, sort_order
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [merchantName, title, description, category, discountText, voucherCode, affiliateUrl, imageUrl, !!isActive, sortOrder]);

  return toOffer(r.rows[0]);
}

async function updateOffer(id, data) {
  const {
    merchantName, title, description = null, category = null,
    discountText = null, voucherCode = null, affiliateUrl, imageUrl = null,
    isActive = true, sortOrder = 0,
  } = data;

  const r = await pool.query(`
    UPDATE offers SET
      merchant_name = $1, title = $2, description = $3, category = $4,
      discount_text = $5, voucher_code = $6, affiliate_url = $7, image_url = $8,
      is_active = $9, sort_order = $10, updated_at = NOW()
    WHERE id = $11
    RETURNING *
  `, [merchantName, title, description, category, discountText, voucherCode, affiliateUrl, imageUrl, !!isActive, sortOrder, id]);

  return toOffer(r.rows[0]);
}

async function deleteOffer(id) {
  const r = await pool.query('DELETE FROM offers WHERE id = $1', [id]);
  return r.rowCount > 0;
}

async function incrementOfferClicks(id) {
  await pool.query('UPDATE offers SET click_count = click_count + 1 WHERE id = $1', [id]);
}

// ── Offer redemption tracking ────────────────────────────────────
async function recordOfferRedemption(offerId, membershipNumber) {
  await pool.query(
    'INSERT INTO offer_redemptions (offer_id, membership_number) VALUES ($1, $2) ON CONFLICT (offer_id, membership_number) DO NOTHING',
    [offerId, membershipNumber]
  );
}

async function getOffersAcceptedCount(membershipNumber) {
  const r = await pool.query(
    'SELECT COUNT(*) AS count FROM offer_redemptions WHERE membership_number = $1',
    [membershipNumber]
  );
  return Number(r.rows[0].count);
}

// ── One-time-use coupon codes ────────────────────────────────────
async function bulkAddCouponCodes(offerId, codes) {
  const clean = [...new Set(codes.map(c => String(c).trim()).filter(Boolean))];
  if (!clean.length) return { inserted: 0, skipped: 0 };

  const r = await pool.query(`
    INSERT INTO offer_coupon_codes (offer_id, code)
    SELECT $1, code FROM unnest($2::text[]) AS code
    ON CONFLICT (offer_id, code) DO NOTHING
    RETURNING id
  `, [offerId, clean]);

  return { inserted: r.rowCount, skipped: clean.length - r.rowCount };
}

async function getMemberClaimedCodes(membershipNumber, offerIds) {
  if (!offerIds.length) return {};
  const r = await pool.query(
    'SELECT offer_id, code FROM offer_coupon_codes WHERE claimed_by = $1 AND offer_id = ANY($2::int[])',
    [membershipNumber, offerIds]
  );
  const map = {};
  for (const row of r.rows) map[row.offer_id] = row.code;
  return map;
}

async function getCouponStatsForOffers(offerIds) {
  if (!offerIds.length) return {};
  const r = await pool.query(`
    SELECT offer_id,
      COUNT(*) FILTER (WHERE status = 'available') AS available,
      COUNT(*) AS total
    FROM offer_coupon_codes
    WHERE offer_id = ANY($1::int[])
    GROUP BY offer_id
  `, [offerIds]);

  const map = {};
  for (const row of r.rows) map[row.offer_id] = { available: Number(row.available), total: Number(row.total) };
  return map;
}

// Atomic claim: idempotent if the member already has a code for this offer,
// otherwise grabs one available row under FOR UPDATE SKIP LOCKED so two
// members clicking at the same moment never get handed the same code.
async function claimCouponCode(offerId, membershipNumber) {
  const existing = await pool.query(
    'SELECT code FROM offer_coupon_codes WHERE offer_id = $1 AND claimed_by = $2 LIMIT 1',
    [offerId, membershipNumber]
  );
  if (existing.rows[0]) return { code: existing.rows[0].code, alreadyClaimed: true, outOfStock: false };

  try {
    const claimed = await pool.query(`
      UPDATE offer_coupon_codes
      SET status = 'claimed', claimed_by = $2, claimed_at = NOW()
      WHERE id = (
        SELECT id FROM offer_coupon_codes
        WHERE offer_id = $1 AND status = 'available'
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING code
    `, [offerId, membershipNumber]);

    if (!claimed.rows[0]) return { code: null, alreadyClaimed: false, outOfStock: true };
    return { code: claimed.rows[0].code, alreadyClaimed: false, outOfStock: false };
  } catch (err) {
    // Lost a same-member double-click race against the partial unique index — fetch what landed.
    if (err.code === '23505') {
      const retry = await pool.query(
        'SELECT code FROM offer_coupon_codes WHERE offer_id = $1 AND claimed_by = $2 LIMIT 1',
        [offerId, membershipNumber]
      );
      return { code: retry.rows[0]?.code || null, alreadyClaimed: true, outOfStock: false };
    }
    throw err;
  }
}

// ── Offer restock waitlist ────────────────────────────────────────
async function registerOfferInterest(offerId, membershipNumber) {
  await pool.query(
    'INSERT INTO offer_waitlist (offer_id, membership_number) VALUES ($1, $2) ON CONFLICT (offer_id, membership_number) DO NOTHING',
    [offerId, membershipNumber]
  );
}

async function getMemberWaitlistedOfferIds(membershipNumber, offerIds) {
  if (!offerIds.length) return new Set();
  const r = await pool.query(
    'SELECT offer_id FROM offer_waitlist WHERE membership_number = $1 AND offer_id = ANY($2::int[])',
    [membershipNumber, offerIds]
  );
  return new Set(r.rows.map(row => row.offer_id));
}

// Atomically reads and clears the waitlist for an offer in one round trip —
// callers use the returned member numbers to send restock notifications.
async function popOfferWaitlist(offerId) {
  const r = await pool.query(
    'DELETE FROM offer_waitlist WHERE offer_id = $1 RETURNING membership_number',
    [offerId]
  );
  return r.rows.map(row => row.membership_number);
}

// ── In-app notifications ────────────────────────────────────────
async function createNotification({ membershipNumber, title, body, linkUrl }) {
  await pool.query(
    'INSERT INTO notifications (membership_number, title, body, link_url) VALUES ($1, $2, $3, $4)',
    [membershipNumber, title, body || null, linkUrl || null]
  );
}

async function getUnreadNotifications(membershipNumber) {
  const r = await pool.query(
    'SELECT id, title, body, link_url, created_at FROM notifications WHERE membership_number = $1 AND read_at IS NULL ORDER BY created_at ASC',
    [membershipNumber]
  );
  return r.rows.map(row => ({ id: row.id, title: row.title, body: row.body, linkUrl: row.link_url, createdAt: row.created_at }));
}

async function markNotificationRead(id, membershipNumber) {
  await pool.query(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND membership_number = $2',
    [id, membershipNumber]
  );
}

// ── Proof-of-employment verification ────────────────────────────
async function createVerificationDocument({ membershipNumber, docType, fileKey, originalFilename, mimeType, note }) {
  const r = await pool.query(`
    INSERT INTO verification_documents (membership_number, doc_type, file_key, original_filename, mime_type, note)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [membershipNumber, docType, fileKey, originalFilename || null, mimeType || null, note || null]);

  // Re-open the review queue for anyone resubmitting after a rejection
  await pool.query(`
    UPDATE members SET verification_status = 'pending', rejection_reason = NULL
    WHERE membership_number = $1 AND verified = FALSE
  `, [membershipNumber]);

  return toVerificationDoc(r.rows[0]);
}

async function getPendingVerificationDocuments() {
  const r = await pool.query(`
    SELECT d.*, m.first_name, m.last_name, m.email, m.company_name, m.role
    FROM verification_documents d
    JOIN members m ON m.membership_number = d.membership_number
    WHERE d.status = 'pending'
    ORDER BY d.submitted_at ASC
  `);
  return r.rows.map(row => ({
    ...toVerificationDoc(row),
    firstName:   row.first_name,
    lastName:    row.last_name,
    email:       row.email,
    companyName: row.company_name,
    role:        row.role,
  }));
}

async function getVerificationDocumentsForMember(membershipNumber) {
  const r = await pool.query(
    'SELECT * FROM verification_documents WHERE membership_number = $1 ORDER BY submitted_at DESC',
    [membershipNumber]
  );
  return r.rows.map(toVerificationDoc);
}

async function getVerificationDocument(id) {
  const r = await pool.query('SELECT * FROM verification_documents WHERE id = $1', [id]);
  return toVerificationDoc(r.rows[0]);
}

async function reviewVerificationDocument(id, { status, reason = null }) {
  const docRes = await pool.query(
    'UPDATE verification_documents SET status = $1, rejection_reason = $2, reviewed_at = NOW() WHERE id = $3 RETURNING *',
    [status, reason, id]
  );
  const document = toVerificationDoc(docRes.rows[0]);
  if (!document) return null;

  if (status === 'approved') {
    await pool.query(`
      UPDATE members SET
        verified = TRUE, verification_status = 'verified',
        verification_method = 'document_review', verified_at = NOW(), rejection_reason = NULL
      WHERE membership_number = $1
    `, [document.membershipNumber]);
  } else if (status === 'rejected') {
    await pool.query(`
      UPDATE members SET verification_status = 'rejected', rejection_reason = $2
      WHERE membership_number = $1
    `, [document.membershipNumber, reason]);
  }

  const memberRes = await pool.query('SELECT * FROM members WHERE membership_number = $1', [document.membershipNumber]);
  return { document, member: toMember(memberRes.rows[0]) };
}

// Reviewed (approved/rejected) documents whose file hasn't been purged yet
// and are past the retention window, counted from the moment they were reviewed.
async function getDocumentsDueForPurge(days) {
  const r = await pool.query(`
    SELECT * FROM verification_documents
    WHERE status IN ('approved', 'rejected')
      AND purged_at IS NULL
      AND file_key IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND reviewed_at <= NOW() - make_interval(days => $1::int)
  `, [days]);
  return r.rows.map(toVerificationDoc);
}

// Drops the file reference and original filename — keeps doc_type, status,
// submitted_at/reviewed_at and rejection_reason as the audit trail.
async function markDocumentPurged(id) {
  const r = await pool.query(`
    UPDATE verification_documents
    SET file_key = NULL, original_filename = NULL, purged_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id]);
  return toVerificationDoc(r.rows[0]);
}

async function setWorkEmailToken(membershipNumber, workEmail, tokenHash, expiry) {
  await pool.query(
    'UPDATE members SET work_email = $1, work_email_token = $2, work_email_token_expiry = $3 WHERE membership_number = $4',
    [workEmail, tokenHash, expiry, membershipNumber]
  );
}

async function confirmWorkEmailToken(tokenHash) {
  const r = await pool.query('SELECT * FROM members WHERE work_email_token = $1', [tokenHash]);
  const member = toMember(r.rows[0]);
  if (!member || !member.workEmailTokenExpiry || Date.now() > Number(member.workEmailTokenExpiry)) return null;

  await pool.query(`
    UPDATE members SET
      verified = TRUE, verification_status = 'verified',
      verification_method = 'work_email', verified_at = NOW(), rejection_reason = NULL,
      work_email_token = NULL, work_email_token_expiry = NULL
    WHERE membership_number = $1
  `, [member.membershipNumber]);

  return member;
}

module.exports = {
  createMember, emailExists, findMemberByEmail, getMemberByNumber, getAllMembers,
  setResetToken, findMemberByResetToken, clearResetToken,
  resetMonthlyEntries, recordGiveawayWinner, getGiveawayHistory,
  getActiveOffers, getAllOffers, getOfferById, createOffer, updateOffer, deleteOffer, incrementOfferClicks,
  recordOfferRedemption, getOffersAcceptedCount,
  bulkAddCouponCodes, getCouponStatsForOffers, claimCouponCode, getMemberClaimedCodes,
  registerOfferInterest, getMemberWaitlistedOfferIds, popOfferWaitlist,
  createNotification, getUnreadNotifications, markNotificationRead,
  createVerificationDocument, getPendingVerificationDocuments, getVerificationDocumentsForMember,
  getVerificationDocument, reviewVerificationDocument, setWorkEmailToken, confirmWorkEmailToken,
  getDocumentsDueForPurge, markDocumentPurged,
};

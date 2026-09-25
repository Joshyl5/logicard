const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const { slugify } = require('./job-roles');

const MEMBERSHIP_START = 10010121;

// ── Connection pool ────────────────────────────────────────────
// max: how many simultaneous DB connections this one server instance may
// open. Default (unset) is only 10, which queues up fast under real traffic
// (e.g. many members loading the dashboard/offers around the same time).
// Override via DB_POOL_MAX in Railway if the Postgres plan's own connection
// ceiling allows more headroom (check plan limits before raising further —
// this number times the number of app instances must stay under that).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Without this handler, an idle pooled connection that drops (network blip,
// DB restart/failover) throws an *uncaught* error that crashes the entire
// Node process — not just the one request using it. Logging it here instead
// keeps the server up; the pool transparently replaces the dead connection.
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client:', err);
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
      age_range          TEXT,
      gender             TEXT,
      address_line1      TEXT,
      address_line2      TEXT,
      city               TEXT,
      county             TEXT,
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
  // Postcode was dropped from signup (2026-07-17) — Town/City covers the
  // "where are you based" need, and this permanently removes any postcode
  // already stored for existing members too.
  await pool.query(`ALTER TABLE members DROP COLUMN IF EXISTS postcode`);
  // date_of_birth never actually held a date — the signup form only ever
  // collected an age band (e.g. "25-39") — so the column is renamed to match
  // what it really stores (2026-07-24). Guarded so it only runs once: after
  // the first successful rename, date_of_birth no longer exists.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'date_of_birth')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'age_range')
      THEN
        ALTER TABLE members RENAME COLUMN date_of_birth TO age_range;
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS promo_code TEXT`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS free_year BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS role_category TEXT`);
  // Town/City split into two separate required fields (2026-07-19) — "city"
  // already existed; "town" is the new column, existing rows just get NULL.
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS town TEXT`);
  // Free-text confirmation captured when a member picks "Other" for
  // roleCategory, since "Other" itself isn't one of the real categories.
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS role_category_other TEXT`);

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
  // Lets a normal category offer also appear as a "Featured Partner" tile
  // on the member dashboard, instead of maintaining a separate advert entry.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`);
  // Splits the single "featured" flag above into two independent
  // placements — an offer can be featured on the member dashboard, the
  // public homepage/Deals page, both, or neither, instead of being forced
  // into "both or neither" together. Backfilled once from is_featured so
  // existing featured offers keep showing in both places exactly as
  // before; only fills gaps (WHERE ... IS NULL), never overwrites a value
  // set independently afterward.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS featured_dashboard BOOLEAN`);
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS featured_public BOOLEAN`);
  await pool.query(`UPDATE offers SET featured_dashboard = is_featured, featured_public = is_featured WHERE featured_dashboard IS NULL`);
  // NULL = shown to everyone. 'M'/'F'/'Other' restricts the offer to members
  // who set the matching gender — members with no gender on file always see
  // every offer regardless of this field.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS target_gender TEXT`);
  // Which affiliate network the offer's link goes through — admin-facing
  // only (sorting/filtering in Manage Offers), never shown to members.
  // Every offer added before this column existed came from AWIN, so backfill
  // it once rather than leaving them NULL; this only ever fills gaps and
  // never overwrites a value a later offer was given intentionally.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS platform TEXT`);
  await pool.query(`UPDATE offers SET platform = 'AWIN' WHERE platform IS NULL`);

  // Each offer's own public page at the site root (e.g. /gousto,
  // /gousto-2 if a second offer from the same merchant needs its own
  // page too) — see getActiveOfferBySlug / generateUniqueOfferSlug
  // below. A partial unique index (not a plain UNIQUE column) so
  // multiple NULLs are allowed while it's being backfilled.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS slug TEXT`);
  // Brand logo per offer (2026-09): shown on the offer page, deal cards and
  // Hot Deals. Falls back to the matching partner brand's logo when empty.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS logo_url TEXT`);
  // Brand page fields (2026-09): everything the public /<slug> page shows.
  // redeem_type: 'code' (one shared code) | 'unique' (per-member code pool)
  //              | 'link' (no code, discount via the link) | 'instore' (show card)
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS about_brand TEXT`);
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS how_to_redeem TEXT`);
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS terms TEXT`);
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS end_date DATE`);
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS redeem_type TEXT`);
  // has_discount = false: the brand has a page but no discount yet; the page
  // says "No offer at present" and the offer stays out of the deal lists.
  await pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS has_discount BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS offers_slug_idx ON offers (slug) WHERE slug IS NOT NULL`);
  const unslugged = await pool.query('SELECT id, merchant_name FROM offers WHERE slug IS NULL ORDER BY id ASC');
  for (const row of unslugged.rows) {
    const slug = await generateUniqueOfferSlug(row.merchant_name, row.id);
    await pool.query('UPDATE offers SET slug = $1 WHERE id = $2', [slug, row.id]);
  }

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

  // Promotional tiles shown on the member dashboard — simpler than offers
  // (no categories/coupons), just an image, caption and click-through link.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS adverts (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      image_url    TEXT NOT NULL,
      link_url     TEXT,
      is_active    BOOLEAN DEFAULT TRUE,
      sort_order   INTEGER DEFAULT 0,
      click_count  INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Partner brand logos shown on the public Partnerships page's "Our
  // Partners" grid — just a name and a logo, no deal attached. Deliberately
  // separate from `offers`, which always requires deal-shaped fields
  // (discount text, affiliate URL). Use this for "brand is confirmed but
  // there's no live offer yet"; once there's a real deal, add it as a
  // proper offer instead.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_brands (
      id           SERIAL PRIMARY KEY,
      brand_name   TEXT NOT NULL,
      logo_url     TEXT NOT NULL,
      is_active    BOOLEAN DEFAULT TRUE,
      sort_order   INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Clicking a partner logo goes to /deals/:slug — a page showing that
  // brand's live offers (or a "coming soon" state if there aren't any yet).
  await pool.query(`ALTER TABLE partner_brands ADD COLUMN IF NOT EXISTS slug TEXT`);
  // Brand page fields (2026-09): /deals/<slug> shows these.
  await pool.query(`ALTER TABLE partner_brands ADD COLUMN IF NOT EXISTS about_brand TEXT`);
  await pool.query(`ALTER TABLE partner_brands ADD COLUMN IF NOT EXISTS category TEXT`);
  await pool.query(`ALTER TABLE partner_brands ADD COLUMN IF NOT EXISTS banner_url TEXT`);
  await pool.query(`ALTER TABLE partner_brands ADD COLUMN IF NOT EXISTS website_url TEXT`);
  // Advert fields (2026-09): who it's for, image description, schedule,
  // and optionally a Logicard offer page to open instead of an outside link.
  await pool.query(`ALTER TABLE adverts ADD COLUMN IF NOT EXISTS advertiser TEXT`);
  await pool.query(`ALTER TABLE adverts ADD COLUMN IF NOT EXISTS alt_text TEXT`);
  await pool.query(`ALTER TABLE adverts ADD COLUMN IF NOT EXISTS starts_on DATE`);
  await pool.query(`ALTER TABLE adverts ADD COLUMN IF NOT EXISTS ends_on DATE`);
  await pool.query(`ALTER TABLE adverts ADD COLUMN IF NOT EXISTS offer_slug TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS partner_brands_slug_idx ON partner_brands (slug) WHERE slug IS NOT NULL`);

  // Headlines pulled periodically from curated UK logistics/freight trade
  // RSS feeds (see LOGISTICS_NEWS_FEEDS in server.js) — headline, excerpt
  // and a link back to the original source only, never the full article
  // text. Powers /logistics-news.html.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_items (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      link          TEXT NOT NULL UNIQUE,
      source        TEXT NOT NULL,
      summary       TEXT,
      published_at  TIMESTAMPTZ,
      fetched_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Manually-added items (Manage News admin page) — for sources with no
  // usable RSS feed (checked and confirmed absent/empty/discontinued as of
  // Sep 2026: Logistics UK, FleetNews, Motor Transport). Same table and
  // public feed as the auto-pulled items; this flag just distinguishes them
  // for the admin list so they can be edited/removed independently of the
  // scheduled fetch job, which never touches manual rows.
  await pool.query(`ALTER TABLE news_items ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE`);

  // Members Forum (/forum). Logged-in members read; verified members post
  // and reply. Removal is a soft delete (is_removed) so a moderated thread
  // keeps its shape and admins can see what was taken down. is_reported is
  // set by the member "Report" button and surfaces the item at the top of
  // the admin moderation list.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_posts (
      id                 SERIAL PRIMARY KEY,
      membership_number  INTEGER NOT NULL REFERENCES members(membership_number) ON DELETE CASCADE,
      category           TEXT NOT NULL,
      title              TEXT NOT NULL,
      body               TEXT NOT NULL,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      last_activity_at   TIMESTAMPTZ DEFAULT NOW(),
      is_removed         BOOLEAN DEFAULT FALSE,
      is_reported        BOOLEAN DEFAULT FALSE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_replies (
      id                 SERIAL PRIMARY KEY,
      post_id            INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
      membership_number  INTEGER NOT NULL REFERENCES members(membership_number) ON DELETE CASCADE,
      body               TEXT NOT NULL,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      is_removed         BOOLEAN DEFAULT FALSE,
      is_reported        BOOLEAN DEFAULT FALSE
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS forum_posts_activity_idx ON forum_posts (last_activity_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS forum_replies_post_idx ON forum_replies (post_id, created_at)');

  // Guides (/guides, /guides/<slug>): articles written in the admin panel,
  // e.g. "Best cashback current accounts".
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guides (
      id              SERIAL PRIMARY KEY,
      slug            TEXT NOT NULL UNIQUE,
      title           TEXT NOT NULL,
      summary         TEXT,
      body            TEXT NOT NULL,
      category        TEXT,
      hero_image_url  TEXT,
      is_published    BOOLEAN DEFAULT FALSE,
      published_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Tracked links (/go/<slug>): every click is logged, then redirected.
  // membership_number is only set when a logged-in member clicks.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracked_links (
      id               SERIAL PRIMARY KEY,
      slug             TEXT NOT NULL UNIQUE,
      label            TEXT NOT NULL,
      destination_url  TEXT NOT NULL,
      is_active        BOOLEAN DEFAULT TRUE,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS link_clicks (
      id                 SERIAL PRIMARY KEY,
      link_id            INTEGER NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
      clicked_at         TIMESTAMPTZ DEFAULT NOW(),
      membership_number  INTEGER,
      from_path          TEXT
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS link_clicks_link_idx ON link_clicks (link_id, clicked_at)');

  // Site analytics (admin > Analytics). One row per event, no cookies and
  // no IP/browser details. type: view_offer | view_guide | view_page |
  // get_deal | copy_code | signup. target: offer/guide slug, page path, or
  // for signups the source ("deal-buture", "guide-x" or "direct").
  // actor: 'guest' | 'unverified' | 'member'.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_events (
      id                 BIGSERIAL PRIMARY KEY,
      type               TEXT NOT NULL,
      target             TEXT NOT NULL,
      actor              TEXT,
      membership_number  INTEGER,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS site_events_type_idx ON site_events (type, created_at)');
}

initDb().catch(err => console.error('DB init error:', err.message));

// ── Row → camelCase member object ──────────────────────────────
function toMember(row) {
  if (!row) return null;
  return {
    membershipNumber:   row.membership_number,
    companyName:        row.company_name,
    role:               row.role,
    roleCategory:       row.role_category,
    roleCategoryOther:  row.role_category_other,
    firstName:          row.first_name,
    lastName:           row.last_name,
    email:              row.email,
    phone:              row.phone,
    ageRange:           row.age_range,
    gender:             row.gender,
    addressLine1:       row.address_line1,
    addressLine2:       row.address_line2,
    town:               row.town,
    city:               row.city,
    county:             row.county,
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
    logoUrl:       row.logo_url,
    aboutBrand:    row.about_brand,
    howToRedeem:   row.how_to_redeem,
    terms:         row.terms,
    endDate:       row.end_date ? new Date(row.end_date).toISOString().slice(0, 10) : null,
    redeemType:    row.redeem_type,
    hasDiscount:   row.has_discount !== false,
    isActive:          row.is_active,
    featuredDashboard: !!row.featured_dashboard,
    featuredPublic:    !!row.featured_public,
    targetGender:  row.target_gender,
    platform:      row.platform,
    slug:          row.slug,
    sortOrder:     row.sort_order,
    clickCount:    row.click_count,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function toAdvert(row) {
  if (!row) return null;
  return {
    id:         row.id,
    title:      row.title,
    imageUrl:   row.image_url,
    linkUrl:    row.link_url,
    isActive:   row.is_active,
    sortOrder:  row.sort_order,
    clickCount: row.click_count,
    advertiser: row.advertiser,
    altText:    row.alt_text,
    startsOn:   row.starts_on ? new Date(row.starts_on).toISOString().slice(0, 10) : null,
    endsOn:     row.ends_on ? new Date(row.ends_on).toISOString().slice(0, 10) : null,
    offerSlug:  row.offer_slug,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

function toPartnerBrand(row) {
  if (!row) return null;
  return {
    id:        row.id,
    brandName: row.brand_name,
    logoUrl:   row.logo_url,
    aboutBrand: row.about_brand,
    category:  row.category,
    bannerUrl: row.banner_url,
    websiteUrl: row.website_url,
    slug:      row.slug,
    isActive:  row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Public API ─────────────────────────────────────────────────
async function emailExists(email) {
  const r = await pool.query('SELECT 1 FROM members WHERE email = $1', [email.toLowerCase()]);
  return r.rows.length > 0;
}

async function createMember(data) {
  const {
    companyName, role, roleCategory = null, roleCategoryOther = null, firstName, lastName, email, phone,
    ageRange = null, gender = null, addressLine1 = null, addressLine2 = null, town = null, city = null, county = null,
    country = null,
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
      membership_number, company_name, role, role_category, role_category_other, first_name, last_name,
      email, phone, age_range, gender, address_line1, address_line2,
      town, city, county, country, password_hash, verified, created_at,
      referred_by, total_referrals, monthly_entries,
      marketing_consent, marketing_consent_at, gdpr_consent,
      promo_code, free_year
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,FALSE,$19,
      $20,0,0,$21,$22,$23,$24,$25
    )
  `, [
    membershipNumber, companyName, role, roleCategory || null, roleCategoryOther || null, firstName, lastName,
    email.toLowerCase(), phone, ageRange || null, gender || null,
    addressLine1 || null, addressLine2 || null,
    town || null, city || null, county || null, country || null,
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

// Member dashboard's "Featured Partners" tiles.
async function getFeaturedOffersForDashboard() {
  const r = await pool.query(
    'SELECT * FROM offers WHERE is_active = true AND featured_dashboard = true ORDER BY sort_order ASC, created_at DESC, id ASC LIMIT 6'
  );
  return r.rows.map(toOffer);
}

// Public homepage's + Deals page's "Featured Deals" teasers.
async function getFeaturedOffersForPublic() {
  const r = await pool.query(
    'SELECT * FROM offers WHERE is_active = true AND featured_public = true ORDER BY sort_order ASC, created_at DESC, id ASC LIMIT 6'
  );
  return r.rows.map(toOffer);
}

async function getOfferById(id) {
  const r = await pool.query('SELECT * FROM offers WHERE id = $1', [id]);
  return toOffer(r.rows[0]);
}

async function createOffer(data) {
  const {
    merchantName, title, description = null, category = null,
    discountText = null, voucherCode = null, affiliateUrl, imageUrl = null, logoUrl = null,
    aboutBrand = null, howToRedeem = null, terms = null, endDate = null, redeemType = null, hasDiscount = true,
    isActive = true, featuredDashboard = false, featuredPublic = false,
    targetGender = null, platform = 'AWIN', slug = null, sortOrder = 0,
  } = data;

  const r = await pool.query(`
    INSERT INTO offers (
      merchant_name, title, description, category, discount_text,
      voucher_code, affiliate_url, image_url, is_active, is_featured,
      featured_dashboard, featured_public, target_gender, platform, slug, sort_order, logo_url,
      about_brand, how_to_redeem, terms, end_date, redeem_type, has_discount
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    RETURNING *
  `, [
    merchantName, title, description, category, discountText, voucherCode, affiliateUrl, imageUrl,
    !!isActive, !!(featuredDashboard || featuredPublic), !!featuredDashboard, !!featuredPublic,
    targetGender || null, platform || null, slug || slugify(merchantName), sortOrder, logoUrl || null,
    aboutBrand || null, howToRedeem || null, terms || null, endDate || null, redeemType || null, hasDiscount !== false,
  ]);

  return toOffer(r.rows[0]);
}

async function updateOffer(id, data) {
  const {
    merchantName, title, description = null, category = null,
    discountText = null, voucherCode = null, affiliateUrl, imageUrl = null, logoUrl = null,
    aboutBrand = null, howToRedeem = null, terms = null, endDate = null, redeemType = null, hasDiscount = true,
    isActive = true, featuredDashboard = false, featuredPublic = false,
    targetGender = null, platform = 'AWIN', slug = null, sortOrder = 0,
  } = data;

  const r = await pool.query(`
    UPDATE offers SET
      merchant_name = $1, title = $2, description = $3, category = $4,
      discount_text = $5, voucher_code = $6, affiliate_url = $7, image_url = $8,
      is_active = $9, is_featured = $10, featured_dashboard = $11, featured_public = $12,
      target_gender = $13, platform = $14, slug = $15, sort_order = $16, logo_url = $18,
      about_brand = $19, how_to_redeem = $20, terms = $21, end_date = $22, redeem_type = $23, has_discount = $24, updated_at = NOW()
    WHERE id = $17
    RETURNING *
  `, [
    merchantName, title, description, category, discountText, voucherCode, affiliateUrl, imageUrl,
    !!isActive, !!(featuredDashboard || featuredPublic), !!featuredDashboard, !!featuredPublic,
    targetGender || null, platform || null, slug || slugify(merchantName), sortOrder, id, logoUrl || null,
    aboutBrand || null, howToRedeem || null, terms || null, endDate || null, redeemType || null, hasDiscount !== false,
  ]);

  return toOffer(r.rows[0]);
}

async function deleteOffer(id) {
  const r = await pool.query('DELETE FROM offers WHERE id = $1', [id]);
  return r.rowCount > 0;
}

async function incrementOfferClicks(id) {
  await pool.query('UPDATE offers SET click_count = click_count + 1 WHERE id = $1', [id]);
}

// ── Adverts (member-dashboard promo tiles) ────────────────────────
async function getActiveAdverts() {
  const r = await pool.query(
    `SELECT * FROM adverts WHERE is_active = true
       AND (starts_on IS NULL OR starts_on <= CURRENT_DATE)
       AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
     ORDER BY sort_order ASC, created_at DESC, id ASC`
  );
  return r.rows.map(toAdvert);
}

async function getAllAdverts() {
  const r = await pool.query('SELECT * FROM adverts ORDER BY sort_order ASC, created_at DESC, id ASC');
  return r.rows.map(toAdvert);
}

async function getAdvertById(id) {
  const r = await pool.query('SELECT * FROM adverts WHERE id = $1', [id]);
  return toAdvert(r.rows[0]);
}

async function createAdvert(data) {
  const { title, imageUrl, linkUrl = null, isActive = true, sortOrder = 0,
          advertiser = null, altText = null, startsOn = null, endsOn = null, offerSlug = null } = data;

  const r = await pool.query(`
    INSERT INTO adverts (title, image_url, link_url, is_active, sort_order, advertiser, alt_text, starts_on, ends_on, offer_slug)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [title, imageUrl, linkUrl, !!isActive, sortOrder, advertiser, altText, startsOn || null, endsOn || null, offerSlug || null]);

  return toAdvert(r.rows[0]);
}

async function updateAdvert(id, data) {
  const { title, imageUrl, linkUrl = null, isActive = true, sortOrder = 0,
          advertiser = null, altText = null, startsOn = null, endsOn = null, offerSlug = null } = data;

  const r = await pool.query(`
    UPDATE adverts SET
      title = $1, image_url = $2, link_url = $3, is_active = $4, sort_order = $5,
      advertiser = $7, alt_text = $8, starts_on = $9, ends_on = $10, offer_slug = $11, updated_at = NOW()
    WHERE id = $6
    RETURNING *
  `, [title, imageUrl, linkUrl, !!isActive, sortOrder, id, advertiser, altText, startsOn || null, endsOn || null, offerSlug || null]);

  return toAdvert(r.rows[0]);
}

async function deleteAdvert(id) {
  const r = await pool.query('DELETE FROM adverts WHERE id = $1', [id]);
  return r.rowCount > 0;
}

async function incrementAdvertClicks(id) {
  await pool.query('UPDATE adverts SET click_count = click_count + 1 WHERE id = $1', [id]);
}

// ── Partner brands (Partnerships page "Our Partners" grid) ───────
async function getActivePartnerBrands() {
  const r = await pool.query(
    'SELECT * FROM partner_brands WHERE is_active = true ORDER BY sort_order ASC, created_at DESC, id ASC'
  );
  return r.rows.map(toPartnerBrand);
}

async function getAllPartnerBrands() {
  const r = await pool.query('SELECT * FROM partner_brands ORDER BY sort_order ASC, created_at DESC, id ASC');
  return r.rows.map(toPartnerBrand);
}

async function getPartnerBrandById(id) {
  const r = await pool.query('SELECT * FROM partner_brands WHERE id = $1', [id]);
  return toPartnerBrand(r.rows[0]);
}

async function createPartnerBrand(data) {
  const { brandName, logoUrl, slug = null, isActive = true, sortOrder = 0,
          aboutBrand = null, category = null, bannerUrl = null, websiteUrl = null } = data;

  const r = await pool.query(`
    INSERT INTO partner_brands (brand_name, logo_url, slug, is_active, sort_order, about_brand, category, banner_url, website_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [brandName, logoUrl, slug || null, !!isActive, sortOrder, aboutBrand, category, bannerUrl || null, websiteUrl || null]);

  return toPartnerBrand(r.rows[0]);
}

async function updatePartnerBrand(id, data) {
  const { brandName, logoUrl, slug = null, isActive = true, sortOrder = 0,
          aboutBrand = null, category = null, bannerUrl = null, websiteUrl = null } = data;

  const r = await pool.query(`
    UPDATE partner_brands SET
      brand_name = $1, logo_url = $2, slug = $3, is_active = $4, sort_order = $5,
      about_brand = $7, category = $8, banner_url = $9, website_url = $10, updated_at = NOW()
    WHERE id = $6
    RETURNING *
  `, [brandName, logoUrl, slug || null, !!isActive, sortOrder, id, aboutBrand, category, bannerUrl || null, websiteUrl || null]);

  return toPartnerBrand(r.rows[0]);
}

async function setPartnerBrandLogo(id, logoUrl) {
  await pool.query('UPDATE partner_brands SET logo_url = $1, updated_at = NOW() WHERE id = $2', [logoUrl, id]);
}

async function deletePartnerBrand(id) {
  const r = await pool.query('DELETE FROM partner_brands WHERE id = $1', [id]);
  return r.rowCount > 0;
}

async function getPartnerBrandBySlug(slug) {
  const r = await pool.query('SELECT * FROM partner_brands WHERE slug = $1 AND is_active = true', [slug]);
  return toPartnerBrand(r.rows[0]);
}

// ── Logistics news (RSS headlines) ────────────────────────────────
function toNewsItem(row) {
  if (!row) return null;
  return {
    id: row.id, title: row.title, link: row.link, source: row.source,
    summary: row.summary, publishedAt: row.published_at, fetchedAt: row.fetched_at,
    isManual: row.is_manual,
  };
}

// One row per article link — re-fetching the same feed just skips anything
// already stored (ON CONFLICT DO NOTHING), so this is safe to run on a
// timer without growing duplicates or needing to track what's new itself.
// Returns true if the article was new (false if its link was already stored).
async function upsertNewsItem({ title, link, source, summary, publishedAt }) {
  const r = await pool.query(
    `INSERT INTO news_items (title, link, source, summary, published_at)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (link) DO NOTHING`,
    [title, link, source, summary || null, publishedAt || null]
  );
  return r.rowCount > 0;
}

// True if an auto-pulled story was added within the last `days` days
// (the news job uses this so it adds at most one story a day,
// however often the server restarts).
async function hasAutoNewsSince(days) {
  const r = await pool.query(
    `SELECT 1 FROM news_items WHERE NOT COALESCE(is_manual, FALSE)
       AND fetched_at > NOW() - ($1::int * INTERVAL '1 day') LIMIT 1`,
    [days]
  );
  return r.rowCount > 0;
}

// Public news: one auto-pulled story per day (the newest that day), plus
// every story added by hand in Manage News.
async function getRecentNewsItems(limit = 30) {
  const r = await pool.query(
    `SELECT * FROM (
       SELECT * FROM (
         SELECT DISTINCT ON (date_trunc('day', COALESCE(published_at, fetched_at))) *
           FROM news_items WHERE NOT COALESCE(is_manual, FALSE)
          ORDER BY date_trunc('day', COALESCE(published_at, fetched_at)) DESC, COALESCE(published_at, fetched_at) DESC
       ) weekly
       UNION ALL
       SELECT * FROM news_items WHERE is_manual
     ) u
     ORDER BY published_at DESC NULLS LAST, fetched_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(toNewsItem);
}

// ── Manage News (admin) — full list + manual add/edit/delete ─────────
// Covers both auto-pulled and manually-added rows so the admin page is one
// place to see/manage everything in the public feed.
async function getAllNewsItems() {
  const r = await pool.query(
    'SELECT * FROM news_items ORDER BY published_at DESC NULLS LAST, fetched_at DESC, id DESC'
  );
  return r.rows.map(toNewsItem);
}

async function createManualNewsItem({ title, link, source, summary = null, publishedAt = null }) {
  const r = await pool.query(
    `INSERT INTO news_items (title, link, source, summary, published_at, is_manual)
     VALUES ($1,$2,$3,$4,$5,TRUE)
     RETURNING *`,
    [title, link, source, summary || null, publishedAt || null]
  );
  return toNewsItem(r.rows[0]);
}

async function updateNewsItem(id, { title, link, source, summary = null, publishedAt = null }) {
  const r = await pool.query(
    `UPDATE news_items SET
       title = $1, link = $2, source = $3, summary = $4, published_at = $5
     WHERE id = $6
     RETURNING *`,
    [title, link, source, summary || null, publishedAt || null, id]
  );
  return toNewsItem(r.rows[0]);
}

async function deleteNewsItem(id) {
  const r = await pool.query('DELETE FROM news_items WHERE id = $1', [id]);
  return r.rowCount > 0;
}

// Offers shown on a brand's /deals/:slug page — matched by merchant name,
// same public-teaser shape as getFeaturedOffersForPublic (no voucher
// code or affiliate URL; claiming still requires signing up and verifying).
async function getActiveOffersByMerchant(merchantName) {
  const r = await pool.query(
    'SELECT * FROM offers WHERE is_active = true AND lower(merchant_name) = lower($1) ORDER BY sort_order ASC, created_at DESC, id ASC',
    [merchantName]
  );
  return r.rows.map(toOffer);
}

// Powers the public per-offer pages at the site root (e.g. /gousto) —
// every offer has its own persisted slug (set at creation, editable
// after), so two offers from the same merchant each get their own page
// (e.g. /gousto and /gousto-2) instead of the second one having nowhere
// to live. No admin setup beyond adding the offer itself is required,
// unlike partner_brands' /deals/:slug, which needs a manually-created
// entry with its own slug.
async function getActiveOfferBySlug(slug) {
  const r = await pool.query('SELECT * FROM offers WHERE is_active = true AND slug = $1', [slug]);
  return toOffer(r.rows[0]);
}

// Picks a slug for a new (or re-slugged) offer: slugify(merchantName),
// falling back to -2, -3, etc. if that's already taken by a different
// offer — this is what lets a second offer from the same merchant get
// its own page instead of colliding with the first one's.
async function generateUniqueOfferSlug(merchantName, excludeId = null) {
  const base = slugify(merchantName) || 'offer';
  let candidate = base;
  let n = 2;
  for (;;) {
    const query = excludeId ? 'SELECT id FROM offers WHERE slug = $1 AND id != $2' : 'SELECT id FROM offers WHERE slug = $1';
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const r = await pool.query(query, params);
    if (r.rows.length === 0) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
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


// ── Members Forum ─────────────────────────────────────────────────
// Author is shown as first name + surname initial + role only — never the
// full surname, email or membership number.
function forumAuthor(row) {
  const first = row.first_name || 'Member';
  const initial = row.last_name ? ` ${row.last_name.charAt(0).toUpperCase()}.` : '';
  return { name: first + initial, role: row.role || null };
}

function toForumPost(row, viewer) {
  if (!row) return null;
  return {
    id: row.id, category: row.category, title: row.title, body: row.body,
    createdAt: row.created_at, lastActivityAt: row.last_activity_at,
    replyCount: row.reply_count == null ? undefined : Number(row.reply_count),
    author: forumAuthor(row), isMine: viewer != null && row.membership_number === viewer,
  };
}

function toForumReply(row, viewer) {
  return {
    id: row.id, body: row.body, createdAt: row.created_at,
    author: forumAuthor(row), isMine: viewer != null && row.membership_number === viewer,
  };
}

async function listForumPosts({ category = null, limit = 20, offset = 0, viewer = null } = {}) {
  const r = await pool.query(
    `SELECT p.*, m.first_name, m.last_name, m.role,
            (SELECT COUNT(*) FROM forum_replies fr WHERE fr.post_id = p.id AND NOT fr.is_removed) AS reply_count
       FROM forum_posts p JOIN members m ON m.membership_number = p.membership_number
      WHERE NOT p.is_removed AND ($1::text IS NULL OR p.category = $1)
      ORDER BY p.last_activity_at DESC
      LIMIT $2 OFFSET $3`,
    [category, limit, offset]
  );
  return r.rows.map(row => toForumPost(row, viewer));
}

async function getForumPost(id, viewer = null) {
  const p = await pool.query(
    `SELECT p.*, m.first_name, m.last_name, m.role
       FROM forum_posts p JOIN members m ON m.membership_number = p.membership_number
      WHERE p.id = $1 AND NOT p.is_removed`,
    [id]
  );
  if (!p.rows[0]) return null;
  const r = await pool.query(
    `SELECT fr.*, m.first_name, m.last_name, m.role
       FROM forum_replies fr JOIN members m ON m.membership_number = fr.membership_number
      WHERE fr.post_id = $1 AND NOT fr.is_removed
      ORDER BY fr.created_at ASC`,
    [id]
  );
  return { ...toForumPost(p.rows[0], viewer), replies: r.rows.map(row => toForumReply(row, viewer)) };
}

async function createForumPost({ membershipNumber, category, title, body }) {
  const r = await pool.query(
    'INSERT INTO forum_posts (membership_number, category, title, body) VALUES ($1,$2,$3,$4) RETURNING id',
    [membershipNumber, category, title, body]
  );
  return r.rows[0].id;
}

async function createForumReply({ postId, membershipNumber, body }) {
  const post = await pool.query('SELECT id FROM forum_posts WHERE id = $1 AND NOT is_removed', [postId]);
  if (!post.rows[0]) return null;
  const r = await pool.query(
    'INSERT INTO forum_replies (post_id, membership_number, body) VALUES ($1,$2,$3) RETURNING id',
    [postId, membershipNumber, body]
  );
  await pool.query('UPDATE forum_posts SET last_activity_at = NOW() WHERE id = $1', [postId]);
  return r.rows[0].id;
}

// The table name below is picked from a fixed two-value mapping, never from
// user input, so this stays within the parameterized-query-only rule.
function forumTable(type) {
  return type === 'reply' ? 'forum_replies' : 'forum_posts';
}

// ownerOnly: a membership number to only remove the item if that member
// wrote it (members deleting their own), or null for an admin removal.
async function removeForumItem(type, id, ownerOnly = null) {
  const r = await pool.query(
    `UPDATE ${forumTable(type)} SET is_removed = TRUE
      WHERE id = $1 AND ($2::int IS NULL OR membership_number = $2) RETURNING id`,
    [id, ownerOnly]
  );
  return r.rowCount > 0;
}

async function restoreForumItem(type, id) {
  await pool.query(`UPDATE ${forumTable(type)} SET is_removed = FALSE, is_reported = FALSE WHERE id = $1`, [id]);
}

async function reportForumItem(type, id) {
  const r = await pool.query(
    `UPDATE ${forumTable(type)} SET is_reported = TRUE WHERE id = $1 AND NOT is_removed RETURNING id`,
    [id]
  );
  return r.rowCount > 0;
}

async function clearForumReport(type, id) {
  await pool.query(`UPDATE ${forumTable(type)} SET is_reported = FALSE WHERE id = $1`, [id]);
}

// Admin moderation list: newest 200 posts and replies (live and removed),
// live reported items first. Admin-only, so it includes the full name and
// membership number for follow-up.
async function getForumModerationQueue() {
  const r = await pool.query(
    `SELECT * FROM (
       SELECT 'post' AS type, p.id, p.id AS post_id, p.title, p.body, p.category, p.created_at,
              p.is_removed, p.is_reported, p.membership_number, m.first_name, m.last_name
         FROM forum_posts p JOIN members m ON m.membership_number = p.membership_number
       UNION ALL
       SELECT 'reply', fr.id, fr.post_id, fp.title, fr.body, fp.category, fr.created_at,
              fr.is_removed, fr.is_reported, fr.membership_number, m.first_name, m.last_name
         FROM forum_replies fr
         JOIN forum_posts fp ON fp.id = fr.post_id
         JOIN members m ON m.membership_number = fr.membership_number
     ) q
     ORDER BY (is_reported AND NOT is_removed) DESC, created_at DESC
     LIMIT 200`
  );
  return r.rows.map(row => ({
    type: row.type, id: row.id, postId: row.post_id, title: row.title, body: row.body,
    category: row.category, createdAt: row.created_at, isRemoved: row.is_removed,
    isReported: row.is_reported, membershipNumber: row.membership_number,
    authorName: `${row.first_name} ${row.last_name}`,
  }));
}


// ── Guides ────────────────────────────────────────────────────────
function toGuide(row) {
  if (!row) return null;
  return {
    id: row.id, slug: row.slug, title: row.title, summary: row.summary, body: row.body,
    category: row.category, heroImageUrl: row.hero_image_url, isPublished: row.is_published,
    publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function getPublishedGuides() {
  const r = await pool.query('SELECT * FROM guides WHERE is_published ORDER BY published_at DESC NULLS LAST, id DESC');
  return r.rows.map(toGuide);
}

async function getPublishedGuideBySlug(slug) {
  const r = await pool.query('SELECT * FROM guides WHERE slug = $1 AND is_published', [slug]);
  return toGuide(r.rows[0]);
}

async function getAllGuides() {
  const r = await pool.query('SELECT * FROM guides ORDER BY updated_at DESC, id DESC');
  return r.rows.map(toGuide);
}

async function saveGuide(id, { slug, title, summary = null, body, category = null, heroImageUrl = null, isPublished = false }) {
  const finalSlug = slug || slugify(title);
  if (id) {
    const r = await pool.query(
      `UPDATE guides SET slug = $1, title = $2, summary = $3, body = $4, category = $5, hero_image_url = $6,
         is_published = $7,
         published_at = CASE WHEN $7 AND published_at IS NULL THEN NOW() ELSE published_at END,
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [finalSlug, title, summary, body, category, heroImageUrl, !!isPublished, id]
    );
    return toGuide(r.rows[0]);
  }
  const r = await pool.query(
    `INSERT INTO guides (slug, title, summary, body, category, hero_image_url, is_published, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 THEN NOW() END) RETURNING *`,
    [finalSlug, title, summary, body, category, heroImageUrl, !!isPublished]
  );
  return toGuide(r.rows[0]);
}

async function deleteGuide(id) {
  const r = await pool.query('DELETE FROM guides WHERE id = $1', [id]);
  return r.rowCount > 0;
}

// ── Tracked links + click log ──────────────────────────────────────
function toTrackedLink(row) {
  if (!row) return null;
  return {
    id: row.id, slug: row.slug, label: row.label, destinationUrl: row.destination_url,
    isActive: row.is_active, createdAt: row.created_at,
    clicksTotal: row.clicks_total == null ? undefined : Number(row.clicks_total),
    clicks30: row.clicks_30 == null ? undefined : Number(row.clicks_30),
    memberClicks: row.member_clicks == null ? undefined : Number(row.member_clicks),
    lastClick: row.last_click || null,
  };
}

async function getTrackedLinkBySlug(slug) {
  const r = await pool.query('SELECT * FROM tracked_links WHERE slug = $1 AND is_active', [slug]);
  return toTrackedLink(r.rows[0]);
}

async function recordLinkClick(linkId, membershipNumber = null, fromPath = null) {
  await pool.query(
    'INSERT INTO link_clicks (link_id, membership_number, from_path) VALUES ($1, $2, $3)',
    [linkId, membershipNumber, fromPath ? String(fromPath).slice(0, 200) : null]
  );
}

async function getTrackedLinksWithStats() {
  const r = await pool.query(`
    SELECT l.*,
      (SELECT COUNT(*) FROM link_clicks c WHERE c.link_id = l.id) AS clicks_total,
      (SELECT COUNT(*) FROM link_clicks c WHERE c.link_id = l.id AND c.clicked_at > NOW() - INTERVAL '30 days') AS clicks_30,
      (SELECT COUNT(*) FROM link_clicks c WHERE c.link_id = l.id AND c.membership_number IS NOT NULL) AS member_clicks,
      (SELECT MAX(clicked_at) FROM link_clicks c WHERE c.link_id = l.id) AS last_click
    FROM tracked_links l ORDER BY l.created_at DESC`);
  return r.rows.map(toTrackedLink);
}

async function saveTrackedLink(id, { slug, label, destinationUrl, isActive = true }) {
  const finalSlug = slug || slugify(label);
  if (id) {
    const r = await pool.query(
      'UPDATE tracked_links SET slug = $1, label = $2, destination_url = $3, is_active = $4 WHERE id = $5 RETURNING *',
      [finalSlug, label, destinationUrl, !!isActive, id]
    );
    return toTrackedLink(r.rows[0]);
  }
  const r = await pool.query(
    'INSERT INTO tracked_links (slug, label, destination_url, is_active) VALUES ($1,$2,$3,$4) RETURNING *',
    [finalSlug, label, destinationUrl, !!isActive]
  );
  return toTrackedLink(r.rows[0]);
}

async function deleteTrackedLink(id) {
  const r = await pool.query('DELETE FROM tracked_links WHERE id = $1', [id]);
  return r.rowCount > 0;
}

// Click report for one link: clicks per day (last 30 days), which pages the
// clicks came from, and the members who clicked most (admin only).
async function getLinkClickReport(linkId) {
  const [daily, pages, members] = await Promise.all([
    pool.query(`SELECT to_char(date_trunc('day', clicked_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
                FROM link_clicks WHERE link_id = $1 AND clicked_at > NOW() - INTERVAL '30 days'
                GROUP BY 1 ORDER BY 1 DESC`, [linkId]),
    pool.query(`SELECT COALESCE(from_path, '(direct)') AS path, COUNT(*) AS n FROM link_clicks
                WHERE link_id = $1 GROUP BY 1 ORDER BY n DESC LIMIT 10`, [linkId]),
    pool.query(`SELECT c.membership_number, m.first_name, m.last_name, COUNT(*) AS n, MAX(c.clicked_at) AS last
                FROM link_clicks c LEFT JOIN members m ON m.membership_number = c.membership_number
                WHERE c.link_id = $1 AND c.membership_number IS NOT NULL
                GROUP BY 1,2,3 ORDER BY n DESC LIMIT 25`, [linkId]),
  ]);
  return {
    daily: daily.rows.map(r => ({ day: r.day, clicks: Number(r.n) })),
    pages: pages.rows.map(r => ({ path: r.path, clicks: Number(r.n) })),
    members: members.rows.map(r => ({
      membershipNumber: r.membership_number,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown member',
      clicks: Number(r.n), lastClick: r.last,
    })),
  };
}


// ── Site analytics ────────────────────────────────────────────────
async function recordSiteEvent(type, target, actor = null, membershipNumber = null) {
  await pool.query(
    'INSERT INTO site_events (type, target, actor, membership_number) VALUES ($1, $2, $3, $4)',
    [type, String(target).slice(0, 120), actor, membershipNumber]
  );
}

// Everything the Analytics page shows, for the last `days` days.
async function getAnalytics(days = 30) {
  const d = Math.min(Math.max(parseInt(days, 10) || 30, 1), 3650);
  const since = `NOW() - ($1::int * INTERVAL '1 day')`;
  const [offers, guides, pages, signups, links] = await Promise.all([
    pool.query(`
      SELECT o.id, o.slug, o.merchant_name, o.title, o.category, o.is_active,
        COUNT(e.*) FILTER (WHERE e.type = 'view_offer')                          AS views,
        COUNT(e.*) FILTER (WHERE e.type = 'get_deal' AND e.actor = 'member')     AS get_member,
        COUNT(e.*) FILTER (WHERE e.type = 'get_deal' AND e.actor <> 'member')    AS get_guest,
        COUNT(e.*) FILTER (WHERE e.type = 'copy_code')                           AS copies,
        (SELECT COUNT(*) FROM offer_redemptions r WHERE r.offer_id = o.id AND r.redeemed_at > ${since}) AS site_clicks,
        (SELECT COUNT(*) FROM site_events s WHERE s.type = 'signup' AND s.target = 'deal-' || o.slug AND s.created_at > ${since}) AS signups
      FROM offers o
      LEFT JOIN site_events e ON e.target = o.slug AND e.type IN ('view_offer','get_deal','copy_code') AND e.created_at > ${since}
      GROUP BY o.id ORDER BY views DESC, o.merchant_name`, [d]),
    pool.query(`
      SELECT g.id, g.slug, g.title, g.category, g.is_published,
        (SELECT COUNT(*) FROM site_events e WHERE e.type = 'view_guide' AND e.target = g.slug AND e.created_at > ${since}) AS views,
        (SELECT COUNT(*) FROM link_clicks c WHERE c.from_path = '/guides/' || g.slug AND c.clicked_at > ${since}) AS link_clicks,
        (SELECT COUNT(*) FROM site_events s WHERE s.type = 'signup' AND s.target = 'guide-' || g.slug AND s.created_at > ${since}) AS signups
      FROM guides g ORDER BY views DESC, g.title`, [d]),
    pool.query(`SELECT target, COUNT(*) AS n FROM site_events WHERE type = 'view_page' AND created_at > ${since}
                GROUP BY target ORDER BY n DESC`, [d]),
    pool.query(`SELECT target, COUNT(*) AS n FROM site_events WHERE type = 'signup' AND created_at > ${since}
                GROUP BY target ORDER BY n DESC`, [d]),
    pool.query(`SELECT l.slug, l.label, l.destination_url,
                  COUNT(c.*) AS clicks, COUNT(c.membership_number) AS member_clicks
                FROM tracked_links l LEFT JOIN link_clicks c ON c.link_id = l.id AND c.clicked_at > ${since}
                GROUP BY l.id ORDER BY clicks DESC`, [d]),
  ]);
  const n = (v) => Number(v || 0);
  const offerRows = offers.rows.map(r => ({
    id: r.id, slug: r.slug, brand: r.merchant_name, title: r.title, category: r.category || 'Uncategorised', active: r.is_active,
    views: n(r.views), getDealGuests: n(r.get_guest), getDealMembers: n(r.get_member),
    codeCopies: n(r.copies), siteClicks: n(r.site_clicks), signups: n(r.signups),
  }));
  // Category totals are the sum of their offers
  const cats = {};
  offerRows.forEach(o => {
    const c = cats[o.category] || (cats[o.category] = { category: o.category, offers: 0, views: 0, getDealGuests: 0, getDealMembers: 0, codeCopies: 0, siteClicks: 0, signups: 0 });
    c.offers++; ['views', 'getDealGuests', 'getDealMembers', 'codeCopies', 'siteClicks', 'signups'].forEach(k => { c[k] += o[k]; });
  });
  return {
    days: d,
    offers: offerRows,
    categories: Object.values(cats).sort((a, b) => (b.views + b.siteClicks) - (a.views + a.siteClicks)),
    guides: guides.rows.map(r => ({ id: r.id, slug: r.slug, title: r.title, category: r.category, published: r.is_published, views: n(r.views), linkClicks: n(r.link_clicks), signups: n(r.signups) })),
    pages: pages.rows.map(r => ({ path: r.target, views: n(r.n) })),
    signups: signups.rows.map(r => ({ source: r.target, signups: n(r.n) })),
    links: links.rows.map(r => ({ slug: r.slug, label: r.label, destination: r.destination_url, clicks: n(r.clicks), memberClicks: n(r.member_clicks) })),
  };
}

// Members who went through to an offer's website (admin only).
async function getOfferMembers(offerId) {
  const r = await pool.query(
    `SELECT r.membership_number, m.first_name, m.last_name, m.role, r.redeemed_at
       FROM offer_redemptions r JOIN members m ON m.membership_number = r.membership_number
      WHERE r.offer_id = $1 ORDER BY r.redeemed_at DESC LIMIT 500`,
    [offerId]
  );
  return r.rows.map(row => ({
    membershipNumber: row.membership_number, name: `${row.first_name} ${row.last_name}`,
    role: row.role, firstClick: row.redeemed_at,
  }));
}

module.exports = {
  createMember, emailExists, findMemberByEmail, getMemberByNumber, getAllMembers,
  setResetToken, findMemberByResetToken, clearResetToken,
  resetMonthlyEntries, recordGiveawayWinner, getGiveawayHistory,
  getActiveOffers, getAllOffers, getFeaturedOffersForDashboard, getFeaturedOffersForPublic, getOfferById, createOffer, updateOffer, deleteOffer, incrementOfferClicks,
  recordOfferRedemption, getOffersAcceptedCount,
  getActiveAdverts, getAllAdverts, getAdvertById, createAdvert, updateAdvert, deleteAdvert, incrementAdvertClicks,
  getActivePartnerBrands, getAllPartnerBrands, getPartnerBrandById, createPartnerBrand, updatePartnerBrand, deletePartnerBrand, setPartnerBrandLogo,
  getPartnerBrandBySlug, getActiveOffersByMerchant, getActiveOfferBySlug,
  upsertNewsItem, hasAutoNewsSince, getRecentNewsItems, getAllNewsItems, createManualNewsItem, updateNewsItem, deleteNewsItem,
  bulkAddCouponCodes, getCouponStatsForOffers, claimCouponCode, getMemberClaimedCodes,
  registerOfferInterest, getMemberWaitlistedOfferIds, popOfferWaitlist,
  createNotification, getUnreadNotifications, markNotificationRead,
  createVerificationDocument, getPendingVerificationDocuments, getVerificationDocumentsForMember,
  getVerificationDocument, reviewVerificationDocument, setWorkEmailToken, confirmWorkEmailToken,
  getDocumentsDueForPurge, markDocumentPurged,
  listForumPosts, getForumPost, createForumPost, createForumReply, removeForumItem,
  restoreForumItem, reportForumItem, clearForumReport, getForumModerationQueue,
  getPublishedGuides, getPublishedGuideBySlug, getAllGuides, saveGuide, deleteGuide,
  getTrackedLinkBySlug, recordLinkClick, getTrackedLinksWithStats, saveTrackedLink, deleteTrackedLink,
  getLinkClickReport, recordSiteEvent, getAnalytics, getOfferMembers,
};

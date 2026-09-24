require('dotenv').config();

const express   = require('express');
const helmet    = require('helmet');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const path      = require('path');
const fs        = require('fs');
const multer    = require('multer');
const jwt       = require('jsonwebtoken');
const RssParser = require('rss-parser');
const { Resend } = require('resend');
const {
  createMember, emailExists, findMemberByEmail,
  getMemberByNumber, getAllMembers,
  setResetToken, findMemberByResetToken, clearResetToken,
  resetMonthlyEntries, recordGiveawayWinner, getGiveawayHistory,
  getActiveOffers, getAllOffers, getFeaturedOffersForDashboard, getFeaturedOffersForPublic, getOfferById, createOffer, updateOffer, deleteOffer, incrementOfferClicks,
  recordOfferRedemption, getOffersAcceptedCount,
  getActiveAdverts, getAllAdverts, getAdvertById, createAdvert, updateAdvert, deleteAdvert, incrementAdvertClicks,
  getActivePartnerBrands, getAllPartnerBrands, createPartnerBrand, updatePartnerBrand, deletePartnerBrand,
  getPartnerBrandBySlug, getActiveOffersByMerchant, getActiveOfferBySlug,
  upsertNewsItem, getRecentNewsItems, getAllNewsItems, createManualNewsItem, updateNewsItem, deleteNewsItem,
  bulkAddCouponCodes, getCouponStatsForOffers, claimCouponCode, getMemberClaimedCodes,
  registerOfferInterest, getMemberWaitlistedOfferIds, popOfferWaitlist,
  createNotification, getUnreadNotifications, markNotificationRead,
  createVerificationDocument, getPendingVerificationDocuments, getVerificationDocumentsForMember,
  getVerificationDocument, reviewVerificationDocument, setWorkEmailToken, confirmWorkEmailToken,
  getDocumentsDueForPurge, markDocumentPurged,
  listForumPosts, getForumPost, createForumPost, createForumReply, removeForumItem,
  restoreForumItem, reportForumItem, clearForumReport, getForumModerationQueue,
} = require('./database');
const { uploadVerificationFile, uploadPublicFile, getSignedViewUrl, readLocalFile, deleteFile, UPLOADS_PERSISTENT, PUBLIC_ROOT } = require('./storage');
const { categories: JOB_ROLE_CATEGORIES, roleBySlug: JOB_ROLE_BY_SLUG, allRoles: ALL_JOB_ROLES } = require('./job-roles');
const { UK_TOWNS } = require('./uk-towns');
const { renderRolePage, renderRoleNotFound } = require('./templates/role-page');
const { renderBrandPage, renderBrandNotFound } = require('./templates/brand-page');
const { renderOfferPage, renderOfferNotFound } = require('./templates/offer-page');
const { renderNav } = require('./templates/nav');
// Shared header with the drawer footer switched to My Dashboard / Log out
// when the visitor has a member session.
function navFor(req, opts = {}) {
  return renderNav({ ...opts, loggedIn: !!(req.session && req.session.membershipNumber) });
}
const { renderFooter } = require('./templates/footer');
const { renderNewsCards, renderNewsItemListJsonLd } = require('./templates/news-feed');

const app    = express();
const PORT   = process.env.PORT || 3000;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} catch (e) { console.warn('Stripe not available:', e.message); }

const VALID_PROMOS = {
  FREE: { discountPct: 100, label: 'First year free', freeYear: true },
};

// Escapes user-supplied values before they're interpolated into HTML emails —
// these are rendered in a human's inbox (admin or member), not a browser, but
// most webmail clients still render arbitrary HTML/links, so unescaped input
// here is a phishing/tracking-pixel vector just like it would be on a page.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

const OFFER_CATEGORIES = [
  'Home & Garden', 'Fashion', 'Food & Drink', 'Business', 'Benefits',
  'Travel', 'Health & Beauty', 'Gifting', 'Motoring', 'E-learning',
  'Tech & Electronic', 'Days Out & Entertainment', 'Finance & Insurance', 'Sport & Fitness', 'Advice',
];

// ── Verification uploads ────────────────────────────────────────
const VERIFICATION_MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!VERIFICATION_MIME_EXT[file.mimetype]) return cb(new Error('Only JPG, PNG, WEBP or PDF files are allowed.'));
    cb(null, true);
  },
});
const VALID_DOC_TYPES = ['uniform', 'badge', 'payslip', 'work_email_screenshot', 'other'];

// ── Public image uploads (partner brand logos, etc.) ──────────────
const LOGO_MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!LOGO_MIME_EXT[file.mimetype]) return cb(new Error('Only JPG, PNG or WEBP images are allowed.'));
    cb(null, true);
  },
});

// Proof-of-employment files are deleted 20 days after an admin approves/rejects
// them — UK GDPR storage-limitation: no ongoing purpose to keep the document
// once the employment check has been decided. The decision itself (doc type,
// status, reviewed date, rejection reason) is kept as an audit trail.
const VERIFICATION_PURGE_DAYS = 20;

async function runVerificationPurge() {
  let due;
  try {
    due = await getDocumentsDueForPurge(VERIFICATION_PURGE_DAYS);
  } catch (err) {
    console.error('Verification purge sweep failed to query due documents:', err.message);
    return;
  }

  for (const doc of due) {
    try {
      await deleteFile(doc.fileKey);
      await markDocumentPurged(doc.id);
    } catch (err) {
      console.error(`Verification purge failed for document #${doc.id}:`, err.message);
    }
  }

  if (due.length) console.log(`[purge] Deleted ${due.length} verification document file(s) past the ${VERIFICATION_PURGE_DAYS}-day retention window.`);
}

// ── Logistics news feed ──────────────────────────────────────────
// Pulls headline + excerpt + a link back to the original article from a
// curated list of UK logistics/freight trade RSS feeds — deliberately
// never the full article body, both to respect each publisher's own
// content and because most RSS feeds only expose a summary anyway.
// Powers /logistics-news.html (under More). Verified working and on-topic
// as of 2026-09 — if a feed goes stale or 404s, it's skipped (logged),
// not fatal to the others.
const LOGISTICS_NEWS_FEEDS = [
  { url: 'https://theloadstar.com/feed/', source: 'The Loadstar' },
  { url: 'https://www.logisticsmanager.com/feed/', source: 'Logistics Manager' },
  { url: 'https://www.transportnews.co.uk/feed', source: 'Transport News' },
];
const rssParser = new RssParser({ timeout: 10000 });

// Some WordPress-based feeds put their own "The post X appeared first on
// Site Name." boilerplate where the excerpt should be, instead of real
// article text — strip that off rather than showing it as the summary.
function cleanNewsSummary(snippet) {
  if (!snippet) return null;
  const cleaned = snippet.replace(/\s*The post .*? appeared first on .*?\.\s*$/i, '').trim();
  return cleaned ? cleaned.slice(0, 400) : null;
}

async function fetchLogisticsNews() {
  let totalNew = 0;
  for (const feed of LOGISTICS_NEWS_FEEDS) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      for (const item of (parsed.items || []).slice(0, 15)) {
        if (!item.link || !item.title) continue;
        await upsertNewsItem({
          title: item.title,
          link: item.link,
          source: feed.source,
          summary: cleanNewsSummary(item.contentSnippet),
          publishedAt: item.isoDate || item.pubDate || null,
        });
        totalNew++;
      }
    } catch (err) {
      console.error(`[news] Failed to fetch ${feed.source} (${feed.url}):`, err.message);
    }
  }
  if (totalNew) console.log(`[news] Checked ${totalNew} article(s) across ${LOGISTICS_NEWS_FEEDS.length} feed(s) (duplicates skipped automatically).`);
}

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com',
  'hotmail.co.uk', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com',
  'proton.me', 'msn.com', 'mail.com', 'gmx.com',
]);

// Trust Railway's reverse proxy so rate limiters see real client IPs
app.set('trust proxy', 1);

// Remove Express fingerprint header
app.disable('x-powered-by');

// ── Welcome email to new member ────────────────────────────────
async function sendWelcomeEmail(member) {
  if (!resend) { console.log('Resend not configured — skipping welcome email'); return; }
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
      <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Your discount card for logistics workers</p>
    </div>
    <div style="padding:40px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 8px;font-size:22px">Welcome, ${member.firstName}! 👋</h2>
      <p style="color:#5f6d82;margin:0 0 32px;font-size:15px;line-height:1.6">Your Logicard membership is now active. Here are your membership details:</p>
      <div style="background:linear-gradient(135deg,#071d40,#0d3b80);border-radius:16px;padding:32px;text-align:center;margin-bottom:32px">
        <p style="color:rgba(255,255,255,0.6);margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Your Membership Number</p>
        <p style="color:#FFB300;margin:0;font-size:42px;font-weight:900;letter-spacing:2px">#${member.membershipNumber}</p>
        <p style="color:rgba(255,255,255,0.5);margin:12px 0 0;font-size:12px">Keep this number safe — use it to redeem all your discounts</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:32px">
        <tr style="background:#f0f2f7"><td style="padding:12px 16px;font-weight:700;color:#071d40;width:40%">Name</td><td style="padding:12px 16px;color:#333">${member.firstName} ${member.lastName}</td></tr>
        <tr><td style="padding:12px 16px;font-weight:700;color:#071d40">Email</td><td style="padding:12px 16px;color:#333">${member.email}</td></tr>
        <tr style="background:#f0f2f7"><td style="padding:12px 16px;font-weight:700;color:#071d40">Company</td><td style="padding:12px 16px;color:#333">${member.companyName}</td></tr>
        <tr><td style="padding:12px 16px;font-weight:700;color:#071d40">Member since</td><td style="padding:12px 16px;color:#333">${new Date(member.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}</td></tr>
      </table>
      <div style="background:#fff8e6;border:1px solid #FFB300;border-radius:10px;padding:20px 24px;margin-bottom:32px">
        <p style="margin:0 0 8px;font-weight:700;color:#071d40;font-size:15px">What's included in your membership:</p>
        <p style="margin:4px 0;color:#5f6d82;font-size:14px">✅ 150+ exclusive deals updated daily</p>
        <p style="margin:4px 0;color:#5f6d82;font-size:14px">✅ Fuel, hotels, dining, tech, fleet & more</p>
        <p style="margin:4px 0;color:#5f6d82;font-size:14px">✅ Savings redeemable with your membership number</p>
        <p style="margin:4px 0;color:#5f6d82;font-size:14px">✅ Membership: £10/year${member.freeYear ? ' — first year complimentary (promo code applied)' : ''}</p>
      </div>
      <div style="text-align:center">
        <a href="https://logicard.co.uk/login.html" style="background:#FFB300;color:#071d40;padding:16px 40px;text-decoration:none;border-radius:6px;font-weight:900;font-size:16px;display:inline-block">Browse Your Deals →</a>
      </div>
    </div>
    <div style="padding:28px 36px;text-align:center;background:#f0f2f7;border-top:1px solid #e2e6ee">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#071d40">Need help?</p>
      <p style="margin:0 0 16px;font-size:13px;color:#5f6d82">Visit <a href="https://logicard.co.uk" style="color:#FFB300;text-decoration:none;font-weight:700">logicard.co.uk</a> for support and FAQs.</p>
      <div style="border-top:1px solid #e2e6ee;margin:16px 0;padding-top:16px">
        <p style="margin:0;font-size:12px;color:#5f6d82">To make sure our emails reach your inbox, please add <strong>welcome@logicard.co.uk</strong> to your contacts.</p>
        <p style="margin:8px 0 0;font-size:11px;color:#aaa">© 2026 Logicard Ltd · Company number 17474646 · You received this because you registered at logicard.co.uk</p>
      </div>
    </div>
  </div>`;

  const text = `Welcome to Logicard, ${member.firstName}!

Your membership is now active.

Membership Number: #${member.membershipNumber}
Name: ${member.firstName} ${member.lastName}
Email: ${member.email}
Company: ${member.companyName || '—'}
Member since: ${new Date(member.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}

What's included:
- 150+ exclusive deals updated daily
- Fuel, hotels, dining, tech, fleet and more
- Savings redeemable with your membership number
- Membership: £10/year${member.freeYear ? ' (first year complimentary)' : ''}

Browse your deals: https://logicard.co.uk/login.html

To ensure our emails reach your inbox, please add welcome@logicard.co.uk to your contacts.

Need help? Email info@logicard.co.uk or visit logicard.co.uk

© 2026 Logicard Ltd · Company number 17474646 · You received this because you registered at logicard.co.uk`;

  try {
    await resend.emails.send({
      from:     'Logicard <welcome@logicard.co.uk>',
      to:       member.email,
      subject:  `Welcome to Logicard, ${member.firstName}! Your membership #${member.membershipNumber} is active`,
      reply_to: 'info@logicard.co.uk',
      html,
      text,
    });
    console.log(`Welcome email sent to ${member.email}`);
  } catch (err) {
    console.error('Welcome email failed:', err.message);
  }
}

// ── Verification emails ─────────────────────────────────────────
async function sendVerificationSubmittedAdminEmail(member, docType) {
  if (!resend || !process.env.ADMIN_EMAIL) return;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">New Verification Submitted</p>
    </div>
    <div style="padding:32px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 20px;font-size:18px">A member has submitted proof of employment</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Member</td><td style="padding:10px 14px;color:#333">${member.firstName} ${member.lastName}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Membership #</td><td style="padding:10px 14px;color:#1a6cc8;font-weight:700">#${member.membershipNumber}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Company</td><td style="padding:10px 14px;color:#333">${member.companyName || '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Document type</td><td style="padding:10px 14px;color:#333">${docType}</td></tr>
      </table>
      <div style="text-align:center;margin-top:28px">
        <a href="https://logicard.co.uk/admin/verifications" style="background:#FFB300;color:#071d40;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:900;font-size:15px;display:inline-block">Review in Admin Panel →</a>
      </div>
    </div>
  </div>`;
  try {
    await resend.emails.send({
      from:    'Logicard <welcome@logicard.co.uk>',
      to:      process.env.ADMIN_EMAIL,
      subject: `New verification from member #${member.membershipNumber} — ${member.firstName} ${member.lastName}`,
      html,
    });
  } catch (err) {
    console.error('Verification submitted admin email failed:', err.message);
  }
}

async function sendVerificationApprovedEmail(member) {
  if (!resend) return;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
      <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">You're verified!</p>
    </div>
    <div style="padding:40px 36px;background:#fff;text-align:center">
      <h2 style="color:#071d40;margin:0 0 12px;font-size:22px">Welcome to the closed group, ${member.firstName}! 🎉</h2>
      <p style="color:#5f6d82;margin:0 0 28px;font-size:15px;line-height:1.6">Your proof of employment has been verified. Your full member offers are unlocked — log in to start saving.</p>
      <a href="https://logicard.co.uk/member-offers" style="background:#FFB300;color:#071d40;padding:16px 40px;text-decoration:none;border-radius:6px;font-weight:900;font-size:16px;display:inline-block">Browse Your Deals →</a>
    </div>
  </div>`;
  try {
    await resend.emails.send({
      from:     'Logicard <welcome@logicard.co.uk>',
      to:       member.email,
      subject:  'You’re verified — your Logicard offers are unlocked',
      reply_to: 'info@logicard.co.uk',
      html,
    });
  } catch (err) {
    console.error('Verification approved email failed:', err.message);
  }
}

async function sendVerificationRejectedEmail(member, reason) {
  if (!resend) return;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
      <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Verification update</p>
    </div>
    <div style="padding:40px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 12px;font-size:20px">We couldn't verify your submission</h2>
      <p style="color:#5f6d82;margin:0 0 20px;font-size:15px;line-height:1.6">Hi ${member.firstName}, we weren't able to approve the proof you submitted for your Logicard membership.</p>
      ${reason ? `<div style="background:#fff8e6;border:1px solid #FFB300;border-radius:10px;padding:16px 20px;margin-bottom:24px;color:#071d40;font-size:14px">${reason}</div>` : ''}
      <p style="color:#5f6d82;margin:0 0 28px;font-size:14px;line-height:1.6">You can submit a new document or your work email address any time — just log in and head to the verification page.</p>
      <div style="text-align:center">
        <a href="https://logicard.co.uk/verify" style="background:#FFB300;color:#071d40;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:900;font-size:15px;display:inline-block">Resubmit Proof →</a>
      </div>
    </div>
  </div>`;
  try {
    await resend.emails.send({
      from:     'Logicard <welcome@logicard.co.uk>',
      to:       member.email,
      subject:  'Your Logicard verification needs another look',
      reply_to: 'info@logicard.co.uk',
      html,
    });
  } catch (err) {
    console.error('Verification rejected email failed:', err.message);
  }
}

async function sendWorkEmailConfirmation(member, workEmail, confirmLink) {
  if (!resend) { console.log(`[DEV] Work-email confirm link for #${member.membershipNumber}: ${confirmLink}`); return; }
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
      <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Confirm your work email</p>
    </div>
    <div style="padding:40px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 8px;font-size:20px">One click to verify, ${member.firstName}</h2>
      <p style="color:#5f6d82;margin:0 0 28px;font-size:15px;line-height:1.6">Click below to confirm <strong>${workEmail}</strong> is your work email address. Your Logicard account will be verified instantly.</p>
      <div style="text-align:center;margin-bottom:28px">
        <a href="${confirmLink}" style="background:#FFB300;color:#071d40;padding:16px 40px;text-decoration:none;border-radius:6px;font-weight:900;font-size:16px;display:inline-block">Confirm My Work Email →</a>
      </div>
      <p style="color:#aaa;font-size:12px;margin:0">This link expires in 24 hours. If you didn't request this, you can ignore this email.</p>
    </div>
  </div>`;
  try {
    await resend.emails.send({
      from:    'Logicard <accounts@logicard.co.uk>',
      to:      workEmail,
      subject: 'Confirm your work email for Logicard',
      html,
    });
  } catch (err) {
    console.error('Work-email confirmation send failed:', err.message);
  }
}

async function sendOfferRestockEmail(member, offer) {
  if (!resend) return;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
      <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Back in stock</p>
    </div>
    <div style="padding:40px 36px;background:#fff;text-align:center">
      <h2 style="color:#071d40;margin:0 0 12px;font-size:22px">${member.firstName}, more codes just landed 🎉</h2>
      <p style="color:#5f6d82;margin:0 0 28px;font-size:15px;line-height:1.6">You asked to be notified — <strong>${offer.merchantName}</strong> just added more unique codes for "${offer.title}". They tend to go quickly, so grab yours soon.</p>
      <a href="https://logicard.co.uk/member-offers" style="background:#FFB300;color:#071d40;padding:16px 40px;text-decoration:none;border-radius:6px;font-weight:900;font-size:16px;display:inline-block">Claim Your Code →</a>
    </div>
  </div>`;
  try {
    await resend.emails.send({
      from:     'Logicard <welcome@logicard.co.uk>',
      to:       member.email,
      subject:  `Back in stock: ${offer.merchantName} codes are available again`,
      reply_to: 'info@logicard.co.uk',
      html,
    });
  } catch (err) {
    console.error('Restock email failed:', err.message);
  }
}

async function notifyOfferRestock(offer, membershipNumbers) {
  for (const num of membershipNumbers) {
    try {
      const member = await getMemberByNumber(num);
      if (!member) continue;
      await createNotification({
        membershipNumber: num,
        title: `${offer.merchantName} codes are back!`,
        body:  `More unique codes were just added for "${offer.title}" — grab yours before they're gone again.`,
        linkUrl: '/member-offers',
      });
      await sendOfferRestockEmail(member, offer);
    } catch (err) {
      console.error(`Restock notify failed for member #${num}:`, err.message);
    }
  }
}

// ── Startup check: does the Resend API key actually work? ────────
const SENDING_DOMAIN = 'logicard.co.uk';

async function verifyResendConnection() {
  if (!resend) {
    console.warn('  > RESEND_API_KEY not set — emails disabled.');
    return;
  }
  try {
    const { data, error } = await resend.domains.list();
    if (error) {
      console.error(`  > RESEND_API_KEY is set but Resend rejected it (${error.name}: ${error.message}) — no emails will send.`);
      return;
    }
    const domain = (data?.data || []).find(d => d.name === SENDING_DOMAIN);
    if (!domain) {
      console.warn(`  > Resend connected, but no "${SENDING_DOMAIN}" domain found on this account — emails from @${SENDING_DOMAIN} addresses will fail.`);
    } else if (domain.status !== 'verified') {
      console.warn(`  > Resend domain ${SENDING_DOMAIN} is present but status is "${domain.status}" (not verified) — emails may fail or land in spam.`);
    } else {
      console.log(`  > Resend connected — ${SENDING_DOMAIN} is verified, emails will send.`);
    }
  } catch (err) {
    console.error('  > Resend connection check failed:', err.message);
  }
}

// ── Rate limiters ──────────────────────────────────────────────
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please try again in an hour.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const mobileLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts from this address. Please try again in an hour.' },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please wait an hour and try again.' },
});

const verificationUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload attempts. Please try again in an hour.' },
});

const editDetailsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many edit requests. Please wait an hour and try again.' },
});

const workEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification emails requested. Please wait an hour and try again.' },
});

// ── Middleware ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // disabled — site uses inline scripts/styles
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '50kb' }));
app.use(session({
  store: new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'logicard-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: !!process.env.DATABASE_URL, // true on Railway (HTTPS), false locally
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// ── Maintenance mode (set MAINTENANCE_PASSWORD in Railway to lock the site) ──
app.use((req, res, next) => {
  const pw = process.env.MAINTENANCE_PASSWORD;
  if (!pw) return next(); // no env var = site is fully public

  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Basic ')) {
    const decoded  = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const password = decoded.split(':').slice(1).join(':');
    if (password === pw) return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Logicard"');
  res.status(401).send('Logicard is currently under maintenance. Please check back soon.');
});

// ── Job roles (shared source for signup picker + eligibility page) ──
app.get('/api/job-roles', (_req, res) => res.json({ categories: JOB_ROLE_CATEGORIES }));

// ── UK towns (autocomplete suggestion source, not an enforced allowlist) ──
app.get('/api/uk-towns', (_req, res) => res.json({ towns: UK_TOWNS }));

// ── Per-role SEO landing pages ───────────────────────────────────
app.get('/logistics-rewards/:slug', (req, res) => {
  const entry = JOB_ROLE_BY_SLUG[req.params.slug];
  if (!entry) return res.status(404).send(renderRoleNotFound().replace('<!-- SHARED_NAV -->', navFor(req, {})));
  res.send(renderRolePage(entry).replace('<!-- SHARED_NAV -->', navFor(req, {})));
});

// ── Partner brand pages — reached by clicking a logo on Partnerships ──
app.get('/deals/:slug', async (req, res) => {
  try {
    const brand = await getPartnerBrandBySlug(req.params.slug);
    if (!brand) return res.status(404).send(renderBrandNotFound().replace('<!-- SHARED_NAV -->', navFor(req, {})));

    const offers = await getActiveOffersByMerchant(brand.brandName);
    const publicOffers = offers.map(({ id, title, category, discountText }) => ({ id, title, category, discountText }));
    res.send(renderBrandPage({ brand, offers: publicOffers }).replace('<!-- SHARED_NAV -->', navFor(req, {})));
  } catch (err) {
    console.error('Brand page error:', err.message);
    res.status(500).send('Something went wrong loading this page. Please try again.');
  }
});

// ── Dynamic sitemap (static pages + one URL per job role) ────────
const STATIC_SITEMAP_PAGES = [
  { path: '/',                            changefreq: 'weekly',  priority: '1.0' },
  { path: '/signup.html',                 changefreq: 'monthly', priority: '0.9' },
  { path: '/qualify.html',                changefreq: 'monthly', priority: '0.8' },
  { path: '/about.html',                  changefreq: 'monthly', priority: '0.7' },
  { path: '/how-it-works.html',           changefreq: 'monthly', priority: '0.6' },
  { path: '/our-story.html',              changefreq: 'monthly', priority: '0.6' },
  { path: '/faqs.html',                   changefreq: 'monthly', priority: '0.6' },
  { path: '/partnerships.html',           changefreq: 'monthly', priority: '0.7' },
  { path: '/partner',                     changefreq: 'monthly', priority: '0.6' },
  { path: '/categories.html',             changefreq: 'monthly', priority: '0.7' },
  { path: '/beauty-wellness.html',        changefreq: 'monthly', priority: '0.6' },
  { path: '/children-baby.html',          changefreq: 'monthly', priority: '0.6' },
  { path: '/food-drink.html',             changefreq: 'monthly', priority: '0.6' },
  { path: '/fashion.html',                changefreq: 'monthly', priority: '0.6' },
  { path: '/gifts-flowers.html',          changefreq: 'monthly', priority: '0.6' },
  { path: '/trade-supplies-tools.html',   changefreq: 'monthly', priority: '0.6' },
  { path: '/vehicles-motoring.html',      changefreq: 'monthly', priority: '0.6' },
  { path: '/technology-office.html',      changefreq: 'monthly', priority: '0.6' },
  { path: '/home-garden.html',            changefreq: 'monthly', priority: '0.6' },
  { path: '/family-leisure-travel.html',  changefreq: 'monthly', priority: '0.6' },
  { path: '/utilities-mobile.html',       changefreq: 'monthly', priority: '0.6' },
  { path: '/pets.html',                   changefreq: 'monthly', priority: '0.6' },
  { path: '/sport-fitness.html',          changefreq: 'monthly', priority: '0.6' },
  { path: '/logistics-news.html',         changefreq: 'weekly',  priority: '0.6' },
  { path: '/events-experiences.html',     changefreq: 'monthly', priority: '0.6' },
  { path: '/things-to-do.html',           changefreq: 'monthly', priority: '0.6' },
  { path: '/financial-wellbeing.html',    changefreq: 'monthly', priority: '0.6' },
  { path: '/mental-wellbeing.html',       changefreq: 'monthly', priority: '0.6' },
  { path: '/shopping-cards.html',         changefreq: 'monthly', priority: '0.6' },
  { path: '/e-learning.html',             changefreq: 'monthly', priority: '0.6' },
  { path: '/workforce-recognition.html',  changefreq: 'monthly', priority: '0.7' },
  { path: '/deals.html',                  changefreq: 'monthly', priority: '0.7' },
  { path: '/brands/initial',              changefreq: 'weekly',  priority: '0.7' },
  { path: '/login.html',                  changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy.html',                changefreq: 'yearly',  priority: '0.3' },
  { path: '/t&cs',                        changefreq: 'yearly',  priority: '0.3' },
];

app.get('/sitemap.xml', async (_req, res) => {
  const roleUrls = Object.keys(JOB_ROLE_BY_SLUG).map(slug => `  <url><loc>https://logicard.co.uk/logistics-rewards/${slug}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`);
  const staticUrls = STATIC_SITEMAP_PAGES.map(p => `  <url><loc>https://logicard.co.uk${p.path.replace(/&/g, '&amp;')}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`);

  let brandUrls = [];
  try {
    const brands = await getActivePartnerBrands();
    brandUrls = brands.filter(b => b.slug).map(b => `  <url><loc>https://logicard.co.uk/deals/${b.slug}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`);
  } catch (err) {
    console.error('Sitemap: failed to load partner brands:', err.message);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...roleUrls, ...brandUrls].join('\n')}\n</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/t&cs', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// ── Shared nav injection (see templates/nav.js) ───────────────────
const NAV_OPTIONS_BY_PAGE = {
  '/index.html':               { active: 'home' },
  '/':                         { active: 'home' },
  '/checkout.html':            {},
  '/categories.html':          { tagline: true, active: 'categories' },
  '/qualify.html':             { tagline: true, active: 'qualify' },
  '/things-to-do.html':        { active: 'things-to-do' },
  '/shopping-cards.html':      { active: 'shopping-cards' },
  '/e-learning.html':          { active: 'e-learning' },
  '/financial-wellbeing.html': { active: 'financial-wellbeing' },
  '/mental-wellbeing.html':    { active: 'mental-wellbeing' },
  '/beauty-wellness.html':     { activeDropdown: 'beauty-wellness' },
  '/children-baby.html':       { activeDropdown: 'children-baby' },
  '/food-drink.html':          { activeDropdown: 'food-drink' },
  '/fashion.html':             { activeDropdown: 'fashion' },
  '/gifts-flowers.html':       { activeDropdown: 'gifts-flowers' },
  '/trade-supplies-tools.html':   { activeDropdown: 'trade-supplies-tools' },
  '/vehicles-motoring.html':      { activeDropdown: 'vehicles-motoring' },
  '/technology-office.html':      { activeDropdown: 'technology-office' },
  '/home-garden.html':            { activeDropdown: 'home-garden' },
  '/family-leisure-travel.html':  { activeDropdown: 'family-leisure-travel' },
  '/utilities-mobile.html':       { activeDropdown: 'utilities-mobile' },
  '/pets.html':                   {},
  '/sport-fitness.html':          {},
  '/events-experiences.html':     { activeDropdown: 'events-experiences' },
  '/login.html':                {},
  '/signup.html':               {},
  '/forgot-password.html':      {},
  '/reset-password.html':       {},
  '/deals.html':                {},
  '/privacy.html':              {},
  '/terms.html':                {},
  '/workforce-recognition.html': {},
  '/about.html':                 { active: 'about' },
  '/how-it-works.html':          { active: 'how-it-works' },
  '/our-story.html':             { active: 'our-story' },
  '/faqs.html':                  { active: 'faqs' },
  '/partnerships.html':          { active: 'partnerships' },
};

// ── Logistics News page — server-rendered (see templates/news-feed.js) ──
// Registered ahead of the bulk NAV_OPTIONS_BY_PAGE route (and deliberately
// not one of its entries) because this one needs an async DB read: cards
// are rendered into the HTML on every request instead of being fetched
// client-side, so the page has real, crawlable content and each story
// links to a relevant Logicard discount page, not just its source.
app.get('/logistics-news.html', async (req, res) => {
  try {
    const items = await getRecentNewsItems(30);
    const html = fs.readFileSync(path.join(__dirname, 'public', 'logistics-news.html'), 'utf8');
    const out = html
      .replace('<!-- SHARED_NAV -->', navFor(req, { active: 'logistics-news' }))
      .replace('<!-- SHARED_FOOTER -->', renderFooter())
      .replace('<!-- NEWS_LIST -->', renderNewsCards(items))
      .replace('<!-- NEWS_JSONLD -->', renderNewsItemListJsonLd(items));
    res.type('html').send(out);
  } catch (err) {
    console.error('Logistics news page error:', err.message);
    res.status(500).send('Something went wrong loading the news page. Please try again shortly.');
  }
});

app.get(Object.keys(NAV_OPTIONS_BY_PAGE), (req, res) => {
  const file = req.path === '/' ? 'index.html' : req.path.slice(1);
  const html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  // .replace() on a marker the page doesn't have is a harmless no-op, so
  // pages that haven't adopted <!-- SHARED_FOOTER --> yet (the narrow
  // auth-flow pages: login/signup/forgot/reset-password) are unaffected.
  const out = html
    .replace('<!-- SHARED_NAV -->', navFor(req, NAV_OPTIONS_BY_PAGE[req.path]))
    .replace('<!-- SHARED_FOOTER -->', renderFooter());
  res.type('html').send(out);
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Always revalidate CSS/JS with the server (fast 304s when unchanged)
    // instead of letting the browser or Cloudflare's edge serve a stale
    // cached copy after a deploy changes them.
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Serves uploadPublicFile's local-disk fallback (reachable whenever R2
// isn't configured). This is a real, permanent public URL as long as
// PUBLIC_ROOT sits on a Railway Volume (UPLOADS_DIR set) — otherwise it's
// only for local testing, since it won't survive a Railway redeploy.
app.use('/local-uploads', express.static(PUBLIC_ROOT));

function requireAuth(req, res, next) {
  if (req.session && req.session.membershipNumber) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login.html');
}

// Gates the closed-group offers specifically — members can still log in and
// see their account while their proof of employment is pending review.
async function requireVerified(req, res, next) {
  const member = await getMemberByNumber(req.session.membershipNumber);
  if (member && member.verified) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'pending_verification' });
  res.redirect('/verify');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Admin access required' });
  res.redirect('/admin-login.html');
}

// ── Mobile auth (JWT, separate from the web session/cookie auth above) ──
// The React Native app has no cookie jar shared with the web, so it
// authenticates with a bearer token instead. This intentionally does not
// touch req.session at all — it's a parallel path that reuses the same
// bcrypt password check and DB helpers, keyed by membershipNumber like
// everywhere else. See SECURITY.md: session/cookie config is locked, so
// mobile auth lives entirely alongside it, not inside it.
const JWT_SECRET = process.env.JWT_SECRET || 'logicard-dev-jwt-secret';
const MOBILE_TOKEN_EXPIRY = '30d';

function requireMobileAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.membershipNumber = payload.sub;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

async function requireMobileVerified(req, res, next) {
  const member = await getMemberByNumber(req.membershipNumber);
  if (member && member.verified) return next();
  res.status(403).json({ error: 'pending_verification' });
}

// ── Member pages ───────────────────────────────────────────────
// Member views get the same shared gold header + drawer as public pages,
// injected at <!-- SHARED_NAV --> (their own member toolbar sits below it).
function sendView(req, res, file, navOpts = {}) {
  const html = fs.readFileSync(path.join(__dirname, 'views', file), 'utf8');
  res.type('html').send(html.replace('<!-- SHARED_NAV -->', navFor(req, navOpts)));
}

app.get('/member-offers', requireAuth, (req, res) => {
  sendView(req, res, 'member-offers.html');
});

app.get('/member-dashboard', requireAuth, (req, res) => {
  sendView(req, res, 'member-dashboard.html');
});

// Old URL, kept as a redirect so nothing already bookmarked/emailed breaks.
app.get('/members', requireAuth, (_req, res) => res.redirect('/member-offers'));

// "Business Services" was renamed to "Utilities & Mobile" shortly after launch.
app.get('/business-services.html', (_req, res) => res.redirect(301, '/utilities-mobile.html'));

// Dedicated "apply to partner" landing page — clean URL, not in
// NAV_OPTIONS_BY_PAGE (that mechanism assumes path === filename, and the
// file on disk is partner.html). This is what partnerships.html's hero
// "Become a Partner" button links to.
app.get('/partner', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'partner.html'), 'utf8');
  const out = html
    .replace('<!-- SHARED_NAV -->', navFor(req, { active: 'partnerships' }))
    .replace('<!-- SHARED_FOOTER -->', renderFooter());
  res.type('html').send(out);
});

// Age-restricted section — clean URL (no .html), not in NAV_OPTIONS_BY_PAGE
// (that mechanism assumes path === filename) and deliberately excluded from
// the sitemap/main nav so it's only reached via the explicit "Adult" link,
// never crawled or casually stumbled into. See SECURITY.md-style note
// inside adult.html itself: the age gate there is a scaffold, not a
// compliant age-verification method — do not add real explicit content or
// real gambling affiliate links until that's replaced with a real
// third-party verification provider and gambling-advertising compliance
// has been checked.
app.get('/adult', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'adult.html'), 'utf8');
  const out = html
    .replace('<!-- SHARED_NAV -->', navFor(req, {}))
    .replace('<!-- SHARED_FOOTER -->', renderFooter());
  res.type('html').send(out);
});

app.get('/api/offer-categories', requireAuth, (_req, res) => res.json(OFFER_CATEGORIES));

app.get('/report', requireAuth, (req, res) => {
  sendView(req, res, 'report.html');
});

app.get('/edit-details', requireAuth, (req, res) => {
  sendView(req, res, 'edit-details.html');
});

// Public SEO page — deliberately not behind requireAuth, since the whole
// point is to be crawlable/indexable by search engines.
app.get('/brands/initial', (req, res) => {
  sendView(req, res, 'brands-initial.html');
});

app.get('/verify', requireAuth, (req, res) => {
  sendView(req, res, 'verify.html');
});

// ── Members Forum pages ─────────────────────────────────────────
// Logged-in members only (requireAuth redirects to /login.html). Posting
// additionally needs a verified member — enforced on the API, not here, so
// unverified members can still read.
app.get('/forum', requireAuth, (req, res) => {
  sendView(req, res, 'forum.html', { active: 'forum' });
});

app.get('/forum/:id', requireAuth, (req, res, next) => {
  if (!/^\d{1,9}$/.test(req.params.id)) return next();
  sendView(req, res, 'forum-post.html', { active: 'forum' });
});

// ── Admin pages ────────────────────────────────────────────────
app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

app.get('/admin/offers', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-offers.html'));
});

app.get('/admin/adverts', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-adverts.html'));
});

app.get('/admin/partner-brands', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-partner-brands.html'));
});

app.get('/admin/verifications', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-verifications.html'));
});

app.get('/admin/forum', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-forum.html'));
});

app.get('/admin/news', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-news.html'));
});

// ── Member auth ────────────────────────────────────────────────
app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const member = await findMemberByEmail(email);
  if (!member || !member.passwordHash) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!bcrypt.compareSync(password, member.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });

  req.session.membershipNumber = member.membershipNumber;
  req.session.firstName        = member.firstName;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', requireAuth, async (req, res) => {
  const member = await getMemberByNumber(req.session.membershipNumber);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const offersAccepted = await getOffersAcceptedCount(member.membershipNumber);
  res.json({
    membershipNumber: member.membershipNumber,
    firstName:        member.firstName,
    lastName:         member.lastName,
    email:            member.email,
    phone:            member.phone,
    companyName:      member.companyName,
    role:             member.role,
    city:             member.city,
    createdAt:        member.createdAt,
    totalReferrals:   member.totalReferrals  || 0,
    monthlyEntries:   member.monthlyEntries  || 0,
    offersAccepted,
    verified:            member.verified,
    verificationStatus:  member.verificationStatus,
    verificationMethod:  member.verificationMethod,
    rejectionReason:     member.rejectionReason,
    workEmail:            member.workEmail,
  });
});

// ── In-app notifications ─────────────────────────────────────────
app.get('/api/notifications', requireAuth, async (req, res) => {
  res.json(await getUnreadNotifications(req.session.membershipNumber));
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid notification id.' });
  await markNotificationRead(id, req.session.membershipNumber);
  res.json({ success: true });
});

// ── Admin auth ─────────────────────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts. Access locked for 15 minutes.' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code attempts. Please log in again.' },
});

app.post('/api/admin/login', adminLimiter, async (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) return res.status(503).json({ error: 'Admin access is not configured.' });
  if (!password || password !== adminPass) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }

  // Generate cryptographically secure 6-digit OTP
  const otp    = crypto.randomInt(100000, 999999).toString();
  const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
  req.session.pendingAdminOtp       = otp;
  req.session.pendingAdminOtpExpiry = expiry;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0f1e;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d,#071d40);padding:32px;text-align:center;border-bottom:1px solid rgba(255,179,0,0.2)">
      <h1 style="color:#FFB300;margin:0;font-size:28px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.5);margin:6px 0 0;font-size:13px">Admin Verification</p>
    </div>
    <div style="padding:40px 36px;text-align:center">
      <p style="color:rgba(255,255,255,0.7);font-size:15px;margin:0 0 28px;line-height:1.6">Someone just entered the correct admin password for Logicard. Use the code below to complete sign in.</p>
      <div style="background:rgba(255,179,0,0.08);border:2px solid rgba(255,179,0,0.4);border-radius:12px;padding:28px;margin-bottom:28px">
        <p style="color:rgba(255,255,255,0.5);margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:2px">Your verification code</p>
        <p style="color:#FFB300;margin:0;font-size:48px;font-weight:900;letter-spacing:8px">${otp}</p>
        <p style="color:rgba(255,255,255,0.4);margin:12px 0 0;font-size:12px">Expires in 10 minutes</p>
      </div>
      <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;line-height:1.6">If you did not attempt to sign in to the admin panel, your password may be compromised — change it in Railway immediately.</p>
    </div>
    <div style="padding:16px;text-align:center;border-top:1px solid rgba(255,255,255,0.06)">
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25)">© 2026 Logicard — automated security code</p>
    </div>
  </div>`;

  try {
    if (resend) {
      await resend.emails.send({
        from:    'Logicard <accounts@logicard.co.uk>',
        to:      process.env.ADMIN_EMAIL,
        subject: `${otp} — Logicard admin verification code`,
        html,
      });
    } else {
      console.log(`[DEV] Admin OTP: ${otp}`);
    }
  } catch (err) {
    console.error('Admin OTP email failed:', err.message);
  }

  res.json({ success: true, pending: true });
});

app.post('/api/admin/verify-otp', otpLimiter, (req, res) => {
  const { code } = req.body;
  const { pendingAdminOtp, pendingAdminOtpExpiry } = req.session;

  if (!pendingAdminOtp) return res.status(400).json({ error: 'No pending verification. Please log in again.' });
  if (Date.now() > pendingAdminOtpExpiry) {
    delete req.session.pendingAdminOtp;
    delete req.session.pendingAdminOtpExpiry;
    return res.status(400).json({ error: 'Code expired. Please log in again.' });
  }
  if (!code || code.trim() !== pendingAdminOtp) return res.status(401).json({ error: 'Incorrect code. Please try again.' });

  delete req.session.pendingAdminOtp;
  delete req.session.pendingAdminOtpExpiry;
  req.session.isAdmin = true;
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Admin API ──────────────────────────────────────────────────
app.get('/api/admin/members', requireAdmin, async (_req, res) => {
  const members = (await getAllMembers()).map(({ passwordHash, resetToken, resetTokenExpiry, workEmailToken, workEmailTokenExpiry, ...safe }) => safe);
  res.json(members);
});

// ── Admin offers ───────────────────────────────────────────────
const GENDER_VALUES = ['M', 'F', 'Other'];
// Every offer added before this field existed was sourced through AWIN
// (backfilled in database.js's initDb) — keep it a fixed list rather than
// free text so sorting/filtering in Manage Offers stays reliable ("Awin"
// vs "AWIN" vs "awin" would otherwise split into three groups).
const OFFER_PLATFORMS = ['AWIN', 'Rakuten Advertising', 'Impact', 'Partnerize', 'CJ Affiliate', 'TradeDoubler', 'Direct', 'Other'];

const REDEEM_TYPES = ['code', 'unique', 'link', 'instore'];

// Offers whose end date has passed drop out of every public list.
function offerLive(o) {
  return !o.endDate || o.endDate >= new Date().toISOString().slice(0, 10);
}

function validOfferPayload(body) {
  const { merchantName, title, affiliateUrl, category, targetGender, platform, slug } = body;
  if (!merchantName || !String(merchantName).trim()) return 'Merchant name is required.';
  if (!title || !String(title).trim()) return 'Title is required.';
  if (!affiliateUrl || !/^https?:\/\//i.test(affiliateUrl)) return 'Affiliate URL must start with http:// or https://.';
  if (category && !OFFER_CATEGORIES.includes(category)) return 'Invalid category.';
  if (targetGender && !GENDER_VALUES.includes(targetGender)) return 'Invalid target gender.';
  if (platform && !OFFER_PLATFORMS.includes(platform)) return 'Invalid platform.';
  if (slug && !/^[a-z0-9-]+$/.test(slug)) return 'Page URL slug can only contain lowercase letters, numbers and hyphens.';
  if (body.logoUrl && !/^(https:\/\/|\/local-uploads\/)/i.test(body.logoUrl)) return 'Brand logo must be an https:// link or an uploaded file.';
  // Everything the public brand page (logicard.co.uk/<slug>) needs.
  const need = (v) => v && String(v).trim();
  if (!category) return 'Please choose a category for the brand page.';
  if (!need(body.discountText)) return 'Offer headline is required (e.g. 20% off everything).';
  if (!need(body.description)) return 'Please describe the deal.';
  if (!need(body.aboutBrand)) return 'Please add a short "About the brand" paragraph.';
  if (!need(body.imageUrl)) return 'A deal image is required.';
  if (!/^(https:\/\/|\/local-uploads\/)/i.test(body.imageUrl)) return 'Deal image must be an https:// link or an uploaded file.';
  if (!need(body.logoUrl)) return 'A brand logo is required.';
  if (!REDEEM_TYPES.includes(body.redeemType)) return 'Please choose how members redeem this offer.';
  if (body.redeemType === 'code' && !need(body.voucherCode)) return 'Enter the discount code (or choose a different redemption type).';
  if (body.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) return 'End date must be a valid date.';
  for (const [k, max] of [['aboutBrand', 1500], ['howToRedeem', 1500], ['terms', 3000], ['description', 2000]]) {
    if (body[k] && String(body[k]).length > max) return `That text is too long (max ${max} characters).`;
  }
  return null;
}

app.get('/api/admin/offers', requireAdmin, async (_req, res) => {
  const offers = await getAllOffers();
  const statsMap = await getCouponStatsForOffers(offers.map(o => o.id));
  res.json(offers.map(o => ({
    ...o,
    codesAvailable: statsMap[o.id] ? statsMap[o.id].available : null,
    codesTotal:     statsMap[o.id] ? statsMap[o.id].total : null,
  })));
});

app.post('/api/admin/offers/:id/codes', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer id.' });
  const offer = await getOfferById(id);
  if (!offer) return res.status(404).json({ error: 'Offer not found.' });

  const codes = String(req.body.codes || '').split(/\r?\n/).map(c => c.trim()).filter(Boolean);
  if (!codes.length) return res.status(400).json({ error: 'Paste at least one code, one per line.' });
  if (codes.length > 20000) return res.status(400).json({ error: 'Too many codes in one batch (max 20,000 — split into smaller batches).' });

  const result = await bulkAddCouponCodes(id, codes);

  let notified = 0;
  if (result.inserted > 0) {
    const waitingMembers = await popOfferWaitlist(id);
    notified = waitingMembers.length;
    if (notified) notifyOfferRestock(offer, waitingMembers); // fire-and-forget — don't block the admin response on N emails
  }

  res.json({ success: true, inserted: result.inserted, skipped: result.skipped, notified });
});

app.post('/api/admin/offers', requireAdmin, async (req, res) => {
  const error = validOfferPayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const offer = await createOffer(req.body);
    res.json(offer);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That page URL slug is already in use by another offer — try adding "-2" or similar.' });
    console.error('Create offer error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.put('/api/admin/offers/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer id.' });
  const error = validOfferPayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const offer = await updateOffer(id, req.body);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    res.json(offer);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That page URL slug is already in use by another offer — try adding "-2" or similar.' });
    console.error('Update offer error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.delete('/api/admin/offers/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer id.' });
  const deleted = await deleteOffer(id);
  if (!deleted) return res.status(404).json({ error: 'Offer not found.' });
  res.json({ success: true });
});

// ── Adverts (member-dashboard promo tiles) ────────────────────────
function validAdvertPayload(body) {
  const { title, imageUrl, linkUrl } = body;
  if (!title || !String(title).trim()) return 'Title is required.';
  if (!imageUrl || !String(imageUrl).trim()) return 'Image URL is required.';
  if (linkUrl && !/^https?:\/\//i.test(linkUrl)) return 'Link URL must start with http:// or https://.';
  return null;
}

app.get('/api/admin/adverts', requireAdmin, async (_req, res) => {
  res.json(await getAllAdverts());
});

app.post('/api/admin/adverts', requireAdmin, async (req, res) => {
  const error = validAdvertPayload(req.body);
  if (error) return res.status(400).json({ error });
  const advert = await createAdvert(req.body);
  res.json(advert);
});

app.put('/api/admin/adverts/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid advert id.' });
  const error = validAdvertPayload(req.body);
  if (error) return res.status(400).json({ error });
  const advert = await updateAdvert(id, req.body);
  if (!advert) return res.status(404).json({ error: 'Advert not found.' });
  res.json(advert);
});

app.delete('/api/admin/adverts/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid advert id.' });
  const deleted = await deleteAdvert(id);
  if (!deleted) return res.status(404).json({ error: 'Advert not found.' });
  res.json({ success: true });
});

// ── Manage News (Logistics News feed) ─────────────────────────────
// Most sources here are auto-pulled from RSS (see LOGISTICS_NEWS_FEEDS
// above) and need no admin action. This is for the sources that were
// requested but don't have a usable feed to automate — checked directly as
// of Sep 2026: Logistics UK's feeds exist but return 0 items and their
// press-releases page has no RSS auto-discovery tag; FleetNews returns 410
// Gone (feed deliberately discontinued by them, so not worth working
// around); Motor Transport has no discoverable feed at all. Add those
// stories here by hand, crediting whichever outlet actually published them.
function validNewsItemPayload(body) {
  const { title, link, source } = body;
  if (!title || !String(title).trim()) return 'Title is required.';
  if (!link || !/^https:\/\//i.test(String(link).trim())) return 'Link must be a full https:// URL.';
  if (!source || !String(source).trim()) return 'Source is required.';
  return null;
}

app.get('/api/admin/news-items', requireAdmin, async (_req, res) => {
  res.json(await getAllNewsItems());
});

app.post('/api/admin/news-items', requireAdmin, async (req, res) => {
  const error = validNewsItemPayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const item = await createManualNewsItem(req.body);
    res.json(item);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A news item with that link already exists.' });
    console.error('Create news item error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.put('/api/admin/news-items/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid news item id.' });
  const error = validNewsItemPayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const item = await updateNewsItem(id, req.body);
    if (!item) return res.status(404).json({ error: 'News item not found.' });
    res.json(item);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A news item with that link already exists.' });
    console.error('Update news item error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.delete('/api/admin/news-items/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid news item id.' });
  const deleted = await deleteNewsItem(id);
  if (!deleted) return res.status(404).json({ error: 'News item not found.' });
  res.json({ success: true });
});

// ── Partner brands (Partnerships page "Our Partners" grid) ───────
// Deliberately lighter than an offer — just a name and a logo, no deal
// fields required. Use this to show a brand is a confirmed partner before
// there's a live discount to attach; add a proper offer once there is one.
function validPartnerBrandPayload(body) {
  const { brandName, logoUrl, slug } = body;
  if (!brandName || !String(brandName).trim()) return 'Brand name is required.';
  if (!logoUrl || !String(logoUrl).trim()) return 'Logo URL is required.';
  // Accept a full URL (pasted directly, or an R2 upload) or the root-relative
  // path the local-disk upload fallback returns (e.g. /local-uploads/...).
  if (!/^https?:\/\//i.test(logoUrl) && !logoUrl.startsWith('/')) {
    return 'Logo URL must start with http://, https://, or / (from Upload Logo).';
  }
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers and hyphens.';
  }
  return null;
}

app.get('/api/admin/partner-brands', requireAdmin, async (_req, res) => {
  res.json(await getAllPartnerBrands());
});

app.post('/api/admin/partner-brands', requireAdmin, async (req, res) => {
  const error = validPartnerBrandPayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const brand = await createPartnerBrand(req.body);
    res.json(brand);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That slug is already in use by another brand.' });
    console.error('Create partner brand error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.put('/api/admin/partner-brands/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid brand id.' });
  const error = validPartnerBrandPayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const brand = await updatePartnerBrand(id, req.body);
    if (!brand) return res.status(404).json({ error: 'Partner brand not found.' });
    res.json(brand);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That slug is already in use by another brand.' });
    console.error('Update partner brand error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Uploads a logo image and returns its URL — the admin form then submits
// that URL as normal via the create/update routes above. Kept as a
// separate step so "paste a URL" and "upload a file" share the same
// downstream save logic.
app.post('/api/admin/partner-brands/upload', requireAdmin, (req, res) => {
  logoUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Please choose an image to upload.' });

    const extension = LOGO_MIME_EXT[req.file.mimetype];
    try {
      const { url } = await uploadPublicFile(req.file.buffer, { mimeType: req.file.mimetype, extension, keyPrefix: 'partner-brands' });
      if (!url) return res.status(500).json({ error: 'File was uploaded but no public URL could be built. Set R2_PUBLIC_URL_BASE.' });
      res.json({ url });
    } catch (e) {
      console.error('Partner brand logo upload error:', e.message);
      res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
  });
});

app.delete('/api/admin/partner-brands/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid brand id.' });
  const deleted = await deletePartnerBrand(id);
  if (!deleted) return res.status(404).json({ error: 'Partner brand not found.' });
  res.json({ success: true });
});
// (its public GET counterpart, /api/public/partner-brands, lives further
// down next to /api/public/featured-offers — both need publicOffersLimiter,
// declared below)

// ── Export OTP gate ────────────────────────────────────────────
const publicOffersLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

const exportOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many export attempts. Please wait 15 minutes.' },
});

app.post('/api/admin/export/request-otp', requireAdmin, exportOtpLimiter, async (req, res) => {
  const otp    = crypto.randomInt(100000, 999999).toString();
  const expiry = Date.now() + 10 * 60 * 1000;
  req.session.exportOtp       = otp;
  req.session.exportOtpExpiry = expiry;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0f1e;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d,#071d40);padding:32px;text-align:center;border-bottom:1px solid rgba(255,179,0,0.2)">
      <h1 style="color:#FFB300;margin:0;font-size:28px;font-weight:900">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.5);margin:6px 0 0;font-size:13px">CSV Export Authorisation</p>
    </div>
    <div style="padding:40px 36px;text-align:center">
      <p style="color:rgba(255,255,255,0.7);font-size:15px;margin:0 0 28px;line-height:1.6">A full member data export has been requested from the Logicard admin panel. Enter this code to authorise the download.</p>
      <div style="background:rgba(255,179,0,0.08);border:2px solid rgba(255,179,0,0.4);border-radius:12px;padding:28px;margin-bottom:28px">
        <p style="color:rgba(255,255,255,0.5);margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:2px">Authorisation code</p>
        <p style="color:#FFB300;margin:0;font-size:48px;font-weight:900;letter-spacing:8px">${otp}</p>
        <p style="color:rgba(255,255,255,0.4);margin:12px 0 0;font-size:12px">Expires in 10 minutes — one use only</p>
      </div>
      <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;line-height:1.6">If you did not request this export, someone with your admin password may have triggered it. Check your admin panel immediately.</p>
    </div>
  </div>`;

  try {
    if (resend && process.env.ADMIN_EMAIL) {
      await resend.emails.send({
        from:    'Logicard <accounts@logicard.co.uk>',
        to:      process.env.ADMIN_EMAIL,
        subject: `${otp} — Logicard CSV export authorisation`,
        html,
      });
    } else {
      console.log(`[DEV] Export OTP: ${otp}`);
    }
  } catch (err) {
    console.error('Export OTP email failed:', err.message);
  }

  res.json({ success: true, pending: true });
});

app.post('/api/admin/export/verify-otp', requireAdmin, (req, res) => {
  const { code } = req.body;
  const { exportOtp, exportOtpExpiry } = req.session;

  if (!exportOtp) return res.status(400).json({ error: 'No pending verification. Please request a new code.' });
  if (Date.now() > exportOtpExpiry) {
    delete req.session.exportOtp;
    delete req.session.exportOtpExpiry;
    return res.status(400).json({ error: 'Code expired. Please request a new one.' });
  }
  if (!code || code.trim() !== exportOtp) return res.status(401).json({ error: 'Incorrect code.' });

  delete req.session.exportOtp;
  delete req.session.exportOtpExpiry;
  req.session.exportAuthorized = Date.now(); // valid for 2 minutes, one use
  res.json({ success: true });
});

app.get('/api/admin/export.csv', requireAdmin, async (req, res) => {
  const authorized = req.session.exportAuthorized;
  if (!authorized || (Date.now() - authorized) > 2 * 60 * 1000) {
    return res.status(403).json({ error: 'Export requires email verification. Use the Export CSV button in the admin panel.' });
  }
  delete req.session.exportAuthorized; // one-time use

  const members = await getAllMembers();
  const headers = ['Membership #','First Name','Last Name','Email','Phone','Age Range','Company','Role','Address 1','Address 2','City','County','Country','Registered','Marketing Consent','Consent Date'];
  const keys    = ['membershipNumber','firstName','lastName','email','phone','ageRange','companyName','role','addressLine1','addressLine2','city','county','country','createdAt','marketingConsent','marketingConsentAt'];
  const escape  = v => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`;
  const rows    = members.map(m => keys.map(k => escape(m[k])).join(','));
  const csv     = '﻿' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');

  const filename = `logicard-members-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Giveaway admin routes ──────────────────────────────────────
app.get('/api/admin/giveaway', requireAdmin, async (_req, res) => {
  const allMembers = await getAllMembers();
  const members = allMembers
    .filter(m => (m.monthlyEntries || 0) > 0)
    .map(({ passwordHash, resetToken, resetTokenExpiry, workEmailToken, workEmailTokenExpiry, ...safe }) => safe)
    .sort((a, b) => (b.monthlyEntries || 0) - (a.monthlyEntries || 0));
  const history = await getGiveawayHistory();
  res.json({ entries: members, history });
});

app.post('/api/admin/giveaway/draw', requireAdmin, async (req, res) => {
  const allMembers = await getAllMembers();
  const eligible = allMembers.filter(m => (m.monthlyEntries || 0) > 0);
  if (!eligible.length) return res.status(400).json({ error: 'No entries for this month.' });

  // Weighted random draw — more entries = better odds
  const entryPool = eligible.flatMap(m => Array(m.monthlyEntries).fill(m));
  const winner    = entryPool[Math.floor(Math.random() * entryPool.length)];

  await recordGiveawayWinner(winner);

  if (resend) {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
        <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
        <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Monthly Giveaway</p>
      </div>
      <div style="padding:40px 36px;background:#fff;text-align:center">
        <div style="font-size:52px;margin-bottom:16px">🎉</div>
        <h2 style="color:#071d40;margin:0 0 12px;font-size:24px;font-weight:900">Congratulations, ${winner.firstName}!</h2>
        <p style="color:#5f6d82;font-size:15px;line-height:1.6;margin:0 0 28px">You've won the Logicard monthly giveaway! You are entitled to a <strong>free hotel night stay</strong> — we will be in touch shortly with details on how to claim your prize.</p>
        <div style="background:linear-gradient(135deg,#071d40,#0d3b80);border-radius:12px;padding:24px;margin-bottom:28px">
          <p style="color:rgba(255,255,255,0.6);margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px">Your Membership Number</p>
          <p style="color:#FFB300;margin:0;font-size:32px;font-weight:900">#${winner.membershipNumber}</p>
        </div>
        <p style="color:#5f6d82;font-size:13px;line-height:1.6">Keep referring friends to earn more entries into next month's giveaway!</p>
      </div>
      <div style="padding:20px 36px;text-align:center;background:#f0f2f7;border-top:1px solid #e2e6ee">
        <p style="margin:0;font-size:11px;color:#aaa">Please do not reply to this email — this mailbox is not monitored.</p>
        <p style="margin:6px 0 0;font-size:11px;color:#bbb">© 2026 Logicard Ltd · Company number 17474646 · <a href="https://logicard.co.uk" style="color:#FFB300;text-decoration:none">logicard.co.uk</a></p>
      </div>
    </div>`;
    try {
      await resend.emails.send({
        from:     'Logicard <welcome@logicard.co.uk>',
        to:       winner.email,
        subject:  `Congratulations ${winner.firstName} — you've won the Logicard monthly prize draw`,
        reply_to: 'info@logicard.co.uk',
        html,
      });
    } catch (err) {
      console.error('Winner email failed:', err.message);
    }
  }

  res.json({ success: true, winner: { name: `${winner.firstName} ${winner.lastName}`, membershipNumber: winner.membershipNumber, email: winner.email, entries: winner.monthlyEntries } });
});

app.post('/api/admin/giveaway/reset', requireAdmin, async (_req, res) => {
  await resetMonthlyEntries();
  res.json({ success: true });
});

// ── Report an issue ────────────────────────────────────────────
app.post('/api/report', requireAuth, async (req, res) => {
  const { issueType, issueTitle, issueDesc } = req.body;
  if (!issueType || !issueDesc) return res.status(400).json({ error: 'Please fill in all required fields.' });

  const membershipNumber = req.session.membershipNumber;
  const member    = await getMemberByNumber(membershipNumber);
  const memberName = member ? `${member.firstName} ${member.lastName}` : 'Unknown';

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">Member Issue Report</p>
    </div>
    <div style="padding:32px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 20px;font-size:18px">A member has submitted a report</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Member</td><td style="padding:10px 14px;color:#333">${escapeHtml(memberName)}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Membership #</td><td style="padding:10px 14px;color:#1a6cc8;font-weight:700">#${membershipNumber}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Email</td><td style="padding:10px 14px;color:#333">${escapeHtml(member ? member.email : '—')}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Type</td><td style="padding:10px 14px;color:#333">${escapeHtml(issueType)}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Title</td><td style="padding:10px 14px;color:#333">${escapeHtml(issueTitle) || '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40;vertical-align:top">Description</td><td style="padding:10px 14px;color:#333;line-height:1.6">${escapeHtml(issueDesc).replace(/\n/g, '<br/>')}</td></tr>
      </table>
    </div>
    <div style="padding:18px 36px;text-align:center;background:#f4f7fb">
      <p style="margin:0;font-size:12px;color:#999">© 2026 Logicard — member report submitted via logicard.co.uk</p>
    </div>
  </div>`;

  try {
    if (resend) {
      await resend.emails.send({
        from:    'Logicard <welcome@logicard.co.uk>',
        to:      process.env.ADMIN_EMAIL,
        subject: `[${issueType}] Report from member #${membershipNumber} — ${memberName}`,
        html,
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Report email failed:', err.message);
    res.status(500).json({ error: 'Failed to submit report. Please try again.' });
  }
});

// A member's own name, DOB, employer etc. aren't self-editable in the app —
// changing them affects verification/eligibility, so a person reviews each
// request rather than the member updating the database directly.
app.post('/api/member/request-edit', requireAuth, editDetailsLimiter, async (req, res) => {
  const { message } = req.body;
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Please describe what you\'d like changed.' });

  const membershipNumber = req.session.membershipNumber;
  const member = await getMemberByNumber(membershipNumber);
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const memberName = `${member.firstName} ${member.lastName}`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">Member Details Edit Request</p>
    </div>
    <div style="padding:32px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 20px;font-size:18px">A member wants their details updated</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Member</td><td style="padding:10px 14px;color:#333">${escapeHtml(memberName)}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Membership #</td><td style="padding:10px 14px;color:#1a6cc8;font-weight:700">#${membershipNumber}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Current Email</td><td style="padding:10px 14px;color:#333">${escapeHtml(member.email)}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40;vertical-align:top">Requested Change</td><td style="padding:10px 14px;color:#333;line-height:1.6">${escapeHtml(message).replace(/\n/g, '<br/>')}</td></tr>
      </table>
    </div>
    <div style="padding:18px 36px;text-align:center;background:#f4f7fb">
      <p style="margin:0;font-size:12px;color:#999">© 2026 Logicard — edit request submitted via logicard.co.uk</p>
    </div>
  </div>`;

  try {
    if (resend) {
      await resend.emails.send({
        from:    'Logicard <welcome@logicard.co.uk>',
        to:      'josh@logicard.co.uk',
        subject: `Edit request from member #${membershipNumber} — ${memberName}`,
        html,
      });
    } else {
      console.log(`[DEV] Edit-details request from #${membershipNumber}: ${message}`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Edit-details request email failed:', err.message);
    res.status(500).json({ error: 'Failed to send your request. Please try again.' });
  }
});

// ── Contact form ───────────────────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, title, company, phone, newsletterOptIn, message, source, teamSize } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  const sourceLabel = escapeHtml(source ? String(source).slice(0, 60) : 'Contact Form');

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">New ${sourceLabel} Submission</p>
    </div>
    <div style="padding:32px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 20px;font-size:18px">Someone got in touch via logicard.co.uk</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Source</td><td style="padding:10px 14px;color:#333">${sourceLabel}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Full Name</td><td style="padding:10px 14px;color:#333">${escapeHtml(name)}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Email</td><td style="padding:10px 14px;color:#1a6cc8">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Job Title</td><td style="padding:10px 14px;color:#333">${escapeHtml(title) || '—'}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Company</td><td style="padding:10px 14px;color:#333">${escapeHtml(company) || '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Phone</td><td style="padding:10px 14px;color:#333">${escapeHtml(phone) || '—'}</td></tr>
        ${teamSize ? `<tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Team Size</td><td style="padding:10px 14px;color:#333">${escapeHtml(teamSize)}</td></tr>` : ''}
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Newsletter</td><td style="padding:10px 14px;color:#333">${newsletterOptIn ? '✅ Yes' : 'No'}</td></tr>
        ${message ? `<tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;vertical-align:top">Message</td><td style="padding:10px 14px;color:#333;line-height:1.6">${escapeHtml(message).replace(/\n/g, '<br/>')}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding:18px 36px;text-align:center;background:#f4f7fb">
      <p style="margin:0;font-size:12px;color:#999">© 2026 Logicard — ${sourceLabel.toLowerCase()} submission from logicard.co.uk</p>
    </div>
  </div>`;

  try {
    if (resend) {
      await resend.emails.send({
        from:     'Logicard <welcome@logicard.co.uk>',
        to:       'info@logicard.co.uk',
        reply_to: email,
        subject:  `New ${sourceLabel.toLowerCase()} from ${name}${company ? ` — ${company}` : ''}`,
        html,
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Contact form email failed:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

// ── Password reset ─────────────────────────────────────────────
app.post('/api/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const member = await findMemberByEmail(email.trim().toLowerCase());
  if (!member) return res.json({ success: true }); // prevent email enumeration

  const token     = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiry    = Date.now() + 60 * 60 * 1000;
  await setResetToken(member.email, tokenHash, expiry);

  const resetLink = `https://logicard.co.uk/reset-password.html?token=${token}`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f2f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#04040d 0%,#071d40 50%,#0d3b80 100%);padding:40px 36px;text-align:center">
      <h1 style="color:#FFB300;margin:0;font-size:32px;font-weight:900;letter-spacing:-1px">Logi<span style="color:#fff">card</span></h1>
      <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px">Password Reset Request</p>
    </div>
    <div style="padding:40px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 8px;font-size:22px">Reset your password</h2>
      <p style="color:#5f6d82;margin:0 0 28px;font-size:15px;line-height:1.6">Hi ${member.firstName}, we received a request to reset your Logicard password. Click the button below to choose a new one.</p>
      <div style="text-align:center;margin-bottom:32px">
        <a href="${resetLink}" style="background:#FFB300;color:#071d40;padding:16px 40px;text-decoration:none;border-radius:6px;font-weight:900;font-size:16px;display:inline-block">Reset My Password →</a>
      </div>
      <p style="color:#5f6d82;font-size:13px;line-height:1.6;margin:0 0 8px">This link will expire in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
      <p style="color:#aaa;font-size:12px;margin:0">If the button doesn't work, copy and paste this link into your browser:<br/><span style="color:#1a6cc8;word-break:break-all">${resetLink}</span></p>
    </div>
    <div style="padding:20px 36px;text-align:center;background:#f0f2f7;border-top:1px solid #e2e6ee">
      <p style="margin:0;font-size:11px;color:#aaa">Please do not reply to this email — this mailbox is not monitored.</p>
      <p style="margin:6px 0 0;font-size:11px;color:#bbb">© 2026 Logicard Ltd · Company number 17474646 · <a href="https://logicard.co.uk" style="color:#FFB300;text-decoration:none">logicard.co.uk</a></p>
    </div>
  </div>`;

  try {
    if (resend) {
      await resend.emails.send({
        from:     'Logicard <accounts@logicard.co.uk>',
        to:       member.email,
        subject:  'Reset your Logicard password',
        reply_to: 'info@logicard.co.uk',
        html,
      });
    }
  } catch (err) {
    console.error('Password reset email failed:', err.message);
  }

  res.json({ success: true });
});

app.post('/api/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Invalid request.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const member = await findMemberByResetToken(tokenHash);
  if (!member) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  if (Date.now() > member.resetTokenExpiry) return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });

  const newHash = bcrypt.hashSync(password, 10);
  await clearResetToken(member.email, newHash);

  res.json({ success: true });
});

// ── Proof-of-employment verification ─────────────────────────────
app.get('/api/verification/status', requireAuth, async (req, res) => {
  const member    = await getMemberByNumber(req.session.membershipNumber);
  const documents = await getVerificationDocumentsForMember(req.session.membershipNumber);
  res.json({
    verified:            member.verified,
    verificationStatus:  member.verificationStatus,
    verificationMethod:  member.verificationMethod,
    rejectionReason:     member.rejectionReason,
    workEmail:           member.workEmail,
    documents:           documents.map(({ id, docType, status, submittedAt, rejectionReason }) => ({ id, docType, status, submittedAt, rejectionReason })),
  });
});

app.post('/api/verification/upload', requireAuth, verificationUploadLimiter, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Please choose a file to upload.' });

    const docType = (req.body.docType || '').trim();
    if (!VALID_DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'Please select a valid document type.' });

    const note              = (req.body.note || '').trim().slice(0, 500);
    const membershipNumber  = req.session.membershipNumber;
    const extension         = VERIFICATION_MIME_EXT[req.file.mimetype];

    try {
      const fileKey = await uploadVerificationFile(req.file.buffer, { membershipNumber, mimeType: req.file.mimetype, extension });
      await createVerificationDocument({
        membershipNumber, docType, fileKey,
        originalFilename: req.file.originalname, mimeType: req.file.mimetype, note,
      });
      res.json({ success: true });

      const member = await getMemberByNumber(membershipNumber);
      if (member) sendVerificationSubmittedAdminEmail(member, docType);
    } catch (e) {
      console.error('Verification upload error:', e.message);
      res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
  });
});

app.post('/api/verification/work-email', requireAuth, workEmailLimiter, async (req, res) => {
  const workEmail = (req.body.workEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const domain = workEmail.split('@')[1];
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return res.status(400).json({ error: "That looks like a personal email address. Please use your company email, or upload proof of employment instead." });
  }

  const token     = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiry    = Date.now() + 24 * 60 * 60 * 1000;
  await setWorkEmailToken(req.session.membershipNumber, workEmail, tokenHash, expiry);

  const member = await getMemberByNumber(req.session.membershipNumber);
  const confirmLink = `https://logicard.co.uk/api/verification/confirm-work-email?token=${token}`;
  await sendWorkEmailConfirmation(member, workEmail, confirmLink);

  res.json({ success: true });
});

app.get('/api/verification/confirm-work-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/verify?result=invalid');

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const member    = await confirmWorkEmailToken(tokenHash);
  if (!member) return res.redirect('/verify?result=invalid');

  res.redirect('/verify?result=success');
});

// ── Admin verification review ─────────────────────────────────────
app.get('/api/admin/verifications', requireAdmin, async (_req, res) => {
  res.json(await getPendingVerificationDocuments());
});

app.get('/api/admin/verifications/:id/view-url', requireAdmin, async (req, res) => {
  const doc = await getVerificationDocument(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (!doc.fileKey) return res.status(410).json({ error: 'This document has been purged and is no longer available.' });
  const url = await getSignedViewUrl(doc.fileKey);
  res.json({ url });
});

app.get('/api/admin/verifications/local-file', requireAdmin, (req, res) => {
  const filePath = req.query.key && readLocalFile(String(req.query.key));
  if (!filePath) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.post('/api/admin/verifications/:id/approve', requireAdmin, async (req, res) => {
  const result = await reviewVerificationDocument(Number(req.params.id), { status: 'approved' });
  if (!result) return res.status(404).json({ error: 'Document not found.' });
  res.json({ success: true });
  sendVerificationApprovedEmail(result.member);
});

app.post('/api/admin/verifications/:id/reject', requireAdmin, async (req, res) => {
  const reason = (req.body.reason || '').trim().slice(0, 500);
  const result = await reviewVerificationDocument(Number(req.params.id), { status: 'rejected', reason: reason || null });
  if (!result) return res.status(404).json({ error: 'Document not found.' });
  res.json({ success: true });
  sendVerificationRejectedEmail(result.member, reason);
});

// An offer with no target_gender is shown to everyone. A member with no
// gender on file also sees everything, regardless of any offer's target —
// missing data should never hide content, only an explicit mismatch does.
function filterOffersForMember(offers, memberGender) {
  if (!memberGender) return offers;
  return offers.filter(o => !o.targetGender || o.targetGender === memberGender);
}

// ── Public deal teasers (homepage "Member Deals" section) ────────
// Unlike the closed-group /api/offers below, this exposes a public
// preview of featured offers for logged-out visitors — merchant, title,
// category, discount headline and image only. No voucher code or
// affiliate URL is ever returned here, and claiming still requires
// signing up and verifying, same as it always has.
// ── Members Forum API ─────────────────────────────────────────────
const FORUM_CATEGORIES = [
  'General Chat', 'Drivers', 'Warehouse & Operations', 'Deals & Savings',
  'Jobs & Careers', 'Health & Wellbeing', 'Help & Support',
];

// Per-member limits (keyed on the session, so a shared depot/Wi-Fi IP
// doesn't lump many members together). requireAuth always runs first, so
// membershipNumber is set by the time these run.
function forumLimiter(max, what) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `member:${req.session.membershipNumber}`,
    message: { error: `You've hit the limit for ${what}. Please try again in an hour.` },
  });
}
const forumPostLimiter   = forumLimiter(10, 'new posts');
const forumReplyLimiter  = forumLimiter(40, 'replies');
const forumReportLimiter = forumLimiter(20, 'reports');
const forumReadLimiter   = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

// Free text: strip control characters (keeping newlines/tabs), trim, and
// collapse runs of blank lines. Output is always escaped/textContent on the
// page, so this is tidy-up plus length limits, not the XSS defence itself.
function cleanForumText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max + 1);
}

function forumId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
}

app.get('/api/forum/categories', requireAuth, (_req, res) => res.json(FORUM_CATEGORIES));

app.get('/api/forum/posts', requireAuth, forumReadLimiter, async (req, res) => {
  const category = FORUM_CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 500);
  const limit = 20;
  const posts = await listForumPosts({ category, limit: limit + 1, offset: (page - 1) * limit, viewer: req.session.membershipNumber });
  res.json({
    posts: posts.slice(0, limit).map(p => ({ ...p, body: p.body.length > 220 ? p.body.slice(0, 217) + '...' : p.body })),
    hasMore: posts.length > limit,
    page,
  });
});

app.get('/api/forum/posts/:id', requireAuth, forumReadLimiter, async (req, res) => {
  const id = forumId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid post.' });
  const member = await getMemberByNumber(req.session.membershipNumber);
  const post = await getForumPost(id, req.session.membershipNumber);
  if (!post) return res.status(404).json({ error: 'This post was not found or has been removed.' });
  res.json({ ...post, canPost: !!(member && member.verified) });
});

app.post('/api/forum/posts', requireAuth, requireVerified, forumPostLimiter, async (req, res) => {
  const category = req.body && req.body.category;
  const title = cleanForumText(req.body && req.body.title, 120);
  const body = cleanForumText(req.body && req.body.body, 5000);
  if (!FORUM_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Please choose a category.' });
  if (title.length < 5 || title.length > 120) return res.status(400).json({ error: 'Titles need to be 5 to 120 characters.' });
  if (body.length < 10 || body.length > 5000) return res.status(400).json({ error: 'Posts need to be 10 to 5,000 characters.' });
  const id = await createForumPost({ membershipNumber: req.session.membershipNumber, category, title, body });
  res.status(201).json({ id });
});

app.post('/api/forum/posts/:id/replies', requireAuth, requireVerified, forumReplyLimiter, async (req, res) => {
  const postId = forumId(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post.' });
  const body = cleanForumText(req.body && req.body.body, 3000);
  if (body.length < 2 || body.length > 3000) return res.status(400).json({ error: 'Replies need to be 2 to 3,000 characters.' });
  const id = await createForumReply({ postId, membershipNumber: req.session.membershipNumber, body });
  if (!id) return res.status(404).json({ error: 'This post was not found or has been removed.' });
  res.status(201).json({ id });
});

// Members can take down their own posts/replies.
app.delete('/api/forum/:type(posts|replies)/:id', requireAuth, forumReplyLimiter, async (req, res) => {
  const id = forumId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid item.' });
  const ok = await removeForumItem(req.params.type === 'replies' ? 'reply' : 'post', id, req.session.membershipNumber);
  if (!ok) return res.status(404).json({ error: 'Not found, or not yours to delete.' });
  res.json({ success: true });
});

app.post('/api/forum/:type(posts|replies)/:id/report', requireAuth, forumReportLimiter, async (req, res) => {
  const id = forumId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid item.' });
  const type = req.params.type === 'replies' ? 'reply' : 'post';
  const ok = await reportForumItem(type, id);
  if (!ok) return res.status(404).json({ error: 'Not found.' });
  if (resend && process.env.ADMIN_EMAIL) {
    resend.emails.send({
      from: 'Logicard <welcome@logicard.co.uk>',
      to: process.env.ADMIN_EMAIL,
      subject: 'Logicard forum: a ' + type + ' was reported',
      html: `<p>A member reported forum ${escapeHtml(type)} #${id}.</p><p>Review it in <a href="https://logicard.co.uk/admin/forum">Forum Moderation</a>.</p>`,
    }).catch(err => console.error('Forum report email failed:', err.message));
  }
  res.json({ success: true });
});

// ── Forum moderation (admin) ──
app.get('/api/admin/forum', requireAdmin, async (_req, res) => {
  res.json(await getForumModerationQueue());
});

app.post('/api/admin/forum/:type(post|reply)/:id/:action(remove|restore|dismiss)', requireAdmin, async (req, res) => {
  const id = forumId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid item.' });
  const { type, action } = req.params;
  if (action === 'remove') await removeForumItem(type, id, null);
  else if (action === 'restore') await restoreForumItem(type, id);
  else await clearForumReport(type, id);
  res.json({ success: true });
});

// Powers the /deals.html browser: every active offer, teaser fields only
// (no voucher codes or affiliate URLs; those stay behind the member login,
// same as the featured teasers below). Gender-targeted offers are left out
// because there's no member to target.
app.get('/api/public/offers', publicOffersLimiter, async (_req, res) => {
  const offers = (await getActiveOffers()).filter(o => !o.targetGender && offerLive(o));
  res.json(offers.map(({ id, merchantName, title, description, category, discountText, imageUrl, logoUrl, slug }) => ({
    id, merchantName, title, description, category, discountText, imageUrl, logoUrl, slug,
  })));
});

app.get('/api/public/featured-offers', publicOffersLimiter, async (_req, res) => {
  const offers = (await getFeaturedOffersForPublic()).filter(o => !o.targetGender && offerLive(o));
  res.json(offers.map(({ id, merchantName, title, description, category, discountText, imageUrl, logoUrl, slug }) => ({
    id, merchantName, title, description, category, discountText, imageUrl, logoUrl, slug, // slug powers the "Get Deal" link to /:slug (see the per-offer route near the bottom of this file)
  })));
});

// Powers /logistics-news.html — headline, excerpt, source and a link out
// to the original article only (see fetchLogisticsNews above). Same
// public, no-auth pattern as the deal teasers above.
app.get('/api/public/logistics-news', publicOffersLimiter, async (_req, res) => {
  const items = await getRecentNewsItems(30);
  res.json(items.map(({ title, link, source, summary, publishedAt }) => ({ title, link, source, summary, publishedAt })));
});

// Powers the "Our Partners" grid on partnerships.html — same public,
// no-auth pattern as the deal teasers above.
app.get('/api/public/partner-brands', publicOffersLimiter, async (_req, res) => {
  const brands = await getActivePartnerBrands();
  res.json(brands.map(({ id, brandName, logoUrl, slug }) => ({ id, brandName, logoUrl, slug })));
});

// ── Offers (closed-group — verified members only) ───────────────
app.get('/api/offers', requireAuth, requireVerified, async (req, res) => {
  const member = await getMemberByNumber(req.session.membershipNumber);
  const offers = filterOffersForMember(await getActiveOffers(), member ? member.gender : null);
  const offerIds = offers.map(o => o.id);
  const [statsMap, myCodes, waitlisted] = await Promise.all([
    getCouponStatsForOffers(offerIds),
    getMemberClaimedCodes(req.session.membershipNumber, offerIds),
    getMemberWaitlistedOfferIds(req.session.membershipNumber, offerIds),
  ]);

  res.json(offers.map(({ id, merchantName, title, description, category, discountText, voucherCode, imageUrl }) => {
    const stats = statsMap[id];
    return {
      id, merchantName, title, description, category, discountText, imageUrl,
      voucherCode:    stats ? undefined : voucherCode, // legacy shared code only applies when no unique-code pool exists
      hasCodePool:    !!stats,
      codesAvailable: stats ? stats.available : null,
      myCode:         myCodes[id] || null,
      onWaitlist:     waitlisted.has(id),
    };
  }));
});

// Powers the "Featured Partners" tiles on the member dashboard — a small,
// lightweight slice of the same offers data, not a separate content type.
app.get('/api/offers/featured', requireAuth, requireVerified, async (req, res) => {
  const member = await getMemberByNumber(req.session.membershipNumber);
  const offers = filterOffersForMember(await getFeaturedOffersForDashboard(), member ? member.gender : null);
  res.json(offers.map(({ id, merchantName, title, imageUrl }) => ({ id, merchantName, title, imageUrl })));
});

app.post('/api/offers/:id/claim', requireAuth, requireVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer.' });

  const offer = await getOfferById(id);
  if (!offer || !offer.isActive) return res.status(404).json({ error: 'This offer is no longer available.' });

  const result = await claimCouponCode(id, req.session.membershipNumber);
  if (result.outOfStock) return res.status(410).json({ error: 'All codes for this offer have been claimed — check back soon.' });
  res.json({ code: result.code });
});

app.post('/api/offers/:id/waitlist', requireAuth, requireVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer.' });

  const offer = await getOfferById(id);
  if (!offer || !offer.isActive) return res.status(404).json({ error: 'This offer is no longer available.' });

  await registerOfferInterest(id, req.session.membershipNumber);
  res.json({ success: true });
});

app.get('/api/offers/:id/go', requireAuth, requireVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid offer.');

  const offer = await getOfferById(id);
  if (!offer || !offer.isActive) return res.status(404).send('This offer is no longer available.');

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.redirect(302, offer.affiliateUrl);

  incrementOfferClicks(id).catch(err => console.error('Offer click tracking failed:', err.message));
  recordOfferRedemption(id, req.session.membershipNumber).catch(err => console.error('Offer redemption tracking failed:', err.message));
});

// Adverts are reachable as soon as a member is logged in (the dashboard
// itself doesn't wait on verification), unlike offers above.
app.get('/api/adverts', requireAuth, async (_req, res) => {
  const adverts = await getActiveAdverts();
  res.json(adverts.map(({ id, title, imageUrl, linkUrl }) => ({ id, title, imageUrl, linkUrl })));
});

app.get('/api/adverts/:id/go', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid advert.');

  const advert = await getAdvertById(id);
  if (!advert || !advert.isActive) return res.status(404).send('This advert is no longer available.');
  if (!advert.linkUrl) return res.status(404).send('This advert has no link.');

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.redirect(302, advert.linkUrl);

  incrementAdvertClicks(id).catch(err => console.error('Advert click tracking failed:', err.message));
});

// ── Mobile API (React Native app) ─────────────────────────────────
// Same underlying data/DB helpers as the web routes above, re-exposed under
// /api/mobile/* with JWT auth instead of session cookies. Kept as separate
// routes (rather than teaching requireAuth two auth styles) so the existing
// web routes/tests are untouched and this can be reviewed/rate-limited on
// its own.
app.post('/api/mobile/login', mobileLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const member = await findMemberByEmail(email);
  if (!member || !member.passwordHash) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!bcrypt.compareSync(password, member.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = jwt.sign({ sub: member.membershipNumber }, JWT_SECRET, { expiresIn: MOBILE_TOKEN_EXPIRY });
  res.json({
    token,
    firstName: member.firstName,
    verified: member.verified,
  });
});

app.get('/api/mobile/me', requireMobileAuth, async (req, res) => {
  const member = await getMemberByNumber(req.membershipNumber);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({
    membershipNumber:   member.membershipNumber,
    firstName:          member.firstName,
    lastName:           member.lastName,
    email:              member.email,
    verified:           member.verified,
    verificationStatus: member.verificationStatus,
  });
});

app.get('/api/mobile/offer-categories', requireMobileAuth, (_req, res) => res.json(OFFER_CATEGORIES));

app.get('/api/mobile/offers', requireMobileAuth, requireMobileVerified, async (req, res) => {
  const member = await getMemberByNumber(req.membershipNumber);
  const offers = filterOffersForMember(await getActiveOffers(), member ? member.gender : null);
  const offerIds = offers.map(o => o.id);
  const [statsMap, myCodes, waitlisted] = await Promise.all([
    getCouponStatsForOffers(offerIds),
    getMemberClaimedCodes(req.membershipNumber, offerIds),
    getMemberWaitlistedOfferIds(req.membershipNumber, offerIds),
  ]);

  res.json(offers.map(({ id, merchantName, title, description, category, discountText, voucherCode, imageUrl }) => {
    const stats = statsMap[id];
    return {
      id, merchantName, title, description, category, discountText, imageUrl,
      voucherCode:    stats ? undefined : voucherCode,
      hasCodePool:    !!stats,
      codesAvailable: stats ? stats.available : null,
      myCode:         myCodes[id] || null,
      onWaitlist:     waitlisted.has(id),
    };
  }));
});

app.post('/api/mobile/offers/:id/claim', requireMobileAuth, requireMobileVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer.' });

  const offer = await getOfferById(id);
  if (!offer || !offer.isActive) return res.status(404).json({ error: 'This offer is no longer available.' });

  const result = await claimCouponCode(id, req.membershipNumber);
  if (result.outOfStock) return res.status(410).json({ error: 'All codes for this offer have been claimed — check back soon.' });
  res.json({ code: result.code });
});

app.post('/api/mobile/offers/:id/waitlist', requireMobileAuth, requireMobileVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer.' });

  const offer = await getOfferById(id);
  if (!offer || !offer.isActive) return res.status(404).json({ error: 'This offer is no longer available.' });

  await registerOfferInterest(id, req.membershipNumber);
  res.json({ success: true });
});

// Mobile gets the affiliate URL back as JSON (instead of a redirect) so the
// app can open it via the OS browser/Linking API — a bare fetch() in the app
// can't follow a redirect out to an external site the way a <a href> can.
app.get('/api/mobile/offers/:id/go', requireMobileAuth, requireMobileVerified, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer.' });

  const offer = await getOfferById(id);
  if (!offer || !offer.isActive) return res.status(404).json({ error: 'This offer is no longer available.' });

  res.json({ url: offer.affiliateUrl });

  incrementOfferClicks(id).catch(err => console.error('Offer click tracking failed:', err.message));
  recordOfferRedemption(id, req.membershipNumber).catch(err => console.error('Offer redemption tracking failed:', err.message));
});

// ── Signup field validation ──────────────────────────────────────
// Allowlists shaped to what each field can legitimately contain — this is a
// defense-in-depth layer alongside output escaping (not a replacement for
// it), so it deliberately still permits real-world punctuation (O'Brien,
// Smith & Sons, St. Ives) while excluding characters with no legitimate use
// in these fields (<, >, {, }, [, ], ;, :, ", \, etc).
const NAME_PATTERN    = /^[\p{L}\p{M} '-]{1,80}$/u;
const PLACE_PATTERN   = /^[\p{L}\p{M} '.-]{1,80}$/u;
const COMPANY_PATTERN = /^[\p{L}\p{N}\p{M} &.,'()-]{1,120}$/u;
const PHONE_PATTERN   = /^[0-9 +()-]{5,20}$/;
const ADDRESS_PATTERN = /^[\p{L}\p{N}\p{M} ,./#'&-]{1,120}$/u;

// Shared by /api/signup and /api/checkout/complete — both endpoints create a
// member record from user-supplied data, so both must apply the same
// required-field, format, and character-allowlist checks. (These two routes
// previously diverged: checkout/complete skipped all of this.)
function validateMemberFields(data) {
  const { companyName, role, roleCategory, roleCategoryOther, firstName, lastName, email, phone, gender,
          addressLine1, addressLine2, town, city, county, country, password, gdprConsent } = data;

  const required = { companyName, role, firstName, lastName, email, phone, town, city };
  for (const [field, value] of Object.entries(required)) {
    if (!value || !String(value).trim()) return `Missing required field: ${field}`;
  }
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!gdprConsent) return 'You must accept the privacy policy to continue.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
  // Optional — members aren't required to disclose this.
  if (gender && !GENDER_VALUES.includes(gender)) return 'Invalid gender selection.';

  // roleCategory is optional. When it's "Other" or left blank, role is
  // checked against the full role set instead of one category's list (since
  // neither "Other" nor "no category" has a roles array of its own). When
  // "Other" is picked, roleCategoryOther must be filled in to say which area.
  if (!roleCategory || roleCategory === 'Other') {
    if (roleCategory === 'Other' && (!roleCategoryOther || !String(roleCategoryOther).trim())) {
      return 'Please confirm which part of logistics you work in.';
    }
    if (!ALL_JOB_ROLES.has(role)) return 'Please select a valid job title.';
  } else {
    const category = JOB_ROLE_CATEGORIES.find(c => c.name === roleCategory);
    if (!category) return 'Please select a valid logistics category.';
    if (!category.roles.includes(role)) return 'Please select a valid job title for that category.';
  }

  const fieldChecks = [
    [firstName,   NAME_PATTERN,    'First Name'],
    [lastName,    NAME_PATTERN,    'Last Name'],
    [companyName, COMPANY_PATTERN, 'Company Name'],
    [phone,       PHONE_PATTERN,   'Phone Number'],
    [town,        PLACE_PATTERN,   'Town'],
    [city,        PLACE_PATTERN,   'City'],
  ];
  if (county)             fieldChecks.push([county,             PLACE_PATTERN,   'County']);
  if (country)            fieldChecks.push([country,            PLACE_PATTERN,   'Country']);
  if (addressLine1)       fieldChecks.push([addressLine1,       ADDRESS_PATTERN, 'Address Line 1']);
  if (addressLine2)       fieldChecks.push([addressLine2,       ADDRESS_PATTERN, 'Address Line 2']);
  if (roleCategoryOther)  fieldChecks.push([roleCategoryOther,  COMPANY_PATTERN, 'Logistics area confirmation']);

  for (const [value, pattern, label] of fieldChecks) {
    if (!pattern.test(String(value).trim())) return `${label} contains characters that aren't allowed.`;
  }

  return null;
}

// ── Signup ─────────────────────────────────────────────────────
app.post('/api/signup', signupLimiter, async (req, res) => {
  const { companyName, role, roleCategory, roleCategoryOther, firstName, lastName, email, phone, ageRange, gender,
          addressLine1, addressLine2, town, city, county, country,
          password, gdprConsent, marketingConsent, ref, promoCode } = req.body;

  const validationError = validateMemberFields(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const normalizedPromo = (promoCode || '').toUpperCase().trim();
  if (normalizedPromo && !VALID_PROMOS[normalizedPromo]) {
    return res.status(400).json({ error: 'Invalid promotion code.' });
  }
  const promo = VALID_PROMOS[normalizedPromo] || null;

  // emailExists is now inside the same try/catch as createMember — a
  // transient DB hiccup here previously threw as an unhandled rejection
  // and crashed the whole Node process (confirmed directly while testing
  // the Town/City change), rather than just failing this one request.
  try {
    if (await emailExists(email)) return res.status(409).json({ error: 'An account with this email address already exists.' });

    const { membershipNumber } = await createMember({
      companyName: companyName.trim(), role: role.trim(), roleCategory: roleCategory ? roleCategory.trim() : null,
      roleCategoryOther: roleCategoryOther ? roleCategoryOther.trim() : null,
      firstName: firstName.trim(),     lastName: lastName.trim(),
      email: email.trim().toLowerCase(), phone: phone.trim(),
      ageRange: ageRange || null,
      gender: gender || null,
      addressLine1: addressLine1 ? addressLine1.trim() : null,
      addressLine2: addressLine2 ? addressLine2.trim() : null,
      town: town ? town.trim() : null,
      city: city ? city.trim() : null, county: county ? county.trim() : null,
      country: country ? country.trim() : null,
      password, gdprConsent,
      marketingConsent: !!marketingConsent,
      referredBy: ref || null,
      promoCode: normalizedPromo || null,
      freeYear: promo ? promo.freeYear : false,
    });

    res.json({ success: true, membershipNumber });

    const saved = await findMemberByEmail(email.trim().toLowerCase());
    if (saved) sendWelcomeEmail(saved);

  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Checkout endpoints ─────────────────────────────────────────
app.post('/api/checkout/validate-promo', (req, res) => {
  const code = (req.body.code || '').toUpperCase().trim();
  const promo = VALID_PROMOS[code];
  if (!promo) return res.status(400).json({ error: 'Invalid promotion code.' });
  res.json({ valid: true, code, ...promo });
});

app.get('/api/checkout/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
});

app.post('/api/checkout/create-intent', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payment processing not configured. Please contact support.' });
  try {
    const intent = await stripe.paymentIntents.create({
      amount: 1000,
      currency: 'gbp',
      receipt_email: req.body.email || undefined,
      metadata: { product: 'logicard_annual' },
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Payment setup failed. Please try again.' });
  }
});

app.post('/api/checkout/complete', signupLimiter, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payment not configured.' });
  const { paymentIntentId, ...signupData } = req.body;

  const validationError = validateMemberFields(signupData);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Payment not confirmed. Please try again.' });
    if (await emailExists(signupData.email)) return res.status(409).json({ error: 'An account with this email already exists.' });
    const { membershipNumber } = await createMember({ ...signupData, promoCode: null, freeYear: false });
    const saved = await findMemberByEmail(signupData.email.toLowerCase());
    if (saved) sendWelcomeEmail(saved);
    res.json({ success: true, membershipNumber });
  } catch (err) {
    console.error('Checkout complete error:', err.message);
    res.status(500).json({ error: 'Account setup failed. Please contact support.' });
  }
});

// ── Per-offer pages at the site root (e.g. /gousto) ─────────────────
// Registered LAST, deliberately: this only runs if no earlier route or
// static file already matched, so it can never shadow an existing page.
// Single path segment. Every offer has its own persisted slug (set at
// creation from the merchant name, deduped with -2/-3 etc. if a second
// offer from the same merchant needs one too, editable after) — see
// getActiveOfferBySlug in database.js. Public/pre-login, same data
// shape as the homepage's Featured Deals — no voucher code or
// affiliate URL exposed here.
const RESERVED_ROOT_SLUGS = new Set(['api', 'admin', 'local-uploads', 'deals', 'logistics-rewards', 'images', 'icons', 'adult', 'partner']);
app.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;
  // A dot means this was almost certainly an unmatched static asset request
  // (e.g. a typo'd image path), not an offer slug — let it 404 normally.
  if (slug.includes('.') || RESERVED_ROOT_SLUGS.has(slug)) return next();

  try {
    const offer = await getActiveOfferBySlug(slug);
    if (!offer) return next();

    const publicOffer = {
      merchantName: offer.merchantName, title: offer.title, description: offer.description,
      category: offer.category, discountText: offer.discountText, imageUrl: offer.imageUrl, slug,
      aboutBrand: offer.aboutBrand, howToRedeem: offer.howToRedeem, terms: offer.terms, endDate: offer.endDate,
      ended: !offerLive(offer),
    };

    // Who is looking decides what the redeem box shows. The real code and
    // the tracked brand link are only ever rendered for a verified member.
    let viewer = { state: 'guest' };
    const memberNo = req.session && req.session.membershipNumber;
    if (memberNo) {
      const member = await getMemberByNumber(memberNo);
      if (member && member.verified) {
        const [statsMap, myCodes] = await Promise.all([
          getCouponStatsForOffers([offer.id]),
          getMemberClaimedCodes(memberNo, [offer.id]),
        ]);
        const hasPool = !!statsMap[offer.id];
        // Older offers have no redeem type yet: infer it from what they have
        const redeemType = offer.redeemType || (hasPool ? 'unique' : offer.voucherCode ? 'code' : 'link');
        viewer = {
          state: 'member', offerId: offer.id, hasPool, redeemType,
          code: hasPool ? (myCodes[offer.id] || null) : (offer.voucherCode || null),
        };
      } else if (member) {
        viewer = { state: 'unverified' };
      }
    }

    // Brand logo: the matching partner brand's logo, if one is set up.
    const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const [brands, allOffers] = await Promise.all([getActivePartnerBrands(), getActiveOffers()]);
    const brand = brands.find(b => norm(b.brandName) === norm(offer.merchantName));
    const safeLogo = (u) => /^(https:\/\/|\/(?!\/))/i.test(u || '') ? u : null;
    const brandLogo = safeLogo(offer.logoUrl) || (brand ? safeLogo(brand.logoUrl) : null);
    const related = allOffers
      .filter(o => o.id !== offer.id && o.slug && !o.targetGender && offerLive(o) && o.category === offer.category)
      .slice(0, 3)
      .map(o => ({ slug: o.slug, title: o.title, merchantName: o.merchantName, imageUrl: o.imageUrl }));

    // Member views contain a personal code: never let a shared cache keep them.
    if (viewer.state !== 'guest') res.set('Cache-Control', 'private, no-store');
    res.send(renderOfferPage({ offer: publicOffer, viewer, brandLogo, related })
      .replace('<!-- SHARED_NAV -->', navFor(req, {}))
      .replace('<!-- SHARED_FOOTER -->', renderFooter()));
  } catch (err) {
    console.error('Offer page error:', err.message);
    next();
  }
});

const PURGE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const NEWS_FETCH_INTERVAL_MS  = 3 * 60 * 60 * 1000;  // every 3 hours

app.listen(PORT, () => {
  console.log(`Logicard running at http://localhost:${PORT}`);
  if (!process.env.SESSION_SECRET)      console.warn('  > SESSION_SECRET not set — using insecure default. Set this in Railway Variables.');
  if (!process.env.JWT_SECRET)          console.warn('  > JWT_SECRET not set — using insecure default. Set this in Railway Variables before the mobile app goes live.');
  if (!process.env.ADMIN_EMAIL)         console.warn('  > ADMIN_EMAIL not set — admin OTP and member reports will not be delivered.');
  if (!process.env.ADMIN_PASSWORD)      console.warn('  > ADMIN_PASSWORD not set — admin panel is inaccessible.');
  if (!process.env.R2_BUCKET_NAME)      console.warn('  > R2_* env vars not set — verification documents are being saved to local disk (not persistent on Railway).');
  if (!process.env.R2_BUCKET_NAME && !UPLOADS_PERSISTENT) console.warn('  > UPLOADS_DIR not set either — public uploads (e.g. partner brand logos) will be LOST on the next deploy. Set UPLOADS_DIR to a Railway Volume mount path, or configure R2_*.');
  if (!process.env.R2_BUCKET_NAME && UPLOADS_PERSISTENT)  console.log('  > Public uploads are stored at UPLOADS_DIR (persistent, assuming it\'s a mounted Railway Volume).');

  verifyResendConnection();

  // Give the DB pool a moment on cold start, then run daily thereafter.
  setTimeout(runVerificationPurge, 60 * 1000);
  setInterval(runVerificationPurge, PURGE_SWEEP_INTERVAL_MS);

  setTimeout(fetchLogisticsNews, 90 * 1000);
  setInterval(fetchLogisticsNews, NEWS_FETCH_INTERVAL_MS);
});

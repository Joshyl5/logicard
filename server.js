require('dotenv').config();

const express   = require('express');
const helmet    = require('helmet');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const path      = require('path');
const multer    = require('multer');
const { Resend } = require('resend');
const {
  createMember, emailExists, findMemberByEmail,
  getMemberByNumber, getAllMembers,
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
} = require('./database');
const { uploadVerificationFile, getSignedViewUrl, readLocalFile, deleteFile } = require('./storage');
const { categories: JOB_ROLE_CATEGORIES, roleBySlug: JOB_ROLE_BY_SLUG, allRoles: ALL_JOB_ROLES } = require('./job-roles');
const { UK_TOWNS } = require('./uk-towns');
const { renderRolePage, renderRoleNotFound } = require('./templates/role-page');

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
        <p style="margin:8px 0 0;font-size:11px;color:#aaa">© 2026 Logicard · You received this because you registered at logicard.co.uk</p>
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

© 2026 Logicard · You received this because you registered at logicard.co.uk`;

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
  if (!entry) return res.status(404).send(renderRoleNotFound());
  res.send(renderRolePage(entry));
});

// ── Dynamic sitemap (static pages + one URL per job role) ────────
const STATIC_SITEMAP_PAGES = [
  { path: '/',                            changefreq: 'weekly',  priority: '1.0' },
  { path: '/signup.html',                 changefreq: 'monthly', priority: '0.9' },
  { path: '/qualify.html',                changefreq: 'monthly', priority: '0.8' },
  { path: '/categories.html',             changefreq: 'monthly', priority: '0.7' },
  { path: '/things-to-do.html',           changefreq: 'monthly', priority: '0.6' },
  { path: '/financial-wellbeing.html',    changefreq: 'monthly', priority: '0.6' },
  { path: '/mental-wellbeing.html',       changefreq: 'monthly', priority: '0.6' },
  { path: '/shopping-cards.html',         changefreq: 'monthly', priority: '0.6' },
  { path: '/e-learning.html',             changefreq: 'monthly', priority: '0.6' },
  { path: '/workforce-recognition.html',  changefreq: 'monthly', priority: '0.7' },
  { path: '/login.html',                  changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy.html',                changefreq: 'yearly',  priority: '0.3' },
  { path: '/t&cs',                        changefreq: 'yearly',  priority: '0.3' },
];

app.get('/sitemap.xml', (_req, res) => {
  const roleUrls = Object.keys(JOB_ROLE_BY_SLUG).map(slug => `  <url><loc>https://logicard.co.uk/logistics-rewards/${slug}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`);
  const staticUrls = STATIC_SITEMAP_PAGES.map(p => `  <url><loc>https://logicard.co.uk${p.path.replace(/&/g, '&amp;')}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...roleUrls].join('\n')}\n</urlset>`;
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/t&cs', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
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

// Extra outer wall while /member-offers is still pre-launch and has no real
// content — separate from and in addition to the normal login/verification
// flow underneath it. Override MEMBER_OFFERS_PREVIEW_PASSWORD in Railway to
// change or remove it later without a code change.
const MEMBER_OFFERS_PREVIEW_PASSWORD = process.env.MEMBER_OFFERS_PREVIEW_PASSWORD || 'LogicardTemp1';

function requirePreviewPassword(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Basic ')) {
    const decoded  = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const password = decoded.split(':').slice(1).join(':');
    if (password === MEMBER_OFFERS_PREVIEW_PASSWORD) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Logicard Member Offers Preview"');
  res.status(401).send('This page requires a preview password.');
}

// ── Member pages ───────────────────────────────────────────────
app.get('/member-offers', requirePreviewPassword, requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'member-offers.html'));
});

app.get('/member-dashboard', requirePreviewPassword, requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'member-dashboard.html'));
});

// Old URL, kept as a redirect so nothing already bookmarked/emailed breaks.
app.get('/members', requirePreviewPassword, requireAuth, (_req, res) => res.redirect('/member-offers'));

app.get('/api/offer-categories', requireAuth, (_req, res) => res.json(OFFER_CATEGORIES));

app.get('/report', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'report.html'));
});

app.get('/verify', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'verify.html'));
});

// ── Admin pages ────────────────────────────────────────────────
app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

app.get('/admin/offers', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-offers.html'));
});

app.get('/admin/verifications', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-verifications.html'));
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
function validOfferPayload(body) {
  const { merchantName, title, affiliateUrl, category } = body;
  if (!merchantName || !String(merchantName).trim()) return 'Merchant name is required.';
  if (!title || !String(title).trim()) return 'Title is required.';
  if (!affiliateUrl || !/^https?:\/\//i.test(affiliateUrl)) return 'Affiliate URL must start with http:// or https://.';
  if (category && !OFFER_CATEGORIES.includes(category)) return 'Invalid category.';
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
  const offer = await createOffer(req.body);
  res.json(offer);
});

app.put('/api/admin/offers/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer id.' });
  const error = validOfferPayload(req.body);
  if (error) return res.status(400).json({ error });
  const offer = await updateOffer(id, req.body);
  if (!offer) return res.status(404).json({ error: 'Offer not found.' });
  res.json(offer);
});

app.delete('/api/admin/offers/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid offer id.' });
  const deleted = await deleteOffer(id);
  if (!deleted) return res.status(404).json({ error: 'Offer not found.' });
  res.json({ success: true });
});

// ── Export OTP gate ────────────────────────────────────────────
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
  const headers = ['Membership #','First Name','Last Name','Email','Phone','Date of Birth','Company','Role','Address 1','Address 2','City','County','Country','Registered','Marketing Consent','Consent Date'];
  const keys    = ['membershipNumber','firstName','lastName','email','phone','dateOfBirth','companyName','role','addressLine1','addressLine2','city','county','country','createdAt','marketingConsent','marketingConsentAt'];
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
        <p style="margin:6px 0 0;font-size:11px;color:#bbb">© 2026 Logicard · <a href="https://logicard.co.uk" style="color:#FFB300;text-decoration:none">logicard.co.uk</a></p>
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
      <p style="margin:6px 0 0;font-size:11px;color:#bbb">© 2026 Logicard · <a href="https://logicard.co.uk" style="color:#FFB300;text-decoration:none">logicard.co.uk</a></p>
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

// ── Offers (closed-group — verified members only) ───────────────
app.get('/api/offers', requireAuth, requireVerified, async (req, res) => {
  const offers = await getActiveOffers();
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
  const { companyName, role, roleCategory, roleCategoryOther, firstName, lastName, email, phone,
          addressLine1, addressLine2, town, city, county, country, password, gdprConsent } = data;

  const required = { companyName, role, firstName, lastName, email, phone, town, city };
  for (const [field, value] of Object.entries(required)) {
    if (!value || !String(value).trim()) return `Missing required field: ${field}`;
  }
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!gdprConsent) return 'You must accept the privacy policy to continue.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';

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
  const { companyName, role, roleCategory, roleCategoryOther, firstName, lastName, email, phone, dateOfBirth,
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
      dateOfBirth: dateOfBirth || null,
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

const PURGE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

app.listen(PORT, () => {
  console.log(`Logicard running at http://localhost:${PORT}`);
  if (!process.env.SESSION_SECRET)      console.warn('  > SESSION_SECRET not set — using insecure default. Set this in Railway Variables.');
  if (!process.env.ADMIN_EMAIL)         console.warn('  > ADMIN_EMAIL not set — admin OTP and member reports will not be delivered.');
  if (!process.env.ADMIN_PASSWORD)      console.warn('  > ADMIN_PASSWORD not set — admin panel is inaccessible.');
  if (!process.env.R2_BUCKET_NAME)      console.warn('  > R2_* env vars not set — verification documents are being saved to local disk (not persistent on Railway).');

  verifyResendConnection();

  // Give the DB pool a moment on cold start, then run daily thereafter.
  setTimeout(runVerificationPurge, 60 * 1000);
  setInterval(runVerificationPurge, PURGE_SWEEP_INTERVAL_MS);
});

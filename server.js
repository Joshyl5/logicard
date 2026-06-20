require('dotenv').config();

const express   = require('express');
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const path      = require('path');
const { Resend } = require('resend');
const {
  createMember, emailExists, findMemberByEmail,
  getMemberByNumber, getAllMembers,
  setResetToken, findMemberByResetToken, clearResetToken,
  resetMonthlyEntries, recordGiveawayWinner, getGiveawayHistory,
} = require('./database');

const app    = express();
const PORT   = process.env.PORT || 3000;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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
        <p style="margin:4px 0;color:#5f6d82;font-size:14px">✅ First year free — then just £10/year</p>
      </div>
      <div style="text-align:center">
        <a href="https://logicard.co.uk/login.html" style="background:#FFB300;color:#071d40;padding:16px 40px;text-decoration:none;border-radius:6px;font-weight:900;font-size:16px;display:inline-block">Browse Your Deals →</a>
      </div>
    </div>
    <div style="padding:28px 36px;text-align:center;background:#f0f2f7;border-top:1px solid #e2e6ee">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#071d40">Need help?</p>
      <p style="margin:0 0 16px;font-size:13px;color:#5f6d82">Visit <a href="https://logicard.co.uk" style="color:#FFB300;text-decoration:none;font-weight:700">logicard.co.uk</a> for support and FAQs.</p>
      <div style="border-top:1px solid #e2e6ee;margin:16px 0;padding-top:16px">
        <p style="margin:0;font-size:11px;color:#aaa">Please do not reply to this email — this mailbox is not monitored.</p>
        <p style="margin:6px 0 0;font-size:11px;color:#bbb">© 2026 Logicard · You received this because you registered at logicard.co.uk</p>
      </div>
    </div>
  </div>`;

  try {
    await resend.emails.send({
      from:     'Logicard <welcome@logicard.co.uk>',
      to:       member.email,
      subject:  `Welcome to Logicard, ${member.firstName}! Your membership #${member.membershipNumber} is active`,
      reply_to: 'noreply@logicard.co.uk',
      html,
    });
    console.log(`Welcome email sent to ${member.email}`);
  } catch (err) {
    console.error('Welcome email failed:', err.message);
  }
}


// ── Rate limiters ──────────────────────────────────────────────
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

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
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

app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session && req.session.membershipNumber) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Admin access required' });
  res.redirect('/admin-login.html');
}

// ── Member pages ───────────────────────────────────────────────
app.get('/members', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'members.html'));
});

app.get('/report', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'report.html'));
});

// ── Admin pages ────────────────────────────────────────────────
app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

// ── Member auth ────────────────────────────────────────────────
app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const member = await findMemberByEmail(email);
  if (!member || !member.passwordHash) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!bcrypt.compareSync(password, member.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!member.verified) return res.status(403).json({ error: 'Your account is pending verification.' });

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
  res.json({
    membershipNumber: member.membershipNumber,
    firstName:        member.firstName,
    lastName:         member.lastName,
    companyName:      member.companyName,
    totalReferrals:   member.totalReferrals  || 0,
    monthlyEntries:   member.monthlyEntries  || 0,
  });
});

// ── Admin auth ─────────────────────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts. Please wait 15 minutes.' },
});

app.post('/api/admin/login', adminLimiter, (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) return res.status(503).json({ error: 'Admin access is not configured.' });
  if (!password || password !== adminPass) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  req.session.isAdmin = true;
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Admin API ──────────────────────────────────────────────────
app.get('/api/admin/members', requireAdmin, async (_req, res) => {
  const members = (await getAllMembers()).map(({ passwordHash, resetToken, resetTokenExpiry, ...safe }) => safe);
  res.json(members);
});

app.get('/api/admin/export.csv', requireAdmin, async (_req, res) => {
  const members = await getAllMembers();
  const headers = ['Membership #','First Name','Last Name','Email','Phone','Date of Birth','Company','Role','Address 1','Address 2','City','County','Postcode','Country','Registered','Marketing Consent','Consent Date'];
  const keys    = ['membershipNumber','firstName','lastName','email','phone','dateOfBirth','companyName','role','addressLine1','addressLine2','city','county','postcode','country','createdAt','marketingConsent','marketingConsentAt'];
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
    .map(({ passwordHash, resetToken, resetTokenExpiry, ...safe }) => safe)
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
        subject:  `🎉 You've won the Logicard monthly giveaway!`,
        reply_to: 'noreply@logicard.co.uk',
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
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Member</td><td style="padding:10px 14px;color:#333">${memberName}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Membership #</td><td style="padding:10px 14px;color:#1a6cc8;font-weight:700">#${membershipNumber}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Email</td><td style="padding:10px 14px;color:#333">${member ? member.email : '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Type</td><td style="padding:10px 14px;color:#333">${issueType}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Title</td><td style="padding:10px 14px;color:#333">${issueTitle || '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40;vertical-align:top">Description</td><td style="padding:10px 14px;color:#333;line-height:1.6">${issueDesc.replace(/\n/g, '<br/>')}</td></tr>
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
        to:      process.env.ADMIN_EMAIL || 'jplawrance@hotmail.co.uk',
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
app.post('/api/contact', async (req, res) => {
  const { name, email, title, company, phone, newsletterOptIn } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">New Contact Form Submission</p>
    </div>
    <div style="padding:32px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 20px;font-size:18px">Someone got in touch via logicard.co.uk</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Full Name</td><td style="padding:10px 14px;color:#333">${name}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Email</td><td style="padding:10px 14px;color:#1a6cc8">${email}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Job Title</td><td style="padding:10px 14px;color:#333">${title || '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Company</td><td style="padding:10px 14px;color:#333">${company || '—'}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Phone</td><td style="padding:10px 14px;color:#333">${phone || '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Newsletter</td><td style="padding:10px 14px;color:#333">${newsletterOptIn ? '✅ Yes' : 'No'}</td></tr>
      </table>
    </div>
    <div style="padding:18px 36px;text-align:center;background:#f4f7fb">
      <p style="margin:0;font-size:12px;color:#999">© 2026 Logicard — contact form submission from logicard.co.uk</p>
    </div>
  </div>`;

  try {
    if (resend) {
      await resend.emails.send({
        from:     'Logicard <welcome@logicard.co.uk>',
        to:       process.env.ADMIN_EMAIL || 'jplawrance@hotmail.co.uk',
        reply_to: email,
        subject:  `New contact from ${name}${company ? ` — ${company}` : ''}`,
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

  const token  = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + 60 * 60 * 1000;
  await setResetToken(member.email, token, expiry);

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
        reply_to: 'noreply@logicard.co.uk',
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

  const member = await findMemberByResetToken(token);
  if (!member) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  if (Date.now() > member.resetTokenExpiry) return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });

  const newHash = bcrypt.hashSync(password, 10);
  await clearResetToken(member.email, newHash);

  res.json({ success: true });
});

// ── Offers ─────────────────────────────────────────────────────
app.get('/api/offers', requireAuth, (_req, res) => res.json([]));

// ── Signup ─────────────────────────────────────────────────────
app.post('/api/signup', signupLimiter, async (req, res) => {
  const { companyName, role, firstName, lastName, email, phone, dateOfBirth,
          addressLine1, addressLine2, city, county, postcode, country,
          password, gdprConsent, marketingConsent, ref } = req.body;

  const required = { companyName, role, firstName, lastName, email, phone, addressLine1, city, postcode, country };
  for (const [field, value] of Object.entries(required)) {
    if (!value || !String(value).trim()) return res.status(400).json({ error: `Missing required field: ${field}` });
  }
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!gdprConsent) return res.status(400).json({ error: 'You must accept the privacy policy to continue.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (await emailExists(email)) return res.status(409).json({ error: 'An account with this email address already exists.' });

  try {
    const { membershipNumber } = await createMember({
      companyName: companyName.trim(), role: role.trim(),
      firstName: firstName.trim(),     lastName: lastName.trim(),
      email: email.trim().toLowerCase(), phone: phone.trim(),
      dateOfBirth: dateOfBirth || null,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : null,
      city: city.trim(), county: county ? county.trim() : null,
      postcode: postcode.trim().toUpperCase(), country: country.trim(),
      password, gdprConsent,
      marketingConsent: !!marketingConsent,
      referredBy: ref || null,
    });

    res.json({ success: true, membershipNumber });

    // Send welcome email asynchronously (don't block the response)
    const saved = await findMemberByEmail(email.trim().toLowerCase());
    if (saved) sendWelcomeEmail(saved);

  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Logicard running at http://localhost:${PORT}`);
  if (!resend) console.log('  > RESEND_API_KEY not set — emails disabled.');
});

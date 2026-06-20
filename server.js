require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const path    = require('path');
const { Resend } = require('resend');
const {
  createMember, emailExists, findMemberByEmail,
  getMemberByNumber, getAllMembers,
  setResetToken, findMemberByResetToken, clearResetToken,
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

// ── Admin notification email ───────────────────────────────────
async function sendAdminNotificationEmail(member) {
  if (!resend) return;
  const date = new Date(member.createdAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
  const addr = [member.addressLine1, member.addressLine2, member.city, member.county, member.postcode, member.country].filter(Boolean).join(', ');
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
      <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">New Member Registration</p>
    </div>
    <div style="padding:32px 36px;background:#fff">
      <h2 style="color:#071d40;margin:0 0 6px">New member registered!</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Membership No.</td><td style="padding:10px 14px;color:#1a6cc8;font-weight:700">#${member.membershipNumber}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Full Name</td><td style="padding:10px 14px">${member.firstName} ${member.lastName}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Email</td><td style="padding:10px 14px">${member.email}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Phone</td><td style="padding:10px 14px">${member.phone}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Company</td><td style="padding:10px 14px">${member.companyName}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Job Title</td><td style="padding:10px 14px">${member.role}</td></tr>
        <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Address</td><td style="padding:10px 14px">${addr}</td></tr>
        <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Registered</td><td style="padding:10px 14px">${date}</td></tr>
      </table>
      <div style="margin-top:24px;text-align:center">
        <a href="https://logicard.co.uk/admin" style="background:#071d40;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;display:inline-block">View Admin Dashboard →</a>
      </div>
    </div>
    <div style="padding:18px 36px;text-align:center;background:#f4f7fb">
      <p style="margin:0;font-size:12px;color:#999">© 2026 Logicard — automated notification</p>
    </div>
  </div>`;

  try {
    await resend.emails.send({
      from:    'Logicard <welcome@logicard.co.uk>',
      to:      process.env.ADMIN_EMAIL || 'jplawrance@hotmail.co.uk',
      subject: `New Logicard Member — #${member.membershipNumber} ${member.firstName} ${member.lastName}`,
      html,
    });
  } catch (err) {
    console.error('Admin notification email failed:', err.message);
  }
}

// ── Offers data ────────────────────────────────────────────────
const OFFERS = [
  { id:1, category:'Fuel & Fleet', categoryKey:'fuel', colors:['#f59e0b','#d97706'], title:'15% Off All Fuel Purchases', description:'Save on every fill-up at over 3,200 participating UK forecourts nationwide. Valid on all fuel grades including diesel, petrol and AdBlue. Simply show your Logicard membership number when you pay.', saving:'15%', originalPrice:null, price:null, priceLabel:'ongoing member saving', tag:'Most Popular', featured:true, expires:'2026-12-31' },
  { id:2, category:'Hotels', categoryKey:'hotels', colors:['#6366f1','#4338ca'], title:'20% Off UK Business Hotels', description:'Exclusive member rates at 800+ UK hotels. Ideal for overnight driver stays and business travel. Free cancellation available on most bookings.', saving:'20%', originalPrice:89, price:71.20, priceLabel:'per night from', tag:null, featured:false, expires:'2026-09-30' },
  { id:3, category:'Dining', categoryKey:'dining', colors:['#ef4444','#dc2626'], title:'2-for-1 Meals at Motorway Services', description:'Show your Logicard membership at participating motorway service restaurants for a complimentary second meal with every purchase.', saving:'50%', originalPrice:12.99, price:6.50, priceLabel:'per person from', tag:'Driver Favourite', featured:false, expires:'2026-08-31' },
  { id:4, category:'Technology', categoryKey:'technology', colors:['#06b6d4','#0891b2'], title:'3 Months Free Fleet Tracking', description:"Claim 3 months free on our partner's professional GPS fleet management platform. Track vehicles, manage routes and cut fuel costs from day one.", saving:'FREE', originalPrice:149, price:0, priceLabel:'worth', tag:'Limited Time', featured:false, expires:'2026-07-31' },
  { id:5, category:'Maintenance', categoryKey:'maintenance', colors:['#8b5cf6','#7c3aed'], title:'25% Off Tyre Fitting & Balancing', description:'Member-exclusive pricing at 500+ approved tyre fitting centres across the UK. All major brands in stock, same-day fitting at most locations.', saving:'25%', originalPrice:80, price:60, priceLabel:'per tyre fitted from', tag:null, featured:false, expires:'2026-10-31' },
  { id:6, category:'Shopping', categoryKey:'shopping', colors:['#10b981','#059669'], title:'£50 Off at Halfords Business', description:'Exclusive £50 voucher for Logicard members at Halfords Business. Redeemable on tools, accessories, safety equipment and vehicle care products.', saving:'£50', originalPrice:null, price:null, priceLabel:'off your next order', tag:'New Offer', featured:false, expires:'2026-08-15' },
  { id:7, category:'Travel', categoryKey:'travel', colors:['#0ea5e9','#0284c7'], title:'Complimentary Airport Lounge Access', description:'Enjoy free airport lounge access at 30+ UK airports. Relax with complimentary Wi-Fi, refreshments and a quiet workspace before you fly.', saving:'FREE', originalPrice:35, price:0, priceLabel:'per visit worth', tag:null, featured:false, expires:'2026-12-31' },
  { id:8, category:'Finance', categoryKey:'finance', colors:['#84cc16','#65a30d'], title:'Exclusive Fleet Insurance Rates', description:'Access preferred fleet and commercial vehicle insurance rates from leading UK providers. Available for fleets from 1 to 500+ vehicles.', saving:'Up to 30%', originalPrice:null, price:null, priceLabel:'potential saving', tag:'Members Only', featured:false, expires:'2026-12-31' },
  { id:9, category:'Dining', categoryKey:'dining', colors:['#f97316','#ea580c'], title:'15% Off Deliveroo Business', description:'Save 15% on all Deliveroo Business orders for team meals and driver refreshments. Valid on orders over £30 at participating restaurants.', saving:'15%', originalPrice:null, price:null, priceLabel:'off every order', tag:null, featured:false, expires:'2026-09-30' },
];

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'logicard-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 },
}));
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

// ── Admin pages ────────────────────────────────────────────────
app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-dashboard.html'));
});

// ── Member auth ────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const member = findMemberByEmail(email);
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

app.get('/api/me', requireAuth, (req, res) => {
  const member = getMemberByNumber(req.session.membershipNumber);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ membershipNumber: member.membershipNumber, firstName: member.firstName, lastName: member.lastName, companyName: member.companyName });
});

// ── Admin auth ─────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'LogicardAdmin2026!';
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
app.get('/api/admin/members', requireAdmin, (_req, res) => {
  const members = getAllMembers().map(({ passwordHash, ...safe }) => safe);
  res.json(members);
});

app.get('/api/admin/export.csv', requireAdmin, (_req, res) => {
  const members = getAllMembers();
  const headers = ['Membership #','First Name','Last Name','Email','Phone','Date of Birth','Company','Role','Address 1','Address 2','City','County','Postcode','Country','Registered'];
  const keys    = ['membershipNumber','firstName','lastName','email','phone','dateOfBirth','companyName','role','addressLine1','addressLine2','city','county','postcode','country','createdAt'];
  const escape  = v => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`;
  const rows    = members.map(m => keys.map(k => escape(m[k])).join(','));
  const csv     = '﻿' + [headers.map(h => `"${h}"`).join(','), ...rows].join('\r\n');

  const filename = `logicard-members-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Password reset ─────────────────────────────────────────────
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const member = findMemberByEmail(email.trim().toLowerCase());
  // Always return success to prevent email enumeration
  if (!member) return res.json({ success: true });

  const token  = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + 60 * 60 * 1000; // 1 hour
  setResetToken(member.email, token, expiry);

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

  const member = findMemberByResetToken(token);
  if (!member) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  if (Date.now() > member.resetTokenExpiry) return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });

  const newHash = bcrypt.hashSync(password, 10);
  clearResetToken(member.email, newHash);

  res.json({ success: true });
});

// ── Offers ─────────────────────────────────────────────────────
app.get('/api/offers', requireAuth, (_req, res) => res.json(OFFERS));

// ── Signup ─────────────────────────────────────────────────────
app.post('/api/signup', async (req, res) => {
  const { companyName, role, firstName, lastName, email, phone, dateOfBirth,
          addressLine1, addressLine2, city, county, postcode, country, password, gdprConsent } = req.body;

  const required = { companyName, role, firstName, lastName, email, phone, addressLine1, city, postcode, country };
  for (const [field, value] of Object.entries(required)) {
    if (!value || !String(value).trim()) return res.status(400).json({ error: `Missing required field: ${field}` });
  }
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!gdprConsent) return res.status(400).json({ error: 'You must accept the privacy policy to continue.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (emailExists(email)) return res.status(409).json({ error: 'An account with this email address already exists.' });

  try {
    const { membershipNumber } = createMember({
      companyName: companyName.trim(), role: role.trim(),
      firstName: firstName.trim(),    lastName: lastName.trim(),
      email: email.trim().toLowerCase(), phone: phone.trim(),
      dateOfBirth: dateOfBirth || null,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : null,
      city: city.trim(), county: county ? county.trim() : null,
      postcode: postcode.trim().toUpperCase(), country: country.trim(),
      password, gdprConsent,
    });

    res.json({ success: true, membershipNumber });

    // Send email notification asynchronously (don't block response)
    const { findMemberByEmail: lookup } = require('./database');
    const saved = lookup(email.trim().toLowerCase());
    if (saved) {
      sendWelcomeEmail(saved);
      sendAdminNotificationEmail(saved);
    }

  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Logicard running at http://localhost:${PORT}`);
  if (!resend) console.log('  > RESEND_API_KEY not set — emails disabled.');
});

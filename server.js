require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const path       = require('path');
const {
  createMember, emailExists, findMemberByEmail,
  getMemberByNumber, getAllMembers,
} = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Email transporter ──────────────────────────────────────────
const emailReady = process.env.EMAIL_USER && process.env.EMAIL_PASS &&
                   process.env.EMAIL_PASS !== 'YOUR_PASSWORD_HERE';

const transporter = emailReady ? nodemailer.createTransport({
  host:   'smtp-mail.outlook.com',
  port:   587,
  secure: false,
  auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  tls:    { rejectUnauthorized: false },
}) : null;

async function sendNewMemberEmail(member) {
  if (!transporter) {
    console.log('Email not configured — skipping notification for member', member.membershipNumber);
    return;
  }
  const date = new Date(member.createdAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
  const addr = [member.addressLine1, member.addressLine2, member.city, member.county, member.postcode, member.country]
    .filter(Boolean).join(', ');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f7fb;padding:0;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#0d3b80,#1a6cc8);padding:32px 36px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">LOGICARD</h1>
        <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:14px">New Member Registration</p>
      </div>
      <div style="padding:32px 36px;background:#fff">
        <h2 style="color:#071d40;margin:0 0 6px">New member registered!</h2>
        <p style="color:#5f6d82;margin:0 0 28px">A new member has signed up for Logicard.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40;width:38%">Membership No.</td><td style="padding:10px 14px;color:#1a6cc8;font-weight:700">#${member.membershipNumber}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Full Name</td><td style="padding:10px 14px;color:#333">${member.firstName} ${member.lastName}</td></tr>
          <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Email</td><td style="padding:10px 14px;color:#333">${member.email}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Phone</td><td style="padding:10px 14px;color:#333">${member.phone}</td></tr>
          <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Company</td><td style="padding:10px 14px;color:#333">${member.companyName}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Job Title</td><td style="padding:10px 14px;color:#333">${member.role}</td></tr>
          <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Address</td><td style="padding:10px 14px;color:#333">${addr}</td></tr>
          <tr><td style="padding:10px 14px;font-weight:700;color:#071d40">Date of Birth</td><td style="padding:10px 14px;color:#333">${member.dateOfBirth || '—'}</td></tr>
          <tr style="background:#f4f7fb"><td style="padding:10px 14px;font-weight:700;color:#071d40">Registered</td><td style="padding:10px 14px;color:#333">${date}</td></tr>
        </table>
        <div style="margin-top:28px;padding:16px 20px;background:#e8f4fd;border-radius:8px;text-align:center">
          <p style="margin:0;color:#0d3b80;font-size:13px">View all members in the <a href="http://localhost:${PORT}/admin" style="color:#1a6cc8">Admin Dashboard</a></p>
        </div>
      </div>
      <div style="padding:18px 36px;text-align:center;background:#f4f7fb">
        <p style="margin:0;font-size:12px;color:#999">© 2026 Logicard — this is an automated notification</p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from:    `"Logicard" <${process.env.EMAIL_USER}>`,
      to:      process.env.EMAIL_TO,
      subject: `New Logicard Member — #${member.membershipNumber} ${member.firstName} ${member.lastName}`,
      html,
    });
    console.log(`Email sent for member #${member.membershipNumber}`);
  } catch (err) {
    console.error('Email send failed:', err.message);
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
    if (saved) sendNewMemberEmail(saved);

  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Logicard running at http://localhost:${PORT}`);
  if (!emailReady) console.log('  > Email not configured. Edit .env to enable signup notifications.');
});

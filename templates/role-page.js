const { slugify } = require('../job-roles');

const NAV_HEAD = `
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Raleway:wght@300;400;700;800&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    :root{--orange:#FFB300;--orange-dark:#E09A00;--navy:#071d40;--navy-deep:#04040d;--navy-mid:#0d3b80;--white:#fff;--text-muted:#666}
    body{font-family:'Inter',Arial,sans-serif;color:var(--navy);background:var(--white)}
    .rp-hero{background:linear-gradient(140deg,#04040d 0%,#071d40 45%,#0d3b80 100%);color:#fff;padding:64px 24px;text-align:center}
    .rp-hero .eyebrow{color:var(--orange);font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:13px}
    .rp-hero h1{font-size:clamp(28px,4vw,42px);font-weight:900;margin:12px 0;letter-spacing:-0.5px}
    .rp-hero p{color:rgba(255,255,255,0.75);font-size:17px;max-width:640px;margin:0 auto}
    .rp-body{max-width:720px;margin:0 auto;padding:48px 24px;line-height:1.7;font-size:16px}
    .rp-cta{display:inline-block;background:var(--orange);color:var(--navy);font-weight:800;padding:16px 36px;border-radius:6px;text-decoration:none;margin-top:16px}
    .rp-cta:hover{background:var(--orange-dark)}
    .rp-back{display:block;text-align:center;padding:24px;color:var(--text-muted);text-decoration:none}
  </style>`;

function renderRolePage({ role, category }) {
  const slug        = slugify(role);
  const title        = `Logicard Discounts for ${role} — Logistics Rewards`;
  const description  = `${role} in the ${category} sector? Logicard is the free discount card built for UK logistics workers like you — save on fuel, hotels, food and more.`;
  const canonical     = `https://logicard.co.uk/logistics-rewards/${slug}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonical}" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${title}",
    "url": "${canonical}",
    "description": "${description}",
    "isPartOf": { "@id": "https://logicard.co.uk/#website" }
  }
  </script>${NAV_HEAD}
</head>
<body>
  <section class="rp-hero">
    <span class="eyebrow">${category}</span>
    <h1>Logistics Rewards for ${role}s</h1>
    <p>${description}</p>
  </section>
  <div class="rp-body">
    <p>If you work as a <strong>${role}</strong> anywhere in the UK logistics industry, you qualify for a free Logicard membership. Logicard gives everyone across ${category.toLowerCase()} — and every other part of the sector — access to exclusive discounts on fuel, hotels, food, and everyday essentials, plus wellbeing support built for the realities of working in logistics.</p>
    <div style="text-align:center;margin-top:32px">
      <a class="rp-cta" href="/signup.html?role=${encodeURIComponent(role)}">Claim your free Logicard →</a>
    </div>
  </div>
  <a class="rp-back" href="/qualify.html">← See all logistics roles that qualify</a>
</body>
</html>`;
}

function renderRoleNotFound() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Role Not Found — Logicard</title>
  <meta name="robots" content="noindex" />${NAV_HEAD}
</head>
<body>
  <section class="rp-hero">
    <h1>We couldn't find that role</h1>
    <p>Browse the full list of logistics roles that qualify for a free Logicard membership.</p>
  </section>
  <div class="rp-body" style="text-align:center">
    <a class="rp-cta" href="/qualify.html">Check Your Eligibility →</a>
  </div>
</body>
</html>`;
}

module.exports = { renderRolePage, renderRoleNotFound };

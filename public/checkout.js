'use strict';

// ── Load stored signup data ────────────────────────────────────
const stored = (() => {
  try { return JSON.parse(sessionStorage.getItem('logicardCheckout') || 'null'); }
  catch { return null; }
})();

if (!stored || !stored.email) {
  window.location.href = '/signup.html';
}

// ── Pre-fill contact info ──────────────────────────────────────
document.getElementById('coEmail').value = stored.email || '';
document.getElementById('coName').value  = [stored.firstName, stored.lastName].filter(Boolean).join(' ');

// ── Promo code state ───────────────────────────────────────────
let isFree        = false;
let appliedCode   = null;

const promoToggle = document.getElementById('promoToggle');
const promoRow    = document.getElementById('promoRow');
const promoInput  = document.getElementById('promoInput');
const promoApply  = document.getElementById('promoApply');
const promoMsg    = document.getElementById('promoMsg');
const discountRow = document.getElementById('discountRow');
const payBtn      = document.getElementById('payBtn');
const payLegal    = document.getElementById('payLegal');
const paySection  = document.getElementById('paymentSection');
const priceBig    = document.getElementById('priceBig');
const totalDue    = document.getElementById('totalDue');

promoToggle.addEventListener('click', () => {
  const open = promoRow.classList.contains('open');
  promoRow.classList.toggle('open', !open);
  promoToggle.textContent = open ? '+ Add promotion code' : '− Hide';
  if (!open) promoInput.focus();
});

promoApply.addEventListener('click', applyPromo);
promoInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } });
promoInput.addEventListener('input', () => { promoInput.value = promoInput.value.toUpperCase(); });

async function applyPromo() {
  const code = promoInput.value.trim();
  if (!code) return;

  promoApply.textContent = 'Checking…';
  promoApply.disabled    = true;
  promoMsg.textContent   = '';
  promoMsg.className     = 'promo-msg';

  try {
    const res  = await fetch('/api/checkout/validate-promo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const json = await res.json();

    if (!res.ok) {
      promoMsg.textContent = json.error || 'Invalid promotion code.';
      promoMsg.classList.add('error');
      promoApply.textContent = 'Apply';
      promoApply.disabled    = false;
      return;
    }

    appliedCode = json.code;
    isFree      = json.freeYear && json.discountPct === 100;

    promoApply.textContent = '✓ Applied';
    promoMsg.innerHTML     = `<span style="color:#4ade80">✓ ${json.label} — <strong>£10.00 discount applied</strong></span>`;

    discountRow.style.display = 'flex';
    document.getElementById('discountLabel').textContent = json.label;

    if (isFree) {
      priceBig.textContent = '£0.00';
      totalDue.textContent = '£0.00';
      paySection.style.display = 'none';
      payBtn.textContent   = 'Activate free membership';
      payLegal.textContent = 'By completing registration your Logicard membership will be activated with no charge for the first year. Your membership renews at £10/year from year 2.';
    }

  } catch {
    promoMsg.textContent = 'Error checking code. Please try again.';
    promoMsg.classList.add('error');
    promoApply.textContent = 'Apply';
    promoApply.disabled    = false;
  }
}

// ── Stripe setup ───────────────────────────────────────────────
let stripe      = null;
let cardElement = null;

(async () => {
  try {
    const res  = await fetch('/api/checkout/config');
    const { publishableKey } = await res.json();
    if (!publishableKey) return;

    stripe = Stripe(publishableKey);
    const elements = stripe.elements({ locale: 'en-GB' });

    cardElement = elements.create('card', {
      style: {
        base: {
          color: '#ffffff', fontFamily: '"Inter", sans-serif',
          fontSize: '15px', fontSmoothing: 'antialiased',
          '::placeholder': { color: 'rgba(255,255,255,0.35)' },
          iconColor: '#FFB300',
        },
        invalid: { color: '#f87171', iconColor: '#f87171' },
      },
    });
    cardElement.mount('#card-element');
    cardElement.addEventListener('change', e => {
      document.getElementById('card-errors').textContent = e.error ? e.error.message : '';
    });
  } catch (err) {
    console.warn('Stripe not configured:', err.message);
  }
})();

// ── Payment submit ─────────────────────────────────────────────
payBtn.addEventListener('click', async () => {
  payBtn.disabled = true;
  const origLabel = payBtn.textContent;
  payBtn.textContent = isFree ? 'Activating…' : 'Processing payment…';

  const errEl = document.getElementById('card-errors');
  errEl.textContent = '';

  try {
    if (isFree) {
      const res  = await fetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stored, promoCode: appliedCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Registration failed.');
      sessionStorage.removeItem('logicardCheckout');
      window.location.href = `/signup.html?checkout=success&mn=${json.membershipNumber}`;
      return;
    }

    if (!stripe || !cardElement) throw new Error('Payment system unavailable. Please try again later or contact support.');

    const intentRes = await fetch('/api/checkout/create-intent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: stored.email }),
    });
    const { clientSecret, error: intentErr } = await intentRes.json();
    if (intentErr) throw new Error(intentErr);

    const { paymentIntent, error: stripeErr } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name:  [stored.firstName, stored.lastName].filter(Boolean).join(' '),
          email: stored.email,
        },
      },
    });
    if (stripeErr) throw new Error(stripeErr.message);

    const completeRes  = await fetch('/api/checkout/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...stored, paymentIntentId: paymentIntent.id }),
    });
    const completeJson = await completeRes.json();
    if (!completeRes.ok) throw new Error(completeJson.error || 'Account setup failed. Please contact support.');

    sessionStorage.removeItem('logicardCheckout');
    window.location.href = `/signup.html?checkout=success&mn=${completeJson.membershipNumber}`;

  } catch (err) {
    errEl.textContent  = err.message;
    payBtn.disabled    = false;
    payBtn.textContent = origLabel;
  }
});

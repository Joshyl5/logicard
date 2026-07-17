const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { Jimp, JimpMime } = require('jimp');

const MAX_IMAGE_WIDTH = 1600; // plenty of resolution for a human reviewer to read a badge or payslip
const JPEG_QUALITY     = 78;

// Downscale + recompress phone photos before they ever reach storage — a raw
// phone JPEG/PNG can be 3-8MB, most of which is resolution nobody reviewing
// a name badge needs. PDFs and WebP pass through untouched (Jimp's default
// build doesn't decode WebP, and PDFs aren't rasterized here).
async function optimizeImage(buffer, mimeType) {
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') return buffer;

  try {
    const image = await Jimp.read(buffer);
    if (image.bitmap.width > MAX_IMAGE_WIDTH) {
      image.resize({ w: MAX_IMAGE_WIDTH });
    }

    const optimized = mimeType === 'image/jpeg'
      ? await image.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY })
      : await image.getBuffer(JimpMime.png);

    // A few images (already small/simple) can come out slightly larger after
    // re-encoding — only keep the optimized version if it's actually smaller.
    return optimized.length < buffer.length ? optimized : buffer;
  } catch (err) {
    console.warn('[storage] Image optimization skipped (unreadable image):', err.message);
    return buffer;
  }
}

// Cloudflare R2 is S3-compatible, has no egress fees, and a 10GB free tier —
// the cheapest fit for a low-volume verification-document store.
const R2_CONFIGURED = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
);

const LOCAL_ROOT = path.join(__dirname, 'uploads');

let s3Client = null;
if (R2_CONFIGURED) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
} else {
  fs.mkdirSync(LOCAL_ROOT, { recursive: true });
}

function localPathFor(key) {
  return path.join(LOCAL_ROOT, key.replace(/\//g, path.sep));
}

// Bucket stays private — proof-of-employment documents can contain payslips
// and other sensitive personal data, so nothing is ever exposed via a public URL.
async function uploadVerificationFile(buffer, { membershipNumber, mimeType, extension }) {
  const optimizedBuffer = await optimizeImage(buffer, mimeType);
  const key = `verifications/${membershipNumber}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  if (R2_CONFIGURED) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: optimizedBuffer,
      ContentType: mimeType,
    }));
  } else {
    const dest = localPathFor(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, optimizedBuffer);
    console.warn('[storage] R2 not configured — file saved to local disk. This is NOT persistent on Railway; set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME before going live.');
  }

  return key;
}

// Short-lived signed URL — only ever handed to an authenticated admin, never stored or emailed.
async function getSignedViewUrl(key, expiresInSeconds = 300) {
  if (R2_CONFIGURED) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }), { expiresIn: expiresInSeconds });
  }
  return `/api/admin/verifications/local-file?key=${encodeURIComponent(key)}`;
}

function readLocalFile(key) {
  const p = localPathFor(key);
  return fs.existsSync(p) ? p : null;
}

async function deleteFile(key) {
  if (R2_CONFIGURED) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  } else {
    const p = localPathFor(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

module.exports = { uploadVerificationFile, getSignedViewUrl, readLocalFile, deleteFile, R2_CONFIGURED };

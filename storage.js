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

// UPLOADS_DIR lets local-disk storage point at a Railway Volume mount
// (e.g. /data) instead of the app's own ephemeral container filesystem —
// a volume survives redeploys/restarts, so this is a genuine alternative
// to R2, not just a local-dev convenience. Unset, it falls back to a
// folder inside the app itself, which does NOT survive a Railway redeploy.
const UPLOADS_ROOT = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, 'uploads');
const UPLOADS_PERSISTENT = !!process.env.UPLOADS_DIR;
const LOCAL_ROOT  = UPLOADS_ROOT;
const PUBLIC_ROOT = path.join(UPLOADS_ROOT, 'public');

// Where public uploads (logos, deal images) will genuinely survive a
// redeploy. On Railway, UPLOADS_DIR alone isn't enough: a Volume must be
// mounted at (or above) it, which Railway reports as
// RAILWAY_VOLUME_MOUNT_PATH. Off Railway (local dev) the disk is permanent.
function publicUploadsPermanent() {
  if (R2_CONFIGURED) return { ok: true };
  if (!process.env.RAILWAY_ENVIRONMENT) return { ok: true };
  if (!UPLOADS_PERSISTENT) return { ok: false, reason: 'UPLOADS_DIR is not set in Railway Variables.' };
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount) return { ok: false, reason: 'No Railway Volume is mounted on this service (or the change has not been deployed yet).' };
  const rel = path.relative(path.resolve(mount), UPLOADS_ROOT);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, reason: 'UPLOADS_DIR (' + UPLOADS_ROOT + ') is not inside the Volume mount path (' + mount + ').' };
  return { ok: true };
}

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
  fs.mkdirSync(PUBLIC_ROOT, { recursive: true });
}

// path.join alone doesn't stop a key like "../../../etc/passwd" from resolving
// outside LOCAL_ROOT — this is what's served back to an admin session, so a
// crafted key must never be able to escape the uploads directory.
function localPathFor(key) {
  const resolved = path.join(LOCAL_ROOT, key.replace(/\//g, path.sep));
  const rootWithSep = LOCAL_ROOT.endsWith(path.sep) ? LOCAL_ROOT : LOCAL_ROOT + path.sep;
  if (!resolved.startsWith(rootWithSep)) return null;
  return resolved;
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
    if (!UPLOADS_PERSISTENT) {
      console.warn('[storage] R2 not configured and UPLOADS_DIR not set — file saved to a folder that does NOT survive a Railway redeploy. Either configure R2_* or set UPLOADS_DIR to a Railway Volume mount path.');
    }
  }

  return key;
}

// Unlike uploadVerificationFile, this bucket path is meant to be PUBLIC —
// brand logos are shown to every visitor on the Partnerships page, not
// gated behind a signed URL. Requires R2_PUBLIC_URL_BASE (the bucket's
// public r2.dev URL or a connected custom domain) to construct a usable
// link; without R2 configured at all, falls back to local disk and warns
// loudly, since that fallback does NOT survive a Railway redeploy.
async function uploadPublicFile(buffer, { mimeType, extension, keyPrefix = 'public' }) {
  const optimizedBuffer = await optimizeImage(buffer, mimeType);
  const key = `${keyPrefix}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  if (R2_CONFIGURED) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: optimizedBuffer,
      ContentType: mimeType,
    }));
    const base = process.env.R2_PUBLIC_URL_BASE;
    if (!base) {
      console.warn('[storage] R2_PUBLIC_URL_BASE not set — file uploaded to R2 but its public URL cannot be constructed. Set it to the bucket\'s r2.dev URL or custom domain.');
      return { key, url: null };
    }
    return { key, url: `${base.replace(/\/$/, '')}/${key}` };
  }

  const dest = path.join(PUBLIC_ROOT, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, optimizedBuffer);
  if (UPLOADS_PERSISTENT) {
    console.log('[storage] R2 not configured — public file saved to the UPLOADS_DIR volume instead. Served at /local-uploads/' + key + '.');
  } else {
    console.warn('[storage] R2 not configured and UPLOADS_DIR not set — public file saved to a folder that does NOT survive a Railway redeploy. Either configure R2_* or set UPLOADS_DIR to a Railway Volume mount path.');
  }
  return { key, url: `/local-uploads/${key}` };
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
  return p && fs.existsSync(p) ? p : null;
}

async function deleteFile(key) {
  if (R2_CONFIGURED) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  } else {
    const p = localPathFor(key);
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  }
}

module.exports = { uploadVerificationFile, uploadPublicFile, getSignedViewUrl, readLocalFile, deleteFile, R2_CONFIGURED, UPLOADS_PERSISTENT, PUBLIC_ROOT, publicUploadsPermanent };

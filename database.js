const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE         = path.join(__dirname, 'members.json');
const MEMBERSHIP_START = 10010121;

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ members: [] }, null, 2), 'utf8');
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function emailExists(email) {
  const { members } = loadDb();
  return members.some(m => m.email === email.toLowerCase());
}

function createMember(data) {
  const db = loadDb();
  const lastNumber = db.members.length > 0
    ? db.members[db.members.length - 1].membershipNumber
    : MEMBERSHIP_START - 1;

  const membershipNumber = lastNumber + 1;
  const { password, referredBy, ...rest } = data;
  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;

  const member = {
    membershipNumber,
    ...rest,
    email: data.email.toLowerCase(),
    passwordHash,
    verified: true,
    createdAt: new Date().toISOString(),
    referredBy: referredBy || null,
    totalReferrals: 0,
    monthlyEntries: 0,
  };

  db.members.push(member);

  // Credit the referrer with one giveaway entry
  if (referredBy) {
    const referrer = db.members.find(m => m.membershipNumber === Number(referredBy));
    if (referrer) {
      referrer.totalReferrals = (referrer.totalReferrals || 0) + 1;
      referrer.monthlyEntries = (referrer.monthlyEntries || 0) + 1;
    }
  }

  saveDb(db);
  return { membershipNumber };
}

function findMemberByEmail(email) {
  const { members } = loadDb();
  return members.find(m => m.email === email.toLowerCase()) || null;
}

function getMemberByNumber(membershipNumber) {
  const { members } = loadDb();
  return members.find(m => m.membershipNumber === membershipNumber) || null;
}

function getAllMembers() {
  return loadDb().members;
}

function setResetToken(email, token, expiry) {
  const db = loadDb();
  const member = db.members.find(m => m.email === email.toLowerCase());
  if (!member) return false;
  member.resetToken       = token;
  member.resetTokenExpiry = expiry;
  saveDb(db);
  return true;
}

function findMemberByResetToken(token) {
  const { members } = loadDb();
  return members.find(m => m.resetToken === token) || null;
}

function clearResetToken(email, newPasswordHash) {
  const db = loadDb();
  const member = db.members.find(m => m.email === email.toLowerCase());
  if (!member) return false;
  member.passwordHash        = newPasswordHash;
  member.resetToken          = null;
  member.resetTokenExpiry    = null;
  saveDb(db);
  return true;
}

function resetMonthlyEntries() {
  const db = loadDb();
  db.members.forEach(m => { m.monthlyEntries = 0; });
  if (!db.giveawayHistory) db.giveawayHistory = [];
  saveDb(db);
}

function recordGiveawayWinner(winner) {
  const db = loadDb();
  if (!db.giveawayHistory) db.giveawayHistory = [];
  db.giveawayHistory.unshift({
    membershipNumber: winner.membershipNumber,
    name: `${winner.firstName} ${winner.lastName}`,
    email: winner.email,
    entries: winner.monthlyEntries,
    drawnAt: new Date().toISOString(),
  });
  saveDb(db);
}

function getGiveawayHistory() {
  const db = loadDb();
  return db.giveawayHistory || [];
}

module.exports = {
  createMember, emailExists, findMemberByEmail, getMemberByNumber,
  getAllMembers, setResetToken, findMemberByResetToken, clearResetToken,
  resetMonthlyEntries, recordGiveawayWinner, getGiveawayHistory,
};

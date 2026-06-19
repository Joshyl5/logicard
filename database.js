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
  const { password, ...rest } = data;
  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;

  const member = {
    membershipNumber,
    ...rest,
    email: data.email.toLowerCase(),
    passwordHash,
    verified: true,
    createdAt: new Date().toISOString(),
  };

  db.members.push(member);
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

module.exports = { createMember, emailExists, findMemberByEmail, getMemberByNumber, getAllMembers };

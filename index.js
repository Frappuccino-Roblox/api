// server.js - FIXED VERSION (No Hardcoding)
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ---------- Configuration from Environment ----------
const GROUP_ID = process.env.ROBLOX_GROUP_ID;
const API_KEY = process.env.ROBLOX_OPENCLOUD_API_KEY;
const AUTH_TOKEN = process.env.API_AUTH_TOKEN;

// Validate required variables
if (!GROUP_ID || !API_KEY || !AUTH_TOKEN) {
  console.error('❌ Missing required environment variables:');
  if (!GROUP_ID) console.error('  - ROBLOX_GROUP_ID');
  if (!API_KEY) console.error('  - ROBLOX_OPENCLOUD_API_KEY');
  if (!AUTH_TOKEN) console.error('  - API_AUTH_TOKEN');
  process.exit(1);
}

console.log('🚀 Server starting...');
console.log(`📦 Group ID: ${GROUP_ID}`);
console.log(`🔑 API Key: ${API_KEY ? 'set' : 'MISSING'}`);
console.log(`🔐 Auth Token: ${AUTH_TOKEN ? 'set' : 'MISSING'}`);

const OPENCLOUD_BASE = 'https://apis.roblox.com/cloud/v2';
const openCloudHeaders = { 'x-api-key': API_KEY.trim() };

// ---------- SIMPLE AUTH ----------
app.use('/utils/roblox', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key' });
  }
  next();
});

// ---------- Small helper for throwing errors with an HTTP status attached ----------
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ---------- SHARED HELPERS ----------

// Roblox deprecated the old `/v1/users/search?keyword=` endpoint for reliable
// exact-match lookups. The supported way to resolve a username -> userId is
// POST /v1/usernames/users, which does an exact (optionally case-insensitive) match.
async function getUserIdByUsername(username) {
  const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
    usernames: [username],
    excludeBannedUsers: false
  });

  const user = response.data?.data?.[0];
  if (!user) {
    throw httpError(404, `Roblox user "${username}" not found`);
  }
  return user.id;
}

async function getSortedRoles() {
  const rolesRes = await axios.get(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=100`,
    { headers: openCloudHeaders }
  );
  return rolesRes.data.groupRoles.slice().sort((a, b) => a.rank - b.rank);
}

async function getMembershipId(userId) {
  const filter = `user == 'users/${userId}'`;
  const membershipRes = await axios.get(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships?maxPageSize=10&filter=${encodeURIComponent(filter)}`,
    { headers: openCloudHeaders }
  );

  const memberships = membershipRes.data.groupMemberships;
  if (!memberships?.length) {
    throw httpError(404, 'User not in group');
  }

  return memberships[0].path.split('/').pop();
}

async function getCurrentRoleId(membershipId) {
  const memberData = await axios.get(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
    { headers: openCloudHeaders }
  );
  return memberData.data.role.split('/').pop();
}

async function setMembershipRole(membershipId, roleId) {
  await axios.patch(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
    { role: `groups/${GROUP_ID}/roles/${roleId}` },
    { headers: openCloudHeaders }
  );
}

// Central error responder: uses the status attached by httpError()
// when present, otherwise falls back to 500 for genuine server/API errors.
function sendError(res, error, fallbackContext) {
  const status = error.status || 500;
  const payload = error.response?.data || error.message;
  if (status === 500) {
    console.error(`❌ ${fallbackContext} error:`, payload);
  }
  res.status(status).json({ error: payload });
}

// ---------- TEST ENDPOINT ----------
app.get('/utils/roblox/test', async (req, res) => {
  try {
    const response = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=10`,
      { headers: openCloudHeaders }
    );
    res.json({
      success: true,
      roles: response.data.groupRoles?.length || 0,
      message: 'API key works!'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// ---------- PROMOTE ----------
app.post('/utils/roblox/promote', async (req, res) => {
  const { robloxUsername, reason } = req.body;

  if (!robloxUsername || !reason) {
    return res.status(400).json({ error: 'robloxUsername and reason required' });
  }

  try {
    const userId = await getUserIdByUsername(robloxUsername);
    const roles = await getSortedRoles();
    const membershipId = await getMembershipId(userId);
    const currentRoleId = await getCurrentRoleId(membershipId);

    const currentIdx = roles.findIndex(r => r.id === currentRoleId);
    if (currentIdx === -1) throw httpError(500, 'Current role not found in group role list');
    if (currentIdx === roles.length - 1) {
      throw httpError(400, 'Already at highest rank');
    }

    const newRole = roles[currentIdx + 1];
    await setMembershipRole(membershipId, newRole.id);

    res.json({
      success: true,
      message: `Promoted ${robloxUsername} to ${newRole.displayName}`,
      newRank: newRole.displayName
    });
  } catch (error) {
    sendError(res, error, 'Promote');
  }
});

// ---------- DEMOTE ----------
app.post('/utils/roblox/demote', async (req, res) => {
  const { robloxUsername, reason } = req.body;

  if (!robloxUsername || !reason) {
    return res.status(400).json({ error: 'robloxUsername and reason required' });
  }

  try {
    const userId = await getUserIdByUsername(robloxUsername);
    const roles = await getSortedRoles();
    const membershipId = await getMembershipId(userId);
    const currentRoleId = await getCurrentRoleId(membershipId);

    const currentIdx = roles.findIndex(r => r.id === currentRoleId);
    if (currentIdx === -1) throw httpError(500, 'Current role not found in group role list');
    if (currentIdx === 0) {
      throw httpError(400, 'Already at lowest rank');
    }

    const newRole = roles[currentIdx - 1];
    await setMembershipRole(membershipId, newRole.id);

    res.json({
      success: true,
      message: `Demoted ${robloxUsername} to ${newRole.displayName}`,
      newRank: newRole.displayName
    });
  } catch (error) {
    sendError(res, error, 'Demote');
  }
});

// ---------- SETRANK ----------
app.post('/utils/roblox/setrank', async (req, res) => {
  const { robloxUsername, reason, rankName } = req.body;

  if (!robloxUsername || !reason || !rankName) {
    return res.status(400).json({ error: 'robloxUsername, reason, and rankName required' });
  }

  try {
    const userId = await getUserIdByUsername(robloxUsername);
    const roles = await getSortedRoles();

    const targetRole = roles.find(r => r.displayName.toLowerCase() === rankName.toLowerCase());
    if (!targetRole) {
      throw httpError(404, `Rank "${rankName}" not found`);
    }

    const membershipId = await getMembershipId(userId);
    await setMembershipRole(membershipId, targetRole.id);

    res.json({
      success: true,
      message: `Set ${robloxUsername} to ${targetRole.displayName}`,
      newRank: targetRole.displayName
    });
  } catch (error) {
    sendError(res, error, 'Setrank');
  }
});

// ---------- HEALTH CHECK ----------
app.get('/utils/roblox/health', (req, res) => {
  res.json({
    status: 'ok',
    groupId: GROUP_ID ? 'set' : 'missing',
    apiKey: API_KEY ? 'set' : 'missing',
    authToken: AUTH_TOKEN ? 'set' : 'missing'
  });
});

// ---------- Export for Vercel ----------
module.exports = app;

// server.js - FINAL ROBUST VERSION (with debug logging)
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ---------- Configuration from Environment ----------
const GROUP_ID = process.env.ROBLOX_GROUP_ID;
const API_KEY = process.env.ROBLOX_OPENCLOUD_API_KEY || '';
const AUTH_TOKEN = process.env.API_AUTH_TOKEN || '';

if (!GROUP_ID || !API_KEY || !AUTH_TOKEN) {
  console.error('❌ WARNING: Missing required environment variables.');
}

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

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ---------- SHARED HELPERS ----------

async function getUserIdByUsername(username) {
  const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
    usernames: [username],
    excludeBannedUsers: false
  });
  const user = response.data?.data?.[0];
  if (!user) throw httpError(404, `Roblox user "${username}" not found`);
  return user.id;
}

async function getSortedRoles() {
  let allRoles = [];
  let pageToken = '';

  // Roblox paginates this endpoint even when maxPageSize is set high enough
  // to theoretically cover all roles in one request. If we don't follow
  // nextPageToken, roles on later pages (including ones a member might
  // currently hold) get silently dropped, causing false "role not found" errors.
  do {
    const rolesRes = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`,
      {
        headers: openCloudHeaders,
        params: {
          maxPageSize: 100,
          ...(pageToken ? { pageToken } : {})
        }
      }
    );

    console.log(`DEBUG roles page (token="${pageToken}"):`, rolesRes.data.groupRoles.map(r => ({ id: r.id, name: r.displayName, rank: r.rank })));

    allRoles = allRoles.concat(rolesRes.data.groupRoles);
    pageToken = rolesRes.data.nextPageToken || '';
  } while (pageToken);

  console.log('DEBUG total roles fetched across all pages:', allRoles.length);

  // Sort roles from lowest rank to highest rank
  return allRoles.slice().sort((a, b) => a.rank - b.rank);
}

async function getMembershipData(userId) {
  const membershipRes = await axios.get(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships`,
    { 
      headers: openCloudHeaders,
      params: {
        maxPageSize: 10,
        filter: `user == 'users/${userId}'`
      }
    }
  );

  // DEBUG: log the raw membership payload
  console.log('DEBUG raw membership response:', JSON.stringify(membershipRes.data, null, 2));

  const memberships = membershipRes.data.groupMemberships;
  if (!memberships || memberships.length === 0) {
    throw httpError(404, `User is not currently in the group.`);
  }

  const membership = memberships[0];
  const membershipId = membership.path.split('/').pop();
  
  // Extract role ID safely whether it's a full path or just an ID
  const roleRef = membership.role;
  const roleId = typeof roleRef === 'string' ? roleRef.split('/').pop() : String(roleRef);

  // DEBUG: log what we extracted
  console.log('DEBUG membershipId:', membershipId, '| raw roleRef:', JSON.stringify(roleRef), '| extracted roleId:', JSON.stringify(roleId));

  return { membershipId, roleId };
}

async function setMembershipRole(membershipId, roleId) {
  await axios.patch(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}?updateMask=role`,
    { role: `groups/${GROUP_ID}/roles/${roleId}` },
    { headers: openCloudHeaders }
  );
}

function sendError(res, error, fallbackContext) {
  const status = error.response?.status || error.status || 500;
  let message = error.status ? error.message : (error.response?.data?.message || error.message);
  
  if (error.response?.data?.errors?.[0]?.message) {
    message = error.response.data.errors[0].message || message;
  }

  if (status === 500) console.error(`❌ ${fallbackContext} error:`, error.response?.data || error.message);
  res.status(status).json({ error: message });
}

// ---------- ENDPOINTS ----------

app.post('/utils/roblox/promote', async (req, res) => {
  const { robloxUsername, reason } = req.body;
  if (!robloxUsername || !reason) return res.status(400).json({ error: 'robloxUsername and reason required' });

  try {
    const userId = await getUserIdByUsername(robloxUsername);
    const { membershipId, roleId: currentRoleId } = await getMembershipData(userId);
    const roles = await getSortedRoles();

    // DEBUG: log exactly what we're comparing
    console.log('DEBUG [promote] currentRoleId:', JSON.stringify(currentRoleId));
    console.log('DEBUG [promote] roles list:', roles.map(r => ({ id: r.id, name: r.displayName, rank: r.rank })));

    const currentIdx = roles.findIndex(r => String(r.id) === String(currentRoleId));
    
    if (currentIdx === -1) {
      console.error(`❌ Mismatch Debug: User's Role ID "${currentRoleId}" was not found in fetched group roles:`, roles.map(r => r.id));
      throw httpError(400, `Could not match user's current role ID (${currentRoleId}) in group roles. (Are they group owner?)`);
    }

    if (currentIdx === roles.length - 1) throw httpError(400, 'Already at highest rank');

    const newRole = roles[currentIdx + 1];
    await setMembershipRole(membershipId, newRole.id);

    res.json({ success: true, message: `Promoted ${robloxUsername} to ${newRole.displayName}` });
  } catch (error) { sendError(res, error, 'Promote'); }
});

app.post('/utils/roblox/demote', async (req, res) => {
  const { robloxUsername, reason } = req.body;
  if (!robloxUsername || !reason) return res.status(400).json({ error: 'robloxUsername and reason required' });

  try {
    const userId = await getUserIdByUsername(robloxUsername);
    const { membershipId, roleId: currentRoleId } = await getMembershipData(userId);
    const roles = await getSortedRoles();

    // DEBUG: log exactly what we're comparing
    console.log('DEBUG [demote] currentRoleId:', JSON.stringify(currentRoleId));
    console.log('DEBUG [demote] roles list:', roles.map(r => ({ id: r.id, name: r.displayName, rank: r.rank })));

    const currentIdx = roles.findIndex(r => String(r.id) === String(currentRoleId));
    
    if (currentIdx === -1) {
      console.error(`❌ Mismatch Debug: User's Role ID "${currentRoleId}" was not found in fetched group roles:`, roles.map(r => r.id));
      throw httpError(400, `Could not match user's current role ID (${currentRoleId}) in group roles.`);
    }

    if (currentIdx === 0) throw httpError(400, 'Already at lowest rank');

    const newRole = roles[currentIdx - 1];
    await setMembershipRole(membershipId, newRole.id);

    res.json({ success: true, message: `Demoted ${robloxUsername} to ${newRole.displayName}` });
  } catch (error) { sendError(res, error, 'Demote'); }
});

app.post('/utils/roblox/setrank', async (req, res) => {
  const { robloxUsername, reason, rankName } = req.body;
  if (!robloxUsername || !reason || !rankName) return res.status(400).json({ error: 'robloxUsername, reason, and rankName required' });

  try {
    const userId = await getUserIdByUsername(robloxUsername);
    const { membershipId } = await getMembershipData(userId); 
    const roles = await getSortedRoles();
    
    const targetRole = roles.find(r => r.displayName.toLowerCase() === rankName.toLowerCase());
    if (!targetRole) throw httpError(404, `Rank "${rankName}" not found in group`);

    await setMembershipRole(membershipId, targetRole.id);
    res.json({ success: true, message: `Set ${robloxUsername} to ${targetRole.displayName}` });
  } catch (error) { sendError(res, error, 'Setrank'); }
});

module.exports = app;

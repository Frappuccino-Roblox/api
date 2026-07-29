// server.js - THE REAL FIX
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
  const rolesRes = await axios.get(
    `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=100`,
    { headers: openCloudHeaders }
  );
  return rolesRes.data.groupRoles.slice().sort((a, b) => a.rank - b.rank);
}

// NEW: We absolutely MUST use the filter. Axios 'params' handles the URL encoding perfectly.
async function getMembershipData(userId) {
  try {
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

    const memberships = membershipRes.data.groupMemberships;
    if (!memberships || memberships.length === 0) {
      throw httpError(404, `User is not currently in the group.`);
    }

    // Return BOTH the membership ID and their current role from a single API call
    return {
      membershipId: memberships[0].path.split('/').pop(),
      roleId: String(memberships[0].role.split('/').pop())
    };
  } catch (err) {
    // If it fails here, we log it so you can see exactly why in your server console
    if (err.response?.status === 400) console.error("❌ Roblox rejected filter syntax:", err.response.data);
    if (err.response?.status === 403) console.error("❌ API Key lacks 'Group Memberships - Read' permission.");
    throw err;
  }
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
  
  // Handle Roblox's empty generic array format
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

    const currentIdx = roles.findIndex(r => String(r.id) === currentRoleId);
    if (currentIdx === -1) throw httpError(500, 'Current role not found in group role list');
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

    const currentIdx = roles.findIndex(r => String(r.id) === currentRoleId);
    if (currentIdx === -1) throw httpError(500, 'Current role not found in group role list');
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

// server.js - SIMPLE WORKING VERSION (No Hardcoding)
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

// ---------- SIMPLE AUTH ----------
app.use('/utils/roblox', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key' });
  }
  next();
});

// ---------- TEST ENDPOINT ----------
app.get('/utils/roblox/test', async (req, res) => {
  try {
    const response = await axios.get(`${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=10`, {
      headers: { 'x-api-key': API_KEY.trim() }
    });
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
    // 1. Get user ID
    const userSearch = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${robloxUsername}`);
    const user = userSearch.data.data?.find(u => u.name.toLowerCase() === robloxUsername.toLowerCase());
    if (!user) throw new Error('User not found');
    const userId = user.id;

    // 2. Get all roles
    const rolesRes = await axios.get(`${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=100`, {
      headers: { 'x-api-key': API_KEY.trim() }
    });
    const roles = rolesRes.data.groupRoles.sort((a, b) => a.rank - b.rank);

    // 3. Get user's membership
    const filter = `user == 'users/${userId}'`;
    const membershipRes = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships?maxPageSize=10&filter=${encodeURIComponent(filter)}`,
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    if (!membershipRes.data.groupMemberships?.length) {
      return res.status(404).json({ error: 'User not in group' });
    }

    const membershipPath = membershipRes.data.groupMemberships[0].path;
    const membershipId = membershipPath.split('/').pop();

    // 4. Get current role from membership
    const memberData = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    const currentRoleId = memberData.data.role.split('/').pop();
    const currentIdx = roles.findIndex(r => r.id === currentRoleId);

    if (currentIdx === -1) throw new Error('Role not found');
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'Already at highest rank' });
    }

    const newRole = roles[currentIdx + 1];

    // 5. Update rank
    await axios.patch(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
      { role: `groups/${GROUP_ID}/roles/${newRole.id}` },
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    res.json({
      success: true,
      message: `Promoted ${robloxUsername} to ${newRole.displayName}`,
      newRank: newRole.displayName
    });
  } catch (error) {
    console.error('❌ Promote error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data || error.message 
    });
  }
});

// ---------- DEMOTE ----------
app.post('/utils/roblox/demote', async (req, res) => {
  const { robloxUsername, reason } = req.body;
  
  if (!robloxUsername || !reason) {
    return res.status(400).json({ error: 'robloxUsername and reason required' });
  }

  try {
    // 1. Get user ID
    const userSearch = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${robloxUsername}`);
    const user = userSearch.data.data?.find(u => u.name.toLowerCase() === robloxUsername.toLowerCase());
    if (!user) throw new Error('User not found');
    const userId = user.id;

    // 2. Get all roles
    const rolesRes = await axios.get(`${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=100`, {
      headers: { 'x-api-key': API_KEY.trim() }
    });
    const roles = rolesRes.data.groupRoles.sort((a, b) => a.rank - b.rank);

    // 3. Get user's membership
    const filter = `user == 'users/${userId}'`;
    const membershipRes = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships?maxPageSize=10&filter=${encodeURIComponent(filter)}`,
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    if (!membershipRes.data.groupMemberships?.length) {
      return res.status(404).json({ error: 'User not in group' });
    }

    const membershipPath = membershipRes.data.groupMemberships[0].path;
    const membershipId = membershipPath.split('/').pop();

    // 4. Get current role from membership
    const memberData = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    const currentRoleId = memberData.data.role.split('/').pop();
    const currentIdx = roles.findIndex(r => r.id === currentRoleId);

    if (currentIdx === -1) throw new Error('Role not found');
    if (currentIdx === 0) {
      return res.status(400).json({ error: 'Already at lowest rank' });
    }

    const newRole = roles[currentIdx - 1];

    // 5. Update rank
    await axios.patch(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
      { role: `groups/${GROUP_ID}/roles/${newRole.id}` },
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    res.json({
      success: true,
      message: `Demoted ${robloxUsername} to ${newRole.displayName}`,
      newRank: newRole.displayName
    });
  } catch (error) {
    console.error('❌ Demote error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data || error.message 
    });
  }
});

// ---------- SETRANK ----------
app.post('/utils/roblox/setrank', async (req, res) => {
  const { robloxUsername, reason, rankName } = req.body;
  
  if (!robloxUsername || !reason || !rankName) {
    return res.status(400).json({ error: 'robloxUsername, reason, and rankName required' });
  }

  try {
    // 1. Get user ID
    const userSearch = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${robloxUsername}`);
    const user = userSearch.data.data?.find(u => u.name.toLowerCase() === robloxUsername.toLowerCase());
    if (!user) throw new Error('User not found');
    const userId = user.id;

    // 2. Get all roles
    const rolesRes = await axios.get(`${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=100`, {
      headers: { 'x-api-key': API_KEY.trim() }
    });
    const roles = rolesRes.data.groupRoles;

    // 3. Find target role
    const targetRole = roles.find(r => r.displayName.toLowerCase() === rankName.toLowerCase());
    if (!targetRole) {
      return res.status(404).json({ error: `Rank "${rankName}" not found` });
    }

    // 4. Get user's membership
    const filter = `user == 'users/${userId}'`;
    const membershipRes = await axios.get(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships?maxPageSize=10&filter=${encodeURIComponent(filter)}`,
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    if (!membershipRes.data.groupMemberships?.length) {
      return res.status(404).json({ error: 'User not in group' });
    }

    const membershipPath = membershipRes.data.groupMemberships[0].path;
    const membershipId = membershipPath.split('/').pop();

    // 5. Update rank
    await axios.patch(
      `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`,
      { role: `groups/${GROUP_ID}/roles/${targetRole.id}` },
      { headers: { 'x-api-key': API_KEY.trim() } }
    );

    res.json({
      success: true,
      message: `Set ${robloxUsername} to ${targetRole.displayName}`,
      newRank: targetRole.displayName
    });
  } catch (error) {
    console.error('❌ Setrank error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.response?.data || error.message 
    });
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

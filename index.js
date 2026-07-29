// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ---------- Configuration from Environment ----------
const GROUP_ID = process.env.ROBLOX_GROUP_ID;
const API_KEY = process.env.ROBLOX_OPENCLOUD_API_KEY;
const AUTH_TOKEN = process.env.API_AUTH_TOKEN; // e.g., "FrapAPI@"

// Validate required variables
if (!GROUP_ID || !API_KEY || !AUTH_TOKEN) {
  console.error('❌ Missing required environment variables:');
  if (!GROUP_ID) console.error('  - ROBLOX_GROUP_ID');
  if (!API_KEY) console.error('  - ROBLOX_OPENCLOUD_API_KEY');
  if (!AUTH_TOKEN) console.error('  - API_AUTH_TOKEN');
  process.exit(1);
}

console.log('✅ Configuration loaded successfully');
console.log(`📍 Group ID: ${GROUP_ID}`);
console.log(`🔐 Authentication required (x-api-key header)`);

const OPENCLOUD_BASE = 'https://apis.roblox.com/cloud/v2';

// ---------- Authentication Middleware (x-api-key) ----------
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Missing x-api-key header'
    });
  }
  
  if (apiKey !== AUTH_TOKEN) {
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided x-api-key is invalid'
    });
  }
  
  next();
}

// Apply authentication to all /utils/roblox endpoints
app.use('/utils/roblox', authenticate);

// ---------- Helper Functions ----------

/** Get user ID from username */
async function getUserId(username) {
  const url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}`;
  const response = await axios.get(url);
  const data = response.data;
  if (!data.data || data.data.length === 0) {
    throw new Error('User not found');
  }
  const user = data.data.find(u => u.name.toLowerCase() === username.toLowerCase());
  if (!user) {
    throw new Error(`No exact match for username "${username}"`);
  }
  return user.id;
}

/** Get all roles of the group, sorted by rank ascending */
async function getGroupRoles() {
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`;
  const response = await axios.get(url, {
    headers: {
      'x-api-key': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return response.data.roles.sort((a, b) => a.rank - b.rank);
}

/** Get current role of a user */
async function getUserRole(userId) {
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  const response = await axios.get(url, {
    headers: {
      'x-api-key': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return response.data.role;
}

/** Change user's rank */
async function changeUserRank(userId, roleId, reason = '') {
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  const payload = { roleId };
  if (reason) payload.reason = reason;
  
  const response = await axios.patch(url, payload, {
    headers: {
      'x-api-key': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return response.data;
}

// ---------- Endpoints ----------

app.post('/utils/roblox/promote', async (req, res) => {
  try {
    const { robloxUsername, reason } = req.body;
    if (!robloxUsername || !reason) {
      return res.status(400).json({ error: 'robloxUsername and reason are required' });
    }

    const userId = await getUserId(robloxUsername);
    const roles = await getGroupRoles();
    const currentRole = await getUserRole(userId);

    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group roles' });
    }
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'User is already at the highest rank' });
    }

    const newRole = roles[currentIdx + 1];
    await changeUserRank(userId, newRole.id, reason);

    res.status(200).json({
      success: true,
      message: `Promoted ${robloxUsername} to ${newRole.name}`,
      newRank: newRole.name
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/utils/roblox/demote', async (req, res) => {
  try {
    const { robloxUsername, reason } = req.body;
    if (!robloxUsername || !reason) {
      return res.status(400).json({ error: 'robloxUsername and reason are required' });
    }

    const userId = await getUserId(robloxUsername);
    const roles = await getGroupRoles();
    const currentRole = await getUserRole(userId);

    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group roles' });
    }
    if (currentIdx === 0) {
      return res.status(400).json({ error: 'User is already at the lowest rank' });
    }

    const newRole = roles[currentIdx - 1];
    await changeUserRank(userId, newRole.id, reason);

    res.status(200).json({
      success: true,
      message: `Demoted ${robloxUsername} to ${newRole.name}`,
      newRank: newRole.name
    });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/utils/roblox/setrank', async (req, res) => {
  try {
    const { robloxUsername, reason, rankName } = req.body;
    if (!robloxUsername || !reason || !rankName) {
      return res.status(400).json({ error: 'robloxUsername, reason, and rankName are required' });
    }

    const userId = await getUserId(robloxUsername);
    const roles = await getGroupRoles();

    const targetRole = roles.find(r => r.name.toLowerCase() === rankName.toLowerCase());
    if (!targetRole) {
      return res.status(404).json({ error: `Rank "${rankName}" not found in group` });
    }

    await changeUserRank(userId, targetRole.id, reason);

    res.status(200).json({
      success: true,
      message: `Set ${robloxUsername} to ${targetRole.name}`,
      newRank: targetRole.name
    });
  } catch (error) {
    handleError(res, error);
  }
});

// ---------- Error Handler ----------
function handleError(res, error) {
  console.error('Error:', error.message);
  
  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 500;
    const data = error.response?.data || {};
    
    if (status === 401) {
      return res.status(401).json({
        error: 'Invalid or expired Roblox API key',
        message: 'Check your ROBLOX_OPENCLOUD_API_KEY',
        details: data
      });
    }
    if (status === 403) {
      return res.status(403).json({
        error: 'Roblox API key lacks required permissions',
        message: 'Needs groups:read and groups:write',
        details: data
      });
    }
    
    return res.status(status).json({
      error: 'Roblox API error',
      details: data,
    });
  }
  
  res.status(500).json({
    error: error.message || 'Internal server error',
  });
}

// ---------- Health Check (No auth) ----------
app.get('/utils/roblox/health', (req, res) => {
  res.json({
    status: 'ok',
    groupId: GROUP_ID,
    apiKeyPrefix: API_KEY.substring(0, 10) + '...',
    authHeader: 'x-api-key'
  });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Roblox utils API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/utils/roblox/health`);
  console.log(`🔐 Send x-api-key header with your token`);
});

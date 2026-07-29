// server.js (Vercel-compatible version with fix)
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ---------- Configuration from Environment ----------
const GROUP_ID = process.env.ROBLOX_GROUP_ID;
const API_KEY = process.env.ROBLOX_OPENCLOUD_API_KEY;
const AUTH_TOKEN = process.env.API_AUTH_TOKEN;

// Don't exit process in serverless - just log errors
if (!GROUP_ID) console.error('❌ Missing: ROBLOX_GROUP_ID');
if (!API_KEY) console.error('❌ Missing: ROBLOX_OPENCLOUD_API_KEY');
if (!AUTH_TOKEN) console.error('❌ Missing: API_AUTH_TOKEN');

// Debug: Log API key prefix
console.log(`🔑 API Key loaded: ${API_KEY ? API_KEY.substring(0, 20) + '...' : 'missing'}`);
console.log(`📦 Group ID: ${GROUP_ID}`);

const OPENCLOUD_BASE = 'https://apis.roblox.com/cloud/v2';

// ---------- Authentication Middleware ----------
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  console.log('🔐 Auth check - x-api-key:', apiKey ? 'present' : 'missing');
  
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
  
  console.log('✅ Authentication successful');
  next();
}

// Apply authentication to all /utils/roblox endpoints EXCEPT test and health
app.use('/utils/roblox/promote', authenticate);
app.use('/utils/roblox/demote', authenticate);
app.use('/utils/roblox/setrank', authenticate);

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
  
  console.log(`📤 GET ${url}`);
  console.log(`🔑 Using API Key: ${API_KEY.substring(0, 15)}...`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    // Log the full response for debugging
    console.log('📄 Response status:', response.status);
    console.log('📄 Response data keys:', Object.keys(response.data));
    
    // Check if roles exist in response
    if (!response.data) {
      console.error('❌ No data in response');
      throw new Error('No data received from Roblox API');
    }
    
    if (!response.data.roles) {
      console.error('❌ No roles in response:', response.data);
      // Check if there's an error message in the response
      if (response.data.error) {
        throw new Error(`Roblox API error: ${response.data.error}`);
      }
      throw new Error('No roles data received from Roblox API');
    }
    
    if (!Array.isArray(response.data.roles)) {
      console.error('❌ Roles is not an array:', typeof response.data.roles);
      throw new Error('Roles data is not an array');
    }
    
    console.log(`✅ Found ${response.data.roles.length} roles`);
    return response.data.roles.sort((a, b) => a.rank - b.rank);
  } catch (error) {
    console.error('❌ Error fetching group roles:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

/** Get current role of a user */
async function getUserRole(userId) {
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.data || !response.data.role) {
      console.error('❌ No role found in response:', response.data);
      throw new Error('User role not found');
    }
    
    return response.data.role;
  } catch (error) {
    console.error('❌ Error fetching user role:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

/** Change user's rank */
async function changeUserRank(userId, roleId, reason = '') {
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  const payload = { roleId };
  if (reason) payload.reason = reason;
  
  console.log(`📤 PATCH ${url}`);
  console.log(`📦 Payload:`, payload);
  
  try {
    const response = await axios.patch(url, payload, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Error changing user rank:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

// ---------- Endpoints ----------

app.post('/utils/roblox/promote', async (req, res) => {
  try {
    console.log('📥 Received promote request');
    console.log('📋 Request body:', req.body);
    
    const { robloxUsername, reason } = req.body;
    if (!robloxUsername || !reason) {
      return res.status(400).json({ error: 'robloxUsername and reason are required' });
    }

    console.log(`🔄 Promoting ${robloxUsername}...`);

    const userId = await getUserId(robloxUsername);
    console.log(`👤 User ID: ${userId}`);

    const roles = await getGroupRoles();
    console.log(`📋 Found ${roles.length} roles`);
    
    const currentRole = await getUserRole(userId);
    console.log(`📋 Current role: ${currentRole.name} (${currentRole.rank})`);

    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group roles' });
    }
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'User is already at the highest rank' });
    }

    const newRole = roles[currentIdx + 1];
    console.log(`📋 New role: ${newRole.name} (${newRole.rank})`);
    
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
    console.log('📥 Received demote request');
    console.log('📋 Request body:', req.body);
    
    const { robloxUsername, reason } = req.body;
    if (!robloxUsername || !reason) {
      return res.status(400).json({ error: 'robloxUsername and reason are required' });
    }

    console.log(`🔄 Demoting ${robloxUsername}...`);

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
    console.log('📥 Received setrank request');
    console.log('📋 Request body:', req.body);
    
    const { robloxUsername, reason, rankName } = req.body;
    if (!robloxUsername || !reason || !rankName) {
      return res.status(400).json({ error: 'robloxUsername, reason, and rankName are required' });
    }

    console.log(`🔄 Setting ${robloxUsername} to ${rankName}...`);

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
  console.error('❌ Error:', error.message);
  
  if (error.response) {
    console.error('📄 Response status:', error.response.status);
    console.error('📄 Response data:', error.response.data);
  }
  
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status || 500;
    const data = error.response.data || {};
    
    if (status === 401) {
      return res.status(401).json({
        error: 'Invalid or expired Roblox API key',
        message: 'The OpenCloud API key is invalid or expired.',
        details: data,
        suggestion: 'Regenerate your API key at https://create.roblox.com/dashboard'
      });
    }
    if (status === 403) {
      return res.status(403).json({
        error: 'Roblox API key lacks required permissions',
        message: 'API key needs groups:read and groups:write permissions',
        details: data,
        suggestion: 'Update API key permissions at https://create.roblox.com/dashboard'
      });
    }
    if (status === 404) {
      return res.status(404).json({
        error: 'Group or user not found',
        message: `Group ID ${GROUP_ID} or user may not exist`,
        details: data,
        suggestion: `Verify group ID ${GROUP_ID} is correct`
      });
    }
    
    return res.status(status).json({
      error: 'Roblox API error',
      details: data,
    });
  }
  
  res.status(500).json({
    error: error.message || 'Internal server error',
    suggestion: 'Check Vercel logs for more details'
  });
}

// ---------- Test Endpoint - No auth required ----------
app.get('/utils/roblox/test-api-key', async (req, res) => {
  try {
    console.log('🧪 Running API key test...');
    
    const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`;
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📄 Test response status:', response.status);
    console.log('📄 Test response keys:', Object.keys(response.data));
    
    const hasRoles = response.data && Array.isArray(response.data.roles);
    
    res.json({
      success: true,
      message: 'API key is working!',
      hasRoles: hasRoles,
      rolesCount: hasRoles ? response.data.roles.length : 0,
      dataStructure: Object.keys(response.data),
      apiKeyPrefix: API_KEY.substring(0, 20) + '...',
      sampleRole: hasRoles && response.data.roles.length > 0 ? response.data.roles[0] : null
    });
  } catch (error) {
    console.error('❌ API key test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).json({
      success: false,
      message: 'API key test failed',
      error: error.response?.data || error.message,
      status: error.response?.status
    });
  }
});

// ---------- Health Check (No auth) ----------
app.get('/utils/roblox/health', (req, res) => {
  const status = {
    status: GROUP_ID && API_KEY && AUTH_TOKEN ? 'ok' : 'misconfigured',
    groupId: GROUP_ID ? 'set' : 'missing',
    apiKey: API_KEY ? `set (${API_KEY.substring(0, 20)}...)` : 'missing',
    authToken: AUTH_TOKEN ? 'set' : 'missing',
    authHeader: 'x-api-key'
  };
  
  if (!GROUP_ID || !API_KEY || !AUTH_TOKEN) {
    return res.status(500).json(status);
  }
  
  res.json(status);
});

// ---------- Export for Vercel ----------
module.exports = app;

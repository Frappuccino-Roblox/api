// server.js
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ---------- Configuration from Environment ----------
const GROUP_ID = process.env.ROBLOX_GROUP_ID;
const API_KEY = process.env.ROBLOX_OPENCLOUD_API_KEY;
const AUTH_TOKEN = process.env.API_AUTH_TOKEN;

console.log('🚀 Server starting...');
console.log(`📦 Group ID: ${GROUP_ID ? 'set' : 'MISSING'}`);
console.log(`🔑 API Key: ${API_KEY ? 'set' : 'MISSING'}`);
console.log(`🔐 Auth Token: ${AUTH_TOKEN ? 'set' : 'MISSING'}`);

// Correct OpenCloud API base URL
const OPENCLOUD_BASE = 'https://apis.roblox.com/cloud/v2';

// ---------- Helper Functions ----------

async function getGroupRoles() {
  // Correct endpoint for group roles
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`;
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Response keys:', Object.keys(response.data));
    
    if (!response.data) {
      throw new Error('No data received from Roblox API');
    }
    
    // The response might have a different structure
    // Let's check what we got
    if (response.data.groupRoles) {
      console.log(`✅ Found ${response.data.groupRoles.length} roles in groupRoles`);
      return response.data.groupRoles.sort((a, b) => a.rank - b.rank);
    } else if (response.data.roles) {
      console.log(`✅ Found ${response.data.roles.length} roles in roles`);
      return response.data.roles.sort((a, b) => a.rank - b.rank);
    } else if (Array.isArray(response.data)) {
      console.log(`✅ Found ${response.data.length} roles in array`);
      return response.data.sort((a, b) => a.rank - b.rank);
    } else {
      console.error('❌ Unknown response structure:', Object.keys(response.data));
      throw new Error('Unknown response structure. Keys: ' + Object.keys(response.data).join(', '));
    }
  } catch (error) {
    console.error('❌ Error in getGroupRoles:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

async function getUserRole(userId) {
  // Correct endpoint for user role
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 User role response keys:', Object.keys(response.data));
    
    if (!response.data) {
      throw new Error('No data received from Roblox API');
    }
    
    // Check different possible response structures
    if (response.data.role) {
      return response.data.role;
    } else if (response.data.data && response.data.data.role) {
      return response.data.data.role;
    } else {
      console.error('❌ No role found in response:', response.data);
      throw new Error('No role found for user');
    }
  } catch (error) {
    console.error('❌ Error in getUserRole:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

async function changeUserRank(userId, roleId, reason = '') {
  // Correct endpoint for changing user rank
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  const payload = { roleId };
  if (reason) payload.reason = reason;
  
  console.log(`📤 PATCH ${url}`);
  console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.patch(url, payload, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Rank changed successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error in changeUserRank:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

async function getUserId(username) {
  const url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}`;
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url);
    const data = response.data;
    
    if (!data.data || data.data.length === 0) {
      throw new Error(`User "${username}" not found`);
    }
    
    const user = data.data.find(u => u.name.toLowerCase() === username.toLowerCase());
    if (!user) {
      throw new Error(`No exact match for username "${username}"`);
    }
    
    console.log(`✅ Found user: ${user.name} (${user.id})`);
    return user.id;
  } catch (error) {
    console.error('❌ Error in getUserId:', error.message);
    throw error;
  }
}

// ---------- TEST ENDPOINT (NO AUTH) ----------
app.get('/utils/roblox/test-api-key', async (req, res) => {
  console.log('🧪 Running API key test...');
  
  try {
    const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`;
    console.log(`📤 GET ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Test successful!');
    console.log('📊 Response keys:', Object.keys(response.data));
    console.log('📊 Full response:', JSON.stringify(response.data, null, 2));
    
    // Try to find roles in the response
    let roles = null;
    if (response.data.groupRoles) roles = response.data.groupRoles;
    else if (response.data.roles) roles = response.data.roles;
    else if (Array.isArray(response.data)) roles = response.data;
    
    res.json({
      success: true,
      message: 'API key is working!',
      hasRoles: !!roles,
      rolesCount: roles ? roles.length : 0,
      dataStructure: Object.keys(response.data),
      apiKeyPrefix: API_KEY.substring(0, 20) + '...',
      fullResponse: response.data
    });
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ---------- PROMOTE ENDPOINT ----------
app.post('/utils/roblox/promote', async (req, res) => {
  console.log('📥 PROMOTE request received');
  console.log('📋 Body:', req.body);
  
  try {
    // Check auth
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }
    if (apiKey !== AUTH_TOKEN) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    const { robloxUsername, reason } = req.body;
    if (!robloxUsername || !reason) {
      return res.status(400).json({ error: 'robloxUsername and reason are required' });
    }

    // Get user ID
    const userId = await getUserId(robloxUsername);
    
    // Get all roles
    const roles = await getGroupRoles();
    
    // Get user's current role
    const currentRole = await getUserRole(userId);
    
    // Find current index
    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'User is already at the highest rank' });
    }
    
    const newRole = roles[currentIdx + 1];
    
    // Change rank
    await changeUserRank(userId, newRole.id, reason);
    
    res.json({
      success: true,
      message: `Promoted ${robloxUsername} to ${newRole.name}`,
      newRank: newRole.name
    });
  } catch (error) {
    console.error('❌ Error in promote:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).json({
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ---------- DEMOTE ENDPOINT ----------
app.post('/utils/roblox/demote', async (req, res) => {
  console.log('📥 DEMOTE request received');
  console.log('📋 Body:', req.body);
  
  try {
    // Check auth
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }
    if (apiKey !== AUTH_TOKEN) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    const { robloxUsername, reason } = req.body;
    if (!robloxUsername || !reason) {
      return res.status(400).json({ error: 'robloxUsername and reason are required' });
    }

    const userId = await getUserId(robloxUsername);
    const roles = await getGroupRoles();
    const currentRole = await getUserRole(userId);
    
    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === 0) {
      return res.status(400).json({ error: 'User is already at the lowest rank' });
    }
    
    const newRole = roles[currentIdx - 1];
    await changeUserRank(userId, newRole.id, reason);
    
    res.json({
      success: true,
      message: `Demoted ${robloxUsername} to ${newRole.name}`,
      newRank: newRole.name
    });
  } catch (error) {
    console.error('❌ Error in demote:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).json({
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// ---------- SETRANK ENDPOINT ----------
app.post('/utils/roblox/setrank', async (req, res) => {
  console.log('📥 SETRANK request received');
  console.log('📋 Body:', req.body);
  
  try {
    // Check auth
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing x-api-key header' });
    }
    if (apiKey !== AUTH_TOKEN) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
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
    
    res.json({
      success: true,
      message: `Set ${robloxUsername} to ${targetRole.name}`,
      newRank: targetRole.name
    });
  } catch (error) {
    console.error('❌ Error in setrank:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    res.status(500).json({
      error: error.message,
      details: error.response?.data || null
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

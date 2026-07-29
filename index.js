// server.js - Fixed with correct endpoints
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ---------- Configuration from Environment ----------
const GROUP_ID = process.env.ROBLOX_GROUP_ID;
const API_KEY = process.env.ROBLOX_OPENCLOUD_API_KEY;
const AUTH_TOKEN = process.env.API_AUTH_TOKEN;

console.log('🚀 Server starting...');
console.log(`📦 Group ID: ${GROUP_ID}`);
console.log(`🔑 API Key: ${API_KEY ? 'set' : 'MISSING'}`);
console.log(`🔐 Auth Token: ${AUTH_TOKEN ? 'set' : 'MISSING'}`);

const OPENCLOUD_BASE = 'https://apis.roblox.com/cloud/v2';
const GROUPS_API = 'https://groups.roblox.com/v1';

// ---------- Helper Functions ----------

async function getGroupRoles() {
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`;
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    let roles = null;
    if (response.data.groupRoles) roles = response.data.groupRoles;
    else if (response.data.roles) roles = response.data.roles;
    else if (Array.isArray(response.data)) roles = response.data;
    
    if (!roles) {
      throw new Error('No roles found in response');
    }
    
    console.log(`✅ Found ${roles.length} roles`);
    return roles.sort((a, b) => a.rank - b.rank);
  } catch (error) {
    console.error('❌ Error in getGroupRoles:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
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

async function getUserRole(userId) {
  const url = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 User role response:', response.data);
    return response.data.role;
  } catch (error) {
    console.error('❌ Error in getUserRole:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
}

async function updateUserRank(userId, roleId, reason = '') {
  // CORRECT ENDPOINT: Use POST to change user rank
  // The endpoint is /groups/{groupId}/users/{userId}
  // But we need to use the correct method
  
  // Try using OpenCloud with POST instead of PATCH
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
  console.log(`📤 POST ${url}`);
  console.log(`📦 Payload:`, { roleId, reason });
  
  try {
    const response = await axios.post(url, {
      roleId: roleId,
      reason: reason
    }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Rank updated successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error in updateUserRank (POST):', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    
    // If POST fails, try PATCH as fallback
    console.log('🔄 Trying PATCH as fallback...');
    try {
      const response = await axios.patch(url, {
        roleId: roleId,
        reason: reason
      }, {
        headers: {
          'x-api-key': API_KEY.trim(),
          'Content-Type': 'application/json',
        }
      });
      
      console.log('✅ Rank updated successfully (PATCH)');
      return response.data;
    } catch (fallbackError) {
      console.error('❌ Fallback PATCH also failed:', fallbackError.message);
      if (fallbackError.response) {
        console.error('Status:', fallbackError.response.status);
        console.error('Data:', fallbackError.response.data);
      }
      throw fallbackError;
    }
  }
}

// ---------- TEST ENDPOINT ----------
app.get('/utils/roblox/test-api-key', async (req, res) => {
  console.log('🧪 Running API key test...');
  
  try {
    const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles`;
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
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

// ---------- TEST USER ROLE ENDPOINT ----------
app.get('/utils/roblox/test-user-role/:username', async (req, res) => {
  console.log('🧪 Testing user role endpoint...');
  
  try {
    const { username } = req.params;
    const userId = await getUserId(username);
    
    const url = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    res.json({
      success: true,
      userId: userId,
      role: response.data.role,
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
    console.log(`👤 User ID: ${userId}`);
    
    const roles = await getGroupRoles();
    console.log(`📋 Found ${roles.length} roles`);
    
    const currentRole = await getUserRole(userId);
    console.log(`📋 Current role: ${currentRole.name} (rank ${currentRole.rank})`);
    
    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'User is already at the highest rank' });
    }
    
    const newRole = roles[currentIdx + 1];
    console.log(`📋 New role: ${newRole.name} (rank ${newRole.rank})`);
    
    await updateUserRank(userId, newRole.id, reason);
    
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
    await updateUserRank(userId, newRole.id, reason);
    
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
    
    await updateUserRank(userId, targetRole.id, reason);
    
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

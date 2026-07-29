// server.js - Using Groups API for ranking (more reliable)
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

const OPENCLOUD_BASE = 'https://apis.roblox.com/cloud/v2';
const GROUPS_API = 'https://groups.roblox.com/v1';

// ---------- Helper Functions ----------

async function getGroupRoles() {
  // Using OpenCloud - this works ✅
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=100`;
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

// ---------- USING GROUPS API (NOT OPENCLOUD) FOR RANKING ----------
// This is the traditional Roblox Groups API that uses API keys

async function promoteUserTraditional(userId, reason = '') {
  // The traditional Groups API for promoting
  const url = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
  console.log(`📤 POST ${url}`);
  console.log(`📦 Reason: ${reason}`);
  
  try {
    // First, get the user's current role
    const getRoleUrl = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
    const roleResponse = await axios.get(getRoleUrl, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Current role data:', roleResponse.data);
    
    if (!roleResponse.data || !roleResponse.data.role) {
      throw new Error('User has no role in the group');
    }
    
    const currentRoleId = roleResponse.data.role.id;
    console.log(`📋 Current role ID: ${currentRoleId}`);
    
    // Get all roles to find the next one
    const roles = await getGroupRoles();
    const currentIdx = roles.findIndex(r => r.id === currentRoleId);
    
    if (currentIdx === -1) {
      throw new Error('Current role not found in role list');
    }
    if (currentIdx === roles.length - 1) {
      throw new Error('User is already at the highest rank');
    }
    
    const newRole = roles[currentIdx + 1];
    console.log(`📋 New role: ${newRole.displayName} (rank ${newRole.rank})`);
    
    // Update the user's role using PATCH
    const updateUrl = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
    const response = await axios.patch(updateUrl, {
      roleId: newRole.id
    }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Rank updated successfully');
    return { newRole: newRole, data: response.data };
  } catch (error) {
    console.error('❌ Error in promoteUserTraditional:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function demoteUserTraditional(userId, reason = '') {
  const url = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
  console.log(`📤 POST ${url}`);
  
  try {
    // Get user's current role
    const getRoleUrl = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
    const roleResponse = await axios.get(getRoleUrl, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    const currentRoleId = roleResponse.data.role.id;
    const roles = await getGroupRoles();
    const currentIdx = roles.findIndex(r => r.id === currentRoleId);
    
    if (currentIdx === -1) {
      throw new Error('Current role not found in role list');
    }
    if (currentIdx === 0) {
      throw new Error('User is already at the lowest rank');
    }
    
    const newRole = roles[currentIdx - 1];
    
    // Update the user's role
    const response = await axios.patch(url, {
      roleId: newRole.id
    }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Rank updated successfully');
    return { newRole: newRole, data: response.data };
  } catch (error) {
    console.error('❌ Error in demoteUserTraditional:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
}

async function setRankTraditional(userId, roleId, reason = '') {
  const url = `${GROUPS_API}/groups/${GROUP_ID}/users/${userId}`;
  console.log(`📤 PATCH ${url}`);
  
  try {
    const response = await axios.patch(url, {
      roleId: roleId
    }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Rank updated successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error in setRankTraditional:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
}

// ---------- TEST ENDPOINT ----------
app.get('/utils/roblox/test-api-key', async (req, res) => {
  console.log('🧪 Running API key test...');
  
  try {
    const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/roles?maxPageSize=10`;
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

// Test user role (check if user is in the group)
app.get('/utils/roblox/test-user/:username', async (req, res) => {
  console.log('🧪 Testing user lookup...');
  
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
    
    console.log('📊 User data:', response.data);
    
    res.json({
      success: true,
      userId: userId,
      username: username,
      isInGroup: true,
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
      details: error.response?.data || null,
      isInGroup: false
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
    const result = await promoteUserTraditional(userId, reason);
    
    res.json({
      success: true,
      message: `Promoted ${robloxUsername} to ${result.newRole.displayName}`,
      newRank: result.newRole.displayName
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
    const result = await demoteUserTraditional(userId, reason);
    
    res.json({
      success: true,
      message: `Demoted ${robloxUsername} to ${result.newRole.displayName}`,
      newRank: result.newRole.displayName
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
    
    const targetRole = roles.find(r => r.displayName.toLowerCase() === rankName.toLowerCase());
    if (!targetRole) {
      return res.status(404).json({ error: `Rank "${rankName}" not found in group` });
    }
    
    await setRankTraditional(userId, targetRole.id, reason);
    
    res.json({
      success: true,
      message: `Set ${robloxUsername} to ${targetRole.displayName}`,
      newRank: targetRole.displayName
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

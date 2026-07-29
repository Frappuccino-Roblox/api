// server.js - Using OpenCloud for GET and Traditional API for POST/PATCH
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
    
    console.log('📊 Response keys:', Object.keys(response.data));
    
    if (!response.data) {
      throw new Error('No data received from Roblox API');
    }
    
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

// ---------- TRADITIONAL ROBLOX API FOR RANKING (with cookie) ----------
// Note: For this to work, you need to use a cookie instead of API key
// Or we can try OpenCloud with a different approach

async function promoteUser(groupId, userId) {
  // Traditional Roblox API endpoint
  const url = `https://www.roblox.com/groups/${groupId}/users/${userId}/promote`;
  console.log(`📤 POST ${url}`);
  
  try {
    const response = await axios.post(url, {}, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Error promoting user:', error.message);
    throw error;
  }
}

async function demoteUser(groupId, userId) {
  const url = `https://www.roblox.com/groups/${groupId}/users/${userId}/demote`;
  console.log(`📤 POST ${url}`);
  
  try {
    const response = await axios.post(url, {}, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Error demoting user:', error.message);
    throw error;
  }
}

async function setRank(groupId, userId, roleId) {
  // Try OpenCloud PATCH first
  const url = `${OPENCLOUD_BASE}/groups/${groupId}/users/${userId}`;
  console.log(`📤 PATCH ${url}`);
  
  try {
    const response = await axios.patch(url, { roleId }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Error setting rank:', error.message);
    throw error;
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
    
    console.log('✅ Test successful!');
    
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
    
    // Get user's current role using OpenCloud
    const userRoleUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
    console.log(`📤 GET ${userRoleUrl}`);
    
    let currentRole;
    try {
      const userResponse = await axios.get(userRoleUrl, {
        headers: {
          'x-api-key': API_KEY.trim(),
          'Content-Type': 'application/json',
        }
      });
      currentRole = userResponse.data.role;
      console.log('✅ Got current role:', currentRole.name);
    } catch (error) {
      console.error('❌ Error getting user role:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      throw new Error('Could not get user role. User might not be in the group.');
    }
    
    // Find current index
    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'User is already at the highest rank' });
    }
    
    const newRole = roles[currentIdx + 1];
    console.log(`📋 New role: ${newRole.name} (rank ${newRole.rank})`);
    
    // Try to promote using OpenCloud PATCH
    try {
      const patchUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
      console.log(`📤 PATCH ${patchUrl}`);
      console.log(`📦 Payload:`, { roleId: newRole.id, reason });
      
      const response = await axios.patch(patchUrl, { 
        roleId: newRole.id,
        reason: reason 
      }, {
        headers: {
          'x-api-key': API_KEY.trim(),
          'Content-Type': 'application/json',
        }
      });
      
      console.log('✅ Promotion successful!');
      
      res.json({
        success: true,
        message: `Promoted ${robloxUsername} to ${newRole.name}`,
        newRank: newRole.name
      });
    } catch (error) {
      console.error('❌ PATCH failed:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      
      // If PATCH fails, return the error
      throw new Error(`Failed to promote: ${error.message}`);
    }
    
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
    
    // Get user's current role
    const userRoleUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
    const userResponse = await axios.get(userRoleUrl, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    const currentRole = userResponse.data.role;
    
    const currentIdx = roles.findIndex(r => r.id === currentRole.id);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === 0) {
      return res.status(400).json({ error: 'User is already at the lowest rank' });
    }
    
    const newRole = roles[currentIdx - 1];
    
    // Demote using OpenCloud PATCH
    const patchUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
    await axios.patch(patchUrl, { 
      roleId: newRole.id,
      reason: reason 
    }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
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
    
    // Set rank using OpenCloud PATCH
    const patchUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/users/${userId}`;
    await axios.patch(patchUrl, { 
      roleId: targetRole.id,
      reason: reason 
    }, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
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

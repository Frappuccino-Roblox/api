// server.js - OpenCloud only (no cookies)
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

// ---------- OPENCLOUD RANKING FUNCTIONS ----------

async function getMembershipId(userId) {
  const filter = `user == 'users/${userId}'`;
  const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships?maxPageSize=10&filter=${encodeURIComponent(filter)}`;
  console.log(`📤 GET ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('📊 Membership response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.groupMemberships && response.data.groupMemberships.length > 0) {
      const path = response.data.groupMemberships[0].path;
      const parts = path.split('/');
      const membershipId = parts[parts.length - 1];
      console.log(`✅ Found membership ID: ${membershipId}`);
      return membershipId;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error in getMembershipId:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return null;
  }
}

async function updateUserRankOpenCloud(userId, roleId) {
  try {
    // Get membership ID
    const membershipId = await getMembershipId(userId);
    if (!membershipId) {
      throw new Error('User is not in the group');
    }
    
    const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`;
    console.log(`📤 PATCH ${url}`);
    
    const payload = {
      role: `groups/${GROUP_ID}/roles/${roleId}`
    };
    
    console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));
    
    const response = await axios.patch(url, payload, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Rank updated successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error in updateUserRankOpenCloud:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

// ---------- TEST ENDPOINTS ----------

// Test API key
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

// Test if user is in the group
app.get('/utils/roblox/test-user/:username', async (req, res) => {
  console.log('🧪 Testing user membership...');
  
  try {
    const { username } = req.params;
    const userId = await getUserId(username);
    
    const membershipId = await getMembershipId(userId);
    
    if (membershipId) {
      // Get the membership details
      const url = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`;
      const response = await axios.get(url, {
        headers: {
          'x-api-key': API_KEY.trim(),
          'Content-Type': 'application/json',
        }
      });
      
      res.json({
        success: true,
        userId: userId,
        username: username,
        isInGroup: true,
        membershipId: membershipId,
        role: response.data.role,
        fullResponse: response.data
      });
    } else {
      res.json({
        success: true,
        userId: userId,
        username: username,
        isInGroup: false,
        message: 'User is not in the group'
      });
    }
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

// ---------- RANKING ENDPOINTS ----------

// PROMOTE
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

    // Get user ID
    const userId = await getUserId(robloxUsername);
    console.log(`👤 User ID: ${userId}`);
    
    // Check if user is in the group
    const membershipId = await getMembershipId(userId);
    if (!membershipId) {
      return res.status(404).json({ 
        error: 'User not in group',
        message: `${robloxUsername} is not a member of this group`
      });
    }
    console.log(`✅ Membership ID: ${membershipId}`);
    
    // Get user's current role from membership
    const membershipUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`;
    const membershipResponse = await axios.get(membershipUrl, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    const currentRolePath = membershipResponse.data.role;
    const currentRoleId = currentRolePath.split('/').pop();
    console.log(`📋 Current role ID: ${currentRoleId}`);
    
    // Get all roles
    const roles = await getGroupRoles();
    
    // Find current index
    const currentIdx = roles.findIndex(r => r.id === currentRoleId);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === roles.length - 1) {
      return res.status(400).json({ error: 'User is already at the highest rank' });
    }
    
    const newRole = roles[currentIdx + 1];
    console.log(`📋 New role: ${newRole.displayName} (rank ${newRole.rank})`);
    
    // Update rank
    await updateUserRankOpenCloud(userId, newRole.id);
    
    res.json({
      success: true,
      message: `Promoted ${robloxUsername} to ${newRole.displayName}`,
      newRank: newRole.displayName
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

// DEMOTE
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
    console.log(`👤 User ID: ${userId}`);
    
    // Check if user is in the group
    const membershipId = await getMembershipId(userId);
    if (!membershipId) {
      return res.status(404).json({ 
        error: 'User not in group',
        message: `${robloxUsername} is not a member of this group`
      });
    }
    console.log(`✅ Membership ID: ${membershipId}`);
    
    // Get user's current role
    const membershipUrl = `${OPENCLOUD_BASE}/groups/${GROUP_ID}/memberships/${membershipId}`;
    const membershipResponse = await axios.get(membershipUrl, {
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json',
      }
    });
    
    const currentRolePath = membershipResponse.data.role;
    const currentRoleId = currentRolePath.split('/').pop();
    console.log(`📋 Current role ID: ${currentRoleId}`);
    
    const roles = await getGroupRoles();
    
    const currentIdx = roles.findIndex(r => r.id === currentRoleId);
    if (currentIdx === -1) {
      return res.status(404).json({ error: 'Current role not found in group' });
    }
    if (currentIdx === 0) {
      return res.status(400).json({ error: 'User is already at the lowest rank' });
    }
    
    const newRole = roles[currentIdx - 1];
    console.log(`📋 New role: ${newRole.displayName} (rank ${newRole.rank})`);
    
    await updateUserRankOpenCloud(userId, newRole.id);
    
    res.json({
      success: true,
      message: `Demoted ${robloxUsername} to ${newRole.displayName}`,
      newRank: newRole.displayName
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

// SETRANK
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
    console.log(`👤 User ID: ${userId}`);
    
    // Check if user is in the group
    const membershipId = await getMembershipId(userId);
    if (!membershipId) {
      return res.status(404).json({ 
        error: 'User not in group',
        message: `${robloxUsername} is not a member of this group`
      });
    }
    console.log(`✅ Membership ID: ${membershipId}`);
    
    const roles = await getGroupRoles();
    
    const targetRole = roles.find(r => r.displayName.toLowerCase() === rankName.toLowerCase());
    if (!targetRole) {
      return res.status(404).json({ error: `Rank "${rankName}" not found in group` });
    }
    
    console.log(`📋 Target role: ${targetRole.displayName} (rank ${targetRole.rank})`);
    
    await updateUserRankOpenCloud(userId, targetRole.id);
    
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

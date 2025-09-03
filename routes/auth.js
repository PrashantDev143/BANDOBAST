const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const User = require('../models/User');

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get or create user in MongoDB
    let user = await User.findOne({ supabaseId: data.user.id });
    
    if (!user) {
      // Create new user record
      user = new User({
        supabaseId: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.name || 'Unknown',
        role: data.user.user_metadata.role || 'officer',
        phone: data.user.user_metadata.phone || ''
      });
      await user.save();
    }

    // Update last active
    user.lastActive = new Date();
    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        supabaseId: user.supabaseId,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        badgeNumber: user.badgeNumber
      },
      session: data.session,
      redirectTo: user.role === 'supervisor' ? '/dashboard' : '/officer'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role, phone, badgeNumber } = req.body;

    // Create user in Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          phone,
          badge_number: badgeNumber
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Create user in MongoDB
    const user = new User({
      supabaseId: data.user.id,
      email,
      name,
      role,
      phone,
      badgeNumber: role === 'officer' ? badgeNumber : undefined
    });

    await user.save();

    res.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Account creation failed' });
  }
});

// Logout route
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    const user = await User.findOne({ supabaseId: data.user.id });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        supabaseId: user.supabaseId,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        badgeNumber: user.badgeNumber,
        department: user.department
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

module.exports = router;
const { createClient } = require('@supabase/supabase-js');
const User = require('../models/User');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get user from MongoDB
    const user = await User.findOne({ supabaseId: data.user.id });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Update last active
    user.lastActive = new Date();
    await user.save();

    // Attach user to request
    req.user = user;
    req.supabaseUser = data.user;
    
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Role-based access middleware
const requireSupervisor = (req, res, next) => {
  if (req.user.role !== 'supervisor') {
    return res.status(403).json({ error: 'Supervisor access required' });
  }
  next();
};

const requireOfficer = (req, res, next) => {
  if (req.user.role !== 'officer') {
    return res.status(403).json({ error: 'Officer access required' });
  }
  next();
};

module.exports = {
  authMiddleware,
  requireSupervisor,
  requireOfficer
};
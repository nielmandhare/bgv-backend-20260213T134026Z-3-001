const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../utils/db');
const User = require('../models/User');

// ── Token helpers ─────────────────────────────────────────────────────────────

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      tenant_id: user.tenant_id  // ✅ included for both login & refresh
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
};

// ── Login ─────────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    res.json({ accessToken, refreshToken });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── Refresh Token ─────────────────────────────────────────────────────────────

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const result = await db.query(
      'SELECT * FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    // ✅ fetch user so generateAccessToken has all required fields
    //const user = await User.findById(decoded.id);
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const accessToken = generateAccessToken(user);  // ✅ reuses helper, consistent payload

    res.json({ accessToken });

  } catch (err) {
    console.error(err);
    res.status(403).json({ message: 'Invalid refresh token' });
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token required' });
    }

    await db.query(
      'DELETE FROM refresh_tokens WHERE token = $1',
      [refreshToken]
    );

    res.json({ message: 'Logged out successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
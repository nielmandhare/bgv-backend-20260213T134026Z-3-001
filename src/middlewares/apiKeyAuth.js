require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.BGV_API_KEY;

  // ── Guard: fail loudly at startup if key is not configured ──
  if (!expectedKey) {
    console.error('❌ FATAL: BGV_API_KEY is not set in environment variables.');
    return res.status(500).json({
      success: false,
      message: 'Server misconfiguration: API key not set.'
    });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized: Invalid API Key'
    });
  }

  next();
}

module.exports = apiKeyAuth;
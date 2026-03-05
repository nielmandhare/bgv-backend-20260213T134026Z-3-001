function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];


  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized: Invalid API Key"
    });
  }

  next();
}

module.exports = apiKeyAuth;

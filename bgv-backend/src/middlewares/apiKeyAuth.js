function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  console.log("Header API Key:", apiKey);
  console.log("Env API Key:", process.env.API_KEY);

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized: Invalid API Key"
    });
  }

  next();
}

module.exports = apiKeyAuth;

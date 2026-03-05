// Simple auth middleware for testing
module.exports = {
  authenticate: (req, res, next) => {
    // Set test user for all requests
    req.user = {
      user_id: '047d6220-fb0b-475a-a7c0-585acceb5e97',
      tenant_id: '7e204e4c-c1f3-43b1-8671-0c8e4f82337a',
      email: 'test@shovelsolutions.in',
      name: 'Test User'
    };
    next();
  }
};

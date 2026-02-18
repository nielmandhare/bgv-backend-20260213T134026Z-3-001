const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');

const validate = require('../middlewares/validate');
const { loginSchema } = require('../validator/authValidator');

router.post(
    '/login',
    validate(loginSchema),
    authController.login
);

router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

module.exports = router;

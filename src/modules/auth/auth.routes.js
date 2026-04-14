const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, z } = require('../../middleware/validate');

const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(['Superadmin', 'Manager', 'Editor', 'Viewer']).optional().default('Viewer'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.get('/users', authenticate, authController.getAllUsers);
router.post('/users', authenticate, validate(registerSchema), authController.createUser);
router.put('/users/:id', authenticate, authController.updateUser);
router.put('/users/:id/permissions', authenticate, authController.updatePermissions);
router.delete('/users/:id', authenticate, authController.deleteUser);
router.post('/logout', authenticate, authController.logout);

module.exports = router;

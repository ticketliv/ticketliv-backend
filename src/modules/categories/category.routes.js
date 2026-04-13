const express = require('express');
const router = express.Router();
const categoryController = require('./category.controller');
const { authenticate } = require('../../middleware/auth');
const { validate, z } = require('../../middleware/validate');

const categorySchema = z.object({
  name: z.string().min(1).max(100),
  icon_name: z.string().optional().default('Sparkles'),
  iconName: z.string().optional(),
  color: z.string().optional().default('indigo'),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
});

router.get('/', categoryController.getAll);
router.get('/:id', categoryController.getById);
router.post('/', authenticate, validate(categorySchema), categoryController.create);
router.put('/:id', authenticate, categoryController.update);
router.delete('/:id', authenticate, categoryController.remove);

module.exports = router;

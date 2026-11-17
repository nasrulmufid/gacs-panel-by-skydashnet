import express from 'express';
import DbManagementController from '../controllers/dbManagementController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/config', authenticateToken, requireRole(['admin']), DbManagementController.getConfig);
router.post('/test', authenticateToken, requireRole(['admin']), DbManagementController.testConnection);
router.post('/switch', authenticateToken, requireRole(['admin']), DbManagementController.switchDatabase);
router.get('/backup', authenticateToken, requireRole(['admin']), DbManagementController.exportBackup);
router.post('/restore', authenticateToken, requireRole(['admin']), DbManagementController.restoreBackup);

export default router;

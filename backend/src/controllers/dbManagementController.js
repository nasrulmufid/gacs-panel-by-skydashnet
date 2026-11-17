import * as dbManagement from '../services/dbManagementService.js';

const DbManagementController = {
  async getConfig(req, res) {
    try {
      const config = dbManagement.getActiveConfig();
      res.json({ success: true, message: 'Active database config', data: config });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async testConnection(req, res) {
    try {
      await dbManagement.testConfig(req.body || {});
      res.json({ success: true, message: 'Connection successful' });
    } catch (error) {
      res.status(400).json({ success: false, message: `Connection failed: ${error.message}` });
    }
  },

  async switchDatabase(req, res) {
    try {
      const { migrateData, ...config } = req.body || {};
      const active = await dbManagement.switchDatabase(config, { migrateData: Boolean(migrateData) });
      res.json({
        success: true,
        message: 'Database switched successfully and is now active.',
        data: active
      });
    } catch (error) {
      res.status(400).json({ success: false, message: `Switch failed: ${error.message}` });
    }
  },

  async exportBackup(req, res) {
    try {
      const data = await dbManagement.exportBackup();
      res.json({ success: true, message: 'Backup database berhasil dibuat', data });
    } catch (error) {
      res.status(500).json({ success: false, message: `Backup failed: ${error.message}` });
    }
  },

  async restoreBackup(req, res) {
    try {
      const { backup, preserveCurrentAdmin } = req.body || {};
      const result = await dbManagement.importBackup(backup, {
        preserveCurrentAdmin: Boolean(preserveCurrentAdmin)
      });
      res.json({
        success: true,
        message: 'Database berhasil di-restore',
        data: result
      });
    } catch (error) {
      res.status(400).json({ success: false, message: `Restore failed: ${error.message}` });
    }
  }
};

export default DbManagementController;

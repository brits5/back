const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');

router.post('/test-connection', auditController.testConnection);
router.post('/check-referential-integrity', auditController.checkReferentialIntegrity);
router.post('/check-constraint-anomalies', auditController.checkConstraintAnomalies);
router.post('/check-data-anomalies', auditController.checkDataAnomalies);
router.get('/logs', auditController.getLogs);

module.exports = router;
const express = require('express');
const ClientController = require('../controllers/clientController');
const ClientService = require('../services/clientService');
const ClientRepository = require('../repositories/clientRepository');
const ClientValidator = require('../validators/clientValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');
// Checking deployment
const router = express.Router();

const clientRepository = new ClientRepository(db);
const clientService = new ClientService(clientRepository, db);
const clientController = new ClientController(clientService);
router.use(authenticate);
router.use(auditContextMiddleware);
router.get('/all',
    clientController.getAllClientsWithDepartment
);

router.get('/',
    clientController.getAllClients
);

router.post('/',
    ClientValidator.validateCreate,
    clientController.createClient
);

router.get('/audit-logs/changes',
    clientController.getClientChangeLogs
);

router.get('/audit-logs/deletions',
    clientController.getClientDeleteLogs
);

router.get('/deletions',
    clientController.getDeletedClients
);

router.get('/:clientId/audit-logs',
    ClientValidator.validateAuditClientId,
    clientController.getClientAuditLogsById
);

router.get('/:id',
    ClientValidator.validateDelete,
    clientController.getClient
);

router.patch('/:id/restore',
    ClientValidator.validateDelete,
    clientController.restoreClient
);

router.patch('/:id',
    ClientValidator.validateUpdate,
    clientController.updateClient
);

router.delete('/:id',
    ClientValidator.validateDelete,
    clientController.deleteClient
);

module.exports = router;

const express = require('express');
const ClientController = require('../controllers/clientController');
const ClientService = require('../services/clientService');
const ClientRepository = require('../repositories/clientRepository');
const ClientValidator = require('../validators/clientValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

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

router.get('/:id',
    ClientValidator.validateDelete,
    clientController.getClient
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
const express = require('express');
const ClientController = require('../controllers/clientController');
const ClientService = require('../services/clientService');
const ClientRepository = require('../repositories/clientRepository');
const ClientValidator = require('../validators/clientValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');

const router = express.Router();

// Dependency injection
const clientRepository = new ClientRepository(db);
const clientService = new ClientService(clientRepository, db);
const clientController = new ClientController(clientService);
router.use(authenticate);

// Routes
/*router.get('/client/:clientId',
    departmentController.getDepartmentsByClient
);*/

/*router.get('/all', async (req, res) => {
    const client = await db.getConnection();
    try {
        const [clientDetails] = await client.query(`
            SELECT 
              c.clientId, 
              c.clientName, 
              COALESCE(d.departments, JSON_ARRAY()) AS departments
            FROM 
              client c
            LEFT JOIN (
              SELECT 
                clientId, 
                JSON_ARRAYAGG(
                  JSON_OBJECT('departmentId', departmentId, 'departmentName', departmentName)
                ) AS departments
              FROM department
              GROUP BY clientId
            ) d ON c.clientId = d.clientId;
        `);

        res.json({
            success: true,
            data: clientDetails,
            count: clientDetails.length
        });
    } catch (error) {
        console.error('Error fetching clients:', error.stack || error.message);
        res.status(500).json({
            success: false,
            error: "SERVER_ERROR",
            message: "Failed to fetch client details",
            details: { error: error.message }
        });
    } finally {
        client.release();
    }
});*/
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
    ClientValidator.validateDelete, // Reusing for ID validation
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
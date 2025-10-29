const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class DepartmentService {
    constructor(departmentRepository, db) {
        this.departmentRepository = departmentRepository;
        this.db = db;
    }

    async createDepartment(departmentData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const exists = await this.departmentRepository.existsByName(
                departmentData.departmentName,
                departmentData.clientId,
                null,
                client
            );

            if (exists) {
                throw new AppError(
                    'A department with this name already exists for this client',
                    409,
                    'DUPLICATE_DEPARTMENT_NAME'
                );
            }

            const department = await this.departmentRepository.create(departmentData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'CREATE',
                newValues: department,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return department;
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error creating Department', error.stack);
                throw new AppError(
                    'Failed to create Department',
                    500,
                    'DEPARTMENT_CREATION_ERROR',
                    { operation: 'createDepartment', departmentData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getDepartmentById(departmentId) {
        const client = await this.db.getConnection();
        try {
            const department = await this.departmentRepository.findById(departmentId, client);

            if (!department) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            return department;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Department with ID', error.stack);
                throw new AppError(
                    'Failed to FETCH Department',
                    500,
                    'DEPARTMENT_FETCH_ERROR',
                    { operation: 'getDepartmentById' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async updateDepartment(departmentId, updateData, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const existingDepartment = await this.departmentRepository.findById(departmentId, client);
            if (!existingDepartment) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            if (updateData.departmentName) {
                const exists = await this.departmentRepository.existsByName(
                    updateData.departmentName,
                    existingDepartment.clientId,
                    departmentId,
                    client
                );

                if (exists) {
                    throw new AppError(
                        'A department with this name already exists for this client',
                        409,
                        'DUPLICATE_DEPARTMENT_NAME'
                    );
                }
            }

            const department = await this.departmentRepository.update(departmentId, updateData, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'UPDATE',
                newValues: department,
                oldValues: existingDepartment,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return await this.departmentRepository.findById(departmentId, client);
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error updating Department', error.stack);
                throw new AppError(
                    'Failed to update Department',
                    500,
                    'DEPARTMENT_UPDATION_ERROR',
                    { operation: 'updateDepartment', updateData }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteDepartment(departmentId, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const department = await this.departmentRepository.findById(departmentId, client);
            if (!department) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            await this.departmentRepository.delete(departmentId, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return { deletedDepartment: department };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error deleting Department', error.stack);
                throw new AppError(
                    'Failed to delete Department',
                    500,
                    'DEPARTMENT_DELETION_ERROR',
                    { departmentId, operation: 'deleteDepartment' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getDepartmentsByClientId(clientId) {
        const client = await this.db.getConnection();
        try {
            return await this.departmentRepository.findByClientId(clientId, client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error deleting Department', error.stack);
                throw new AppError(
                    'Failed to delete Department',
                    500,
                    'DEPARTMENT_DELETION_ERROR',
                    { departmentId, operation: 'deleteDepartment' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = DepartmentService;
const AppError = require('../utils/appError');

class DepartmentService {
    constructor(departmentRepository, db) {
        this.departmentRepository = departmentRepository;
        this.db = db;
    }

    async createDepartment(departmentData) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            // Check if department name already exists for this client
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
            await client.commit();

            return department;
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getDepartmentById(departmentId) {
        const department = await this.departmentRepository.findById(departmentId);

        if (!department) {
            throw new AppError(
                `Department with ID ${departmentId} not found`,
                404,
                'DEPARTMENT_NOT_FOUND'
            );
        }

        return department;
    }

    async updateDepartment(departmentId, updateData) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            // Check if department exists
            const existingDepartment = await this.departmentRepository.findById(departmentId, client);
            if (!existingDepartment) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            // If updating name, check for duplicates
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

            await this.departmentRepository.update(departmentId, updateData, client);
            await client.commit();

            // Return updated department
            return await this.departmentRepository.findById(departmentId);
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteDepartment(departmentId) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            // Check if department exists before deletion
            const department = await this.departmentRepository.findById(departmentId, client);
            if (!department) {
                throw new AppError(
                    `Department with ID ${departmentId} not found`,
                    404,
                    'DEPARTMENT_NOT_FOUND'
                );
            }

            await this.departmentRepository.delete(departmentId, client);
            await client.commit();

            return { deletedDepartment: department };
        } catch (error) {
            await client.rollback();
            throw error;
        } finally {
            client.release();
        }
    }

    async getDepartmentsByClientId(clientId) {
        return await this.departmentRepository.findByClientId(clientId);
    }
}

module.exports = DepartmentService;
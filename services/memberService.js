const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class MemberService {
    constructor(memberRepository, db) {
        this.db = db;
        this.memberRepository = memberRepository;
    }

    async getMemberFormData() {
        const client = await this.db.getConnection();
        try {
            const data = await this.memberRepository.getFormData(client);
            return data;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Member Form Data', error.stack);
                throw new AppError(
                    'Failed to fetch Member form data',
                    500,
                    'MEMBER_FORM_DATA_FETCH_ERROR',
                    { operation: 'getMemberFormData' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getCreateData() {
        const client = await this.db.getConnection();
        try {
            const data = await this.memberRepository.getCreateData(client);
            return data;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Member Create Form Data', error.stack);
                throw new AppError(
                    'Failed to fetch Member create form data',
                    500,
                    'MEMBER_FORM_DATA_FETCH_ERROR',
                    { operation: 'getCreateData' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getMemberById(memberId) {
        const client = await this.db.getConnection();
        try {
            const member = await this.memberRepository.findMemberById(memberId, client);

            if (!member) {
                throw new AppError(
                    `Member with ID ${memberId} not found`,
                    404,
                    'MEMBER_ID_NOT_FOUND'
                );
            }

            return member;
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching Member By ID', error.stack);
                throw new AppError(
                    'Failed to fetch Member',
                    500,
                    'MEMBER_FETCH_ERROR',
                    { operation: 'getMemberById', memberId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getAllMembers() {
        const client = await this.db.getConnection();
        try {
            return await this.memberRepository.findAll(client);
        } catch (error) {
            if (!(error instanceof AppError)) {
                console.error('Error Fetching All Members', error.stack);
                throw new AppError(
                    'Failed to fetch all Members',
                    500,
                    'MEMBER_FETCH_ERROR',
                    { operation: 'getAllMembers' }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async updateMember(memberId, updateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingMember = await this.memberRepository.findById(memberId, client);
            const isCurrentlyRecruiter = existingMember.isRecruiter;
            // Vendor can only be associated with recruiters
            if (
                updateData.vendorId != null &&   // catches only real values
                !isCurrentlyRecruiter &&
                updateData.isRecruiter !== true
            ) {
                throw new AppError(
                    'Vendor can only be associated with recruiters',
                    400,
                    'VENDOR_ASSOCIATION_NOT_ALLOWED'
                );
            }

            if (updateData.isRecruiter === false) {
                updateData.vendorId = null;
            }

            if (
                updateData.vendorId !== undefined &&
                (isCurrentlyRecruiter || updateData.isRecruiter === true)
            ) {
                await this.memberRepository.validateVendorExists(
                    updateData.vendorId,
                    client
                );
            }
            if (!existingMember) {
                throw new AppError(
                    `Member with ID ${memberId} does not exist`,
                    404,
                    "MEMBER_NOT_FOUND",
                    {
                        memberId,
                        suggestion: "Please verify the Member ID and try again"
                    }
                );
            }

            if (updateData.isInterviewer === false && existingMember.isInterviewer === true) {
                updateData.interviewerCapacity = null;
            }

            let skillsUpdateResult = null;
            if (updateData.skills !== undefined) {
                const skillsData = updateData.skills;
                delete updateData.skills;

                skillsUpdateResult = await this.memberRepository.replaceInterviewerSkills(
                    memberId,
                    skillsData,
                    client
                );

                console.log(`Skills updated for member ${memberId}: ${skillsUpdateResult.skillsCount} skills`);
            }

            let updatedMember = existingMember;
            if (Object.keys(updateData).length > 0) {
                updatedMember = await this.memberRepository.updateMember(
                    memberId,
                    updateData,
                    client
                );
            }

            if (auditContext) {
                await auditLogService.logAction({
                    userId: auditContext.userId,
                    action: 'UPDATE',
                    previousValues: existingMember,
                    newValues: {
                        ...updatedMember,
                        ...(skillsUpdateResult && { skillsUpdated: skillsUpdateResult.skillsCount })
                    },
                    ipAddress: auditContext.ipAddress,
                    userAgent: auditContext.userAgent,
                    timestamp: auditContext.timestamp
                }, client);
            }

            await client.commit();

            return await this.memberRepository.findMemberById(memberId, client);

        } catch (error) {
            await client.rollback();
            if (error instanceof AppError) {
                throw error;
            }

            console.error("Error updating Member", error.stack);
            throw new AppError(
                "Failed to update member entry",
                500,
                "MEMBER_UPDATE_ERROR",
                { operation: "updateMember", memberId }
            );
        } finally {
            client.release();
        }
    }

    /*async updateMember(memberId, updateData, auditContext) {
        const client = await this.db.getConnection();

        try {
            await client.beginTransaction();

            const existingMember = await this.memberRepository.findById(memberId, client);
            if (!existingMember) {
                throw new AppError(
                    `Member with ID ${memberId} does not exist`,
                    404,
                    "MEMBER_NOT_FOUND",
                    {
                        memberId,
                        suggestion: "Please verify the Member ID and try again"
                    }
                );
            }

            if (updateData.skills) {
                /*if (userRole === "admin" || userRole === "HR") {
                    throw new AppError(
                        "Admin or HR cannot update skillSet. Only the member can update personal skills.",
                        403,
                        "SKILLSET_UPDATE_FORBIDDEN"
                    );
                }*/

    /*for (const skill of updateData.skills) {
        console.log(skill);
        await this.memberRepository.createInterviewerSkill(memberId, skill, client);
    }
    delete updateData.skills;
}

/*if (updateData.designation) {
    if (userRole !== 'HR' || userRole !== 'admin') {
        throw new AppError(
            "Only Admin or HR can modify designation. Please contact them to edit designation.",
            403,
            "DESIGNATION_UPDATE_FORBIDDEN"
        )
    }
}*/

    /*let updatedMember = existingMember;

    if (Object.keys(updateData).length > 0) {
        updatedMember = await this.memberRepository.updateMember(
            memberId,
            updateData,
            client
        );
    }

    if (auditContext) {
        await auditLogService.logAction({
            userId: auditContext.userId,
            action: 'UPDATE',
            previousValues: existingMember,
            newValues: updatedMember,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            timestamp: auditContext.timestamp
        }, client);
    }
    await client.commit();

    return updatedMember;

} catch (error) {
    await client.rollback();
    if (error instanceof AppError) {
        throw error;
    }

    console.error("Error updating Member", error.stack);
    throw new AppError(
        "Failed to update member entry",
        500,
        "MEMBER_UPDATE_ERROR",
        { operation: "updateMember", memberId }
    );
} finally {
    client.release();
}
}*/

    async deleteMember(memberId, auditContext) {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const member = await this.memberRepository.findById(memberId, client);
            if (!member) {
                throw new AppError(
                    `Member with ID ${memberId} not found`,
                    404,
                    'MEMBER_NOT_FOUND'
                );
            }

            // Check if member has active candidates as recruiter
            const [candidateCount] = await client.execute(
                `SELECT COUNT(*) as count FROM candidate 
             WHERE recruiterId = ? AND deletedAt IS NULL`,
                [memberId]
            );

            if (candidateCount[0].count > 0) {
                throw new AppError(
                    `Cannot delete member. They are the recruiter for ${candidateCount[0].count} active candidate(s). Please reassign or delete candidates first.`,
                    400,
                    'MEMBER_HAS_CANDIDATES',
                    { memberId, candidateCount: candidateCount[0].count }
                );
            }

            const [interviewerResult] = await client.execute(
                `SELECT COUNT(*) as count FROM interview
             WHERE interviewerId = ? AND deletedAt IS NULL`,
                [memberId]
            );
            if (interviewerResult[0].count > 0) {
                throw new AppError(
                    `Cannot delete member. They are the interviewer for ${interviewerResult[0].count} active interview(s). Please reassign or delete interviews first.`,
                    400,
                    'MEMBER_HAS_INTERVIEWS',
                    { memberId, interviewerResult: interviewerResult[0].count }
                );
            }

            // Set scheduledById to NULL where member is scheduler (just metadata)
            const [schedulerResult] = await client.execute(
                `UPDATE interview 
             SET scheduledById = NULL 
             WHERE scheduledById = ? AND deletedAt IS NULL`,
                [memberId]
            );

            console.log(`Unlinked ${schedulerResult.affectedRows} interviews where member was scheduler`);

            await this.memberRepository.deactivateAccount(memberId, client);

            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);

            await client.commit();
            return {
                deletedMember: member,
                interviewsDeleted: interviewerResult.affectedRows,
                interviewsUnlinked: schedulerResult.affectedRows
            };
        } catch (error) {
            await client.rollback();
            if (!(error instanceof AppError)) {
                console.error('Error Member', error.stack);
                throw new AppError(
                    'Failed to Delete Member',
                    500,
                    'MEMBER_DELETE_ERROR',
                    { operation: 'deleteMember', memberId }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async permanentlyDeleteOldMembers() {
        const client = await this.db.getConnection();
        try {
            await client.beginTransaction();

            const [members] = await client.execute(
                `SELECT m.memberId 
             FROM member m
             WHERE m.isActive = FALSE 
             AND m.deletedAt IS NOT NULL 
             AND m.deletedAt <= DATE_SUB(NOW(), INTERVAL 15 DAY)
             AND NOT EXISTS (
                 SELECT 1 FROM candidate c 
                 WHERE c.recruiterId = m.memberId AND c.deletedAt IS NULL
             )
             AND NOT EXISTS (
                 SELECT 1 FROM interview i 
                 WHERE (i.interviewerId = m.memberId OR i.scheduledById = m.memberId) 
                 AND i.deletedAt IS NULL
             )`,
                []
            );

            if (members.length === 0) {
                await client.commit();
                console.log('No members to permanently delete');
                return 0;
            }

            console.log(`Found ${members.length} members to permanently delete`);

            const deletedCount = await this.memberRepository.permanentlyDeleteBatch(
                members.map(m => m.memberId),
                client
            );

            await client.commit();

            console.log(`${deletedCount} member records permanently deleted from database`);
            return deletedCount;

        } catch (error) {
            await client.rollback();
            console.error('Error in permanentlyDeleteOldMembers:', error);
            throw new AppError(
                'Failed to permanently delete old members',
                500,
                'PERMANENT_DELETE_ERROR',
                { operation: 'permanentlyDeleteOldMembers' }
            );
        } finally {
            client.release();
        }
    }
}

module.exports = MemberService;
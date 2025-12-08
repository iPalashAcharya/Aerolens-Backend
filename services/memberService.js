const AppError = require('../utils/appError');
const auditLogService = require('./auditLogService');

class MemberService {
    constructor(memberRepository, db) {
        this.db = db;
        this.memberRepository = memberRepository;
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

            await client.execute(
                `UPDATE interview 
             SET deletedAt = NOW() 
             WHERE interviewerId = ? AND deletedAt IS NULL`,
                [memberId]
            );

            await this.memberRepository.deactivateAccount(memberId, client);
            await auditLogService.logAction({
                userId: auditContext.userId,
                action: 'DELETE',
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                timestamp: auditContext.timestamp
            }, client);
            await client.commit();

            return { deletedMember: member };
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
                `SELECT memberId 
             FROM member 
             WHERE isActive = FALSE 
             AND deletedAt IS NOT NULL 
             AND deletedAt <= DATE_SUB(NOW(), INTERVAL 15 DAY)`,
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
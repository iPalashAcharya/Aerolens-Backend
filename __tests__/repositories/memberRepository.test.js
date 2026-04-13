jest.mock('../../db');

const db = require('../../db');
const MemberRepository = require('../../repositories/memberRepository');
const AppError = require('../../utils/appError');

describe('MemberRepository', () => {
    let repo;
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            query: jest.fn(),
            execute: jest.fn(),
            release: jest.fn(),
        };
        db.getConnection.mockResolvedValue(mockConn);
        repo = new MemberRepository();
    });

    describe('getFormData', () => {
        it('should return aggregated lookup data', async () => {
            mockConn.query
                .mockResolvedValueOnce([[{ designationId: 1, designationName: 'Dev' }]])
                .mockResolvedValueOnce([[{ vendorId: 2, vendorName: 'V' }]])
                .mockResolvedValueOnce([[{ clientId: 3, clientName: 'C' }]])
                .mockResolvedValueOnce([[{ skillId: 4, skillName: 'S' }]])
                .mockResolvedValueOnce([[{ locationId: 5, city: 'X', country: 'Y', state: 'Z' }]]);

            const result = await repo.getFormData(mockConn);

            expect(result.designations).toEqual([{ designationId: 1, designationName: 'Dev' }]);
            expect(result.vendors).toEqual([{ vendorId: 2, vendorName: 'V' }]);
            expect(result.clients).toEqual([{ clientId: 3, clientName: 'C' }]);
            expect(result.skills).toEqual([{ skillId: 4, skillName: 'S' }]);
            expect(result.locations[0].city).toBe('X');
        });
    });

    describe('getCreateData', () => {
        it('should return designations and vendors', async () => {
            mockConn.query
                .mockResolvedValueOnce([[{ designationId: 1, designationName: 'D' }]])
                .mockResolvedValueOnce([[{ vendorId: 1, vendorName: 'V' }]]);

            const result = await repo.getCreateData(mockConn);

            expect(result.designations).toHaveLength(1);
            expect(result.vendors).toHaveLength(1);
        });
    });

    describe('validateVendorExists', () => {
        it('should return true when vendor row exists', async () => {
            mockConn.execute.mockResolvedValue([[{ vendorId: 9 }]]);

            await expect(repo.validateVendorExists(9, mockConn)).resolves.toBe(true);
        });

        it('should throw AppError when vendor missing', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            await expect(repo.validateVendorExists(99, mockConn)).rejects.toMatchObject({
                statusCode: 400,
                errorCode: 'INVALID_VENDOR_ID',
            });
        });

        it('should rethrow AppError from validation', async () => {
            const err = new AppError('x', 400, 'X');
            mockConn.execute.mockRejectedValue(err);

            await expect(repo.validateVendorExists(1, mockConn)).rejects.toBe(err);
        });

        it('should wrap generic DB errors', async () => {
            mockConn.execute.mockRejectedValue(new Error('db down'));

            await expect(repo.validateVendorExists(1, mockConn)).rejects.toMatchObject({
                statusCode: 500,
                errorCode: 'DB_ERROR',
            });
        });
    });

    describe('findById', () => {
        it('should return member row when found', async () => {
            mockConn.execute.mockResolvedValue([[{ memberId: 1, memberName: 'A' }]]);

            const row = await repo.findById(1);

            expect(row.memberName).toBe('A');
            expect(mockConn.release).toHaveBeenCalled();
        });

        it('should return null when no row', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            await expect(repo.findById(404)).resolves.toBeNull();
        });

        it('should wrap execute errors', async () => {
            mockConn.execute.mockRejectedValue(new Error('fail'));

            await expect(repo.findById(1)).rejects.toBeInstanceOf(AppError);
        });
    });

    describe('findMemberById', () => {
        it('should parse skills JSON string and return first row', async () => {
            const row = {
                memberId: 1,
                skills: JSON.stringify([{ skillId: 's1', skillName: 'K' }]),
            };
            mockConn.execute.mockResolvedValue([[row]]);

            const out = await repo.findMemberById(1, mockConn);

            expect(Array.isArray(out.skills)).toBe(true);
            expect(out.skills[0].skillName).toBe('K');
        });

        it('should use db connection when client omitted', async () => {
            mockConn.execute.mockResolvedValue([[{ memberId: 2, skills: [] }]]);

            const out = await repo.findMemberById(2);

            expect(out.memberId).toBe(2);
            expect(mockConn.release).toHaveBeenCalled();
        });

        it('should return null when no member', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            await expect(repo.findMemberById(0, mockConn)).resolves.toBeNull();
        });

        it('should wrap DB errors', async () => {
            mockConn.execute.mockRejectedValue(new Error('x'));

            await expect(repo.findMemberById(1, mockConn)).rejects.toBeInstanceOf(AppError);
        });
    });

    describe('createInterviewerSkill', () => {
        it('should return insert payload', async () => {
            mockConn.execute.mockResolvedValue([{ insertId: 10 }]);

            const out = await repo.createInterviewerSkill(
                3,
                { skillName: 'sk', proficiencyLevel: 2, yearsOfExperience: 1 },
                mockConn
            );

            expect(out.interviewerSkillId).toBe(10);
        });

        it('should wrap errors', async () => {
            mockConn.execute.mockRejectedValue(new Error('e'));

            await expect(
                repo.createInterviewerSkill(1, { skillName: 's', proficiencyLevel: 1, yearsOfExperience: 0 }, mockConn)
            ).rejects.toBeInstanceOf(AppError);
        });
    });

    describe('createInterviewerTimeslot', () => {
        it('should insert timeslot', async () => {
            mockConn.execute.mockResolvedValue([{ insertId: 11 }]);

            const out = await repo.createInterviewerTimeslot(1, { timeslot: 2, dayOfWeek: 3 }, mockConn);

            expect(out.interviewerTimeslotId).toBe(11);
        });
    });

    describe('getMemberSkills', () => {
        it('should return rows', async () => {
            mockConn.execute.mockResolvedValue([[{ skillId: 'a' }]]);

            const rows = await repo.getMemberSkills(1, mockConn);

            expect(rows).toHaveLength(1);
        });
    });

    describe('upsertInterviewerSkill', () => {
        it('should map result including insertId null', async () => {
            mockConn.execute.mockResolvedValue([{ insertId: null }]);

            const out = await repo.upsertInterviewerSkill(
                1,
                { skill: 's', proficiencyLevel: 1, yearsOfExperience: 2 },
                mockConn
            );

            expect(out.interviewerSkillId).toBeNull();
            expect(out.skillId).toBe('s');
        });
    });

    describe('deleteInterviewerSkills', () => {
        it('should return deletedCount 0 when skillIds empty', async () => {
            await expect(repo.deleteInterviewerSkills(1, [], mockConn)).resolves.toEqual({ deletedCount: 0 });
            await expect(repo.deleteInterviewerSkills(1, null, mockConn)).resolves.toEqual({ deletedCount: 0 });
        });

        it('should delete by ids', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 2 }]);

            const out = await repo.deleteInterviewerSkills(1, ['a', 'b'], mockConn);

            expect(out.deletedCount).toBe(2);
        });
    });

    describe('replaceInterviewerSkills', () => {
        it('should delete all and skip insert when skills empty', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            const out = await repo.replaceInterviewerSkills(1, [], mockConn);

            expect(out.skillsCount).toBe(0);
            expect(mockConn.execute).toHaveBeenCalled();
        });

        it('should insert skills when provided', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            const out = await repo.replaceInterviewerSkills(
                1,
                [{ skill: 'x', proficiencyLevel: 1, yearsOfExperience: 0 }],
                mockConn
            );

            expect(out.skillsCount).toBe(1);
        });

        it('should treat null skillsData as zero count', async () => {
            mockConn.execute.mockResolvedValue([[]]);

            const out = await repo.replaceInterviewerSkills(1, null, mockConn);

            expect(out.skillsCount).toBe(0);
        });
    });

    describe('findAll', () => {
        it('should parse skills strings', async () => {
            mockConn.execute.mockResolvedValue([
                [{ memberId: 1, skills: JSON.stringify([{ skillId: '1' }]) }],
            ]);

            const rows = await repo.findAll(mockConn);

            expect(Array.isArray(rows[0].skills)).toBe(true);
        });

        it('should wrap errors', async () => {
            mockConn.execute.mockRejectedValue(new Error('q'));

            await expect(repo.findAll(mockConn)).rejects.toMatchObject({ errorCode: 'DB_ERROR' });
        });
    });

    describe('findByEmail', () => {
        it('should return row with explicit client', async () => {
            mockConn.execute.mockResolvedValue([[{ memberId: 1, email: 'e@test.com' }]]);

            const row = await repo.findByEmail('e@test.com', mockConn);

            expect(row.email).toBe('e@test.com');
            expect(mockConn.release).not.toHaveBeenCalled();
        });

        it('should acquire and release pool connection when client omitted', async () => {
            mockConn.execute.mockResolvedValue([[{ memberId: 2 }]]);

            await repo.findByEmail('a@b.com');

            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('findMemberByEmail', () => {
        it('should return first row', async () => {
            mockConn.execute.mockResolvedValue([[{ memberId: 3, email: 'z@z.com' }]]);

            const row = await repo.findMemberByEmail('z@z.com');

            expect(row.memberId).toBe(3);
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('create', () => {
        it('should insert and return findById result', async () => {
            mockConn.execute
                .mockResolvedValueOnce([{ insertId: 50 }])
                .mockResolvedValueOnce([[{ memberId: 50, memberName: 'New' }]]);

            const member = await repo.create(
                {
                    memberName: 'New',
                    memberContact: '1',
                    email: 'n@n.com',
                    password: 'p',
                    designation: 'd',
                    isRecruiter: true,
                    isInterviewer: false,
                    vendorId: null,
                },
                mockConn
            );

            expect(member.memberId).toBe(50);
        });

        it('should throw on duplicate email', async () => {
            const dup = new Error("Duplicate entry 'e' for key 'email'");
            dup.code = 'ER_DUP_ENTRY';

            mockConn.execute.mockRejectedValue(dup);

            await expect(
                repo.create(
                    {
                        memberName: 'N',
                        memberContact: 'c',
                        email: 'e',
                        password: 'p',
                        designation: 'd',
                    },
                    mockConn
                )
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        it('should map duplicate contact field', async () => {
            const dup = new Error("Duplicate for key 'contact'");
            dup.code = 'ER_DUP_ENTRY';

            mockConn.execute.mockRejectedValue(dup);

            await expect(
                repo.create(
                    {
                        memberName: 'N',
                        memberContact: 'c',
                        email: 'e',
                        password: 'p',
                        designation: 'd',
                    },
                    mockConn
                )
            ).rejects.toMatchObject({ message: expect.stringContaining('Contact') });
        });

        it('should map duplicate name field', async () => {
            const dup = new Error("Duplicate for key 'name'");
            dup.code = 'ER_DUP_ENTRY';

            mockConn.execute.mockRejectedValue(dup);

            await expect(
                repo.create(
                    {
                        memberName: 'N',
                        memberContact: 'c',
                        email: 'e',
                        password: 'p',
                        designation: 'd',
                    },
                    mockConn
                )
            ).rejects.toMatchObject({ errorCode: 'DUPLICATE_NAME' });
        });
    });

    describe('updateMember', () => {
        it('should throw when memberId missing', async () => {
            await expect(repo.updateMember(null, { email: 'a' }, mockConn)).rejects.toMatchObject({
                errorCode: 'MISSING_MEMBER_ID',
            });
        });

        it('should throw when updateData empty', async () => {
            await expect(repo.updateMember(1, {}, mockConn)).rejects.toMatchObject({
                errorCode: 'MISSING_UPDATE_DATA',
            });
        });

        it('should throw when no allowed fields', async () => {
            await expect(repo.updateMember(1, { unknown: 1 }, mockConn)).rejects.toMatchObject({
                errorCode: 'NO_VALID_FIELDS',
            });
        });

        it('should clear vendorId when isRecruiter false', async () => {
            mockConn.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

            const out = await repo.updateMember(
                1,
                { vendorId: 5, isRecruiter: false, memberName: 'X' },
                mockConn
            );

            expect(out.memberId).toBe(1);
            const updateCall = mockConn.execute.mock.calls.find((c) => String(c[0]).startsWith('UPDATE member SET'));
            expect(updateCall).toBeDefined();
        });

        it('should detect duplicate email conflict', async () => {
            mockConn.execute.mockResolvedValueOnce([[{ memberId: 99 }]]);

            await expect(
                repo.updateMember(1, { email: 'taken@x.com', memberName: 'A' }, mockConn)
            ).rejects.toMatchObject({ errorCode: 'DUPLICATE_ACTIVE_EMAIL' });
        });

        it('should detect duplicate contact conflict', async () => {
            mockConn.execute.mockResolvedValueOnce([[{ memberId: 88 }]]);

            await expect(
                repo.updateMember(1, { memberContact: '+100', memberName: 'A' }, mockConn)
            ).rejects.toMatchObject({ errorCode: 'DUPLICATE_ACTIVE_CONTACT' });
        });

        it('should throw when no rows affected', async () => {
            mockConn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

            await expect(repo.updateMember(1, { memberName: 'Z' }, mockConn)).rejects.toMatchObject({
                errorCode: 'MEMBER_NOT_FOUND',
            });
        });

        it('should log and wrap ER_DUP_ENTRY on update execute', async () => {
            const err = new Error('dup');
            err.code = 'ER_DUP_ENTRY';
            mockConn.execute.mockRejectedValueOnce(err);

            const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(repo.updateMember(1, { memberName: 'Z' }, mockConn)).rejects.toBeInstanceOf(AppError);

            spy.mockRestore();
        });

        it('should rethrow AppError', async () => {
            const e = new AppError('bad', 400, 'X');
            mockConn.execute.mockRejectedValue(e);

            await expect(repo.updateMember(1, { memberName: 'Z' }, mockConn)).rejects.toBe(e);
        });
    });

    describe('updateLastLogin', () => {
        it('should execute update', async () => {
            mockConn.execute.mockResolvedValue();

            await repo.updateLastLogin(7);

            expect(mockConn.execute).toHaveBeenCalled();
            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('updatePassword', () => {
        it('should execute password update', async () => {
            mockConn.execute.mockResolvedValue();

            await repo.updatePassword(1, 'hash');

            expect(mockConn.release).toHaveBeenCalled();
        });
    });

    describe('deactivateAccount', () => {
        it('should run deactivate SQL', async () => {
            mockConn.execute.mockResolvedValue();

            await repo.deactivateAccount(3, 9);

            expect(mockConn.execute).toHaveBeenCalled();
        });
    });

    describe('permanentlyDeleteBatch', () => {
        it('should return 0 for empty ids', async () => {
            await expect(repo.permanentlyDeleteBatch([], mockConn)).resolves.toBe(0);
            await expect(repo.permanentlyDeleteBatch(null, mockConn)).resolves.toBe(0);
        });

        it('should return affected rows', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 3 }]);

            await expect(repo.permanentlyDeleteBatch([1, 2, 3], mockConn)).resolves.toBe(3);
        });

        it('should rethrow AppError', async () => {
            const e = new AppError('x', 400, 'X');
            mockConn.execute.mockRejectedValue(e);

            await expect(repo.permanentlyDeleteBatch([1], mockConn)).rejects.toBe(e);
        });
    });

    describe('updateTimezone', () => {
        it('should return true when row updated', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 1 }]);

            await expect(repo.updateTimezone(1, 'UTC', mockConn)).resolves.toBe(true);
        });

        it('should return false when no rows', async () => {
            mockConn.execute.mockResolvedValue([{ affectedRows: 0 }]);

            await expect(repo.updateTimezone(1, 'UTC', mockConn)).resolves.toBe(false);
        });
    });

    describe('getLocationById', () => {
        it('should return first row or null', async () => {
            mockConn.execute.mockResolvedValue([[{ city: 'A', state: 'B', country: 'C' }]]);

            await expect(repo.getLocationById(9, mockConn)).resolves.toEqual({
                city: 'A',
                state: 'B',
                country: 'C',
            });
        });
    });
});

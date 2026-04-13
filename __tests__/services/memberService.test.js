const MemberService = require('../../services/memberService');
const AppError = require('../../utils/appError');

jest.mock('../../services/auditLogService', () => ({
    logAction: jest.fn().mockResolvedValue(undefined),
}));

describe('MemberService', () => {
    let service;
    let mockRepo;
    let mockClient;
    let mockDb;

    const audit = {
        userId: 1,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        timestamp: new Date(),
    };

    beforeEach(() => {
        mockClient = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockResolvedValue(undefined),
        };
        mockDb = { getConnection: jest.fn().mockResolvedValue(mockClient) };
        mockRepo = {
            getFormData: jest.fn(),
            getCreateData: jest.fn(),
            findMemberById: jest.fn(),
            findAll: jest.fn(),
            findById: jest.fn(),
            updateMember: jest.fn(),
            validateVendorExists: jest.fn(),
            replaceInterviewerSkills: jest.fn(),
            getLocationById: jest.fn(),
            updateTimezone: jest.fn(),
            deleteMember: jest.fn(),
        };
        service = new MemberService(mockRepo, mockDb);
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

    const memberRow = {
        memberId: 1,
        email: 'a@b.com',
        isRecruiter: true,
        isInterviewer: false,
    };

    it('getMemberFormData returns repository data', async () => {
        mockRepo.getFormData.mockResolvedValue({ fields: [] });

        await expect(service.getMemberFormData()).resolves.toEqual({ fields: [] });
    });

    it('getCreateData returns repository data', async () => {
        mockRepo.getCreateData.mockResolvedValue({ vendors: [] });

        await expect(service.getCreateData()).resolves.toEqual({ vendors: [] });
    });

    it('getMemberById throws when missing', async () => {
        mockRepo.findMemberById.mockResolvedValue(null);

        await expect(service.getMemberById(9)).rejects.toMatchObject({
            errorCode: 'MEMBER_ID_NOT_FOUND',
        });
    });

    it('getMemberById returns member', async () => {
        mockRepo.findMemberById.mockResolvedValue(memberRow);

        await expect(service.getMemberById(1)).resolves.toEqual(memberRow);
    });

    it('getAllMembers delegates', async () => {
        mockRepo.findAll.mockResolvedValue([]);

        await expect(service.getAllMembers()).resolves.toEqual([]);
    });

    it('updateMember commits simple field update', async () => {
        mockRepo.findById.mockResolvedValue(memberRow);
        mockRepo.updateMember.mockResolvedValue({ ...memberRow, name: 'X' });
        mockRepo.findMemberById.mockResolvedValue({ ...memberRow, name: 'X' });

        const out = await service.updateMember(1, { name: 'X' }, audit);

        expect(out.name).toBe('X');
        expect(mockClient.commit).toHaveBeenCalled();
    });

    it('updateMember rejects vendor without recruiter flag', async () => {
        mockRepo.findById.mockResolvedValue({ ...memberRow, isRecruiter: false });

        await expect(
            service.updateMember(1, { vendorId: 5, isRecruiter: false }, audit)
        ).rejects.toMatchObject({ errorCode: 'VENDOR_ASSOCIATION_NOT_ALLOWED' });
    });

    it('updateTimezoneForMember returns null without locationId', async () => {
        await expect(service.updateTimezoneForMember({ memberId: 1 }, mockClient)).resolves.toBeNull();
    });

    it('updateTimezoneForMember updates when location resolves', async () => {
        mockRepo.getLocationById.mockResolvedValue({
            city: 'Mumbai',
            country: 'India',
        });
        mockRepo.updateTimezone.mockResolvedValue(undefined);

        const zone = await service.updateTimezoneForMember(
            { memberId: 2, locationId: 3 },
            mockClient
        );

        expect(mockRepo.updateTimezone).toHaveBeenCalled();
        expect(zone === null || typeof zone === 'string').toBe(true);
    });
});

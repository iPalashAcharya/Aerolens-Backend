jest.mock('../../db', () => ({
    execute: jest.fn(),
}));

const db = require('../../db');
const groupService = require('../../services/groupService');

describe('groupService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('listActiveWhatsappGroups', () => {
        it('returns rows from db.execute', async () => {
            const rows = [{ groupId: 1, groupName: 'Alpha' }];
            db.execute.mockResolvedValue([rows]);

            const result = await groupService.listActiveWhatsappGroups();

            expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('FROM whatsapp_group'));
            expect(result).toEqual(rows);
        });
    });

    describe('getRecipients', () => {
        it('throws when group is missing or inactive', async () => {
            db.execute.mockResolvedValueOnce([[]]);

            await expect(groupService.getRecipients(99)).rejects.toThrow('Active WhatsApp group not found');
        });

        it('returns member rows when group exists', async () => {
            const members = [{ member_id: 1, phone_number: '+100' }];
            db.execute
                .mockResolvedValueOnce([[{ id: 5 }]])
                .mockResolvedValueOnce([members]);

            const result = await groupService.getRecipients(5);

            expect(result).toEqual(members);
            expect(db.execute).toHaveBeenCalledTimes(2);
        });
    });
});

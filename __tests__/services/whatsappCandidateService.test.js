jest.mock('../../db', () => ({
    execute: jest.fn(),
}));

const db = require('../../db');
const whatsappCandidateService = require('../../services/whatsappCandidateService');

describe('whatsappCandidateService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('getCandidate returns first row', async () => {
        const row = { candidateId: 7, name: 'N' };
        db.execute.mockResolvedValue([[row]]);

        const result = await whatsappCandidateService.getCandidate(7);

        expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('FROM candidate c'), [7]);
        expect(result).toEqual(row);
    });

    it('getCandidate returns null when no row', async () => {
        db.execute.mockResolvedValue([[]]);

        const result = await whatsappCandidateService.getCandidate(999);

        expect(result).toBeNull();
    });
});

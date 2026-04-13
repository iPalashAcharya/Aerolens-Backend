const { buildWhatsappTemplateBodyParams } = require('../../services/messageService');

describe('messageService buildWhatsappTemplateBodyParams', () => {
    const baseCandidate = {
        name: 'Jane',
        contactNumber: '+911',
        email: 'j@e.com',
        linkedinUrl: 'https://in',
        yoe: 5,
        noticePeriod: 30,
        currentCTCAmount: 10,
        currentCurrencyValue: 'INR',
        currentCompensationTypeValue: 'Annual',
        expectedCTCAmount: 20,
        expectedCurrencyValue: 'INR',
        expectedCompensationTypeValue: 'Annual',
    };

    it('returns nine parameters in order', () => {
        const params = buildWhatsappTemplateBodyParams(baseCandidate, 'note');

        expect(params).toHaveLength(9);
        expect(params[0]).toBe('Jane');
        expect(params[4]).toContain('years');
        expect(params[8]).toBe('note');
    });

    it('uses N/A for missing name and legacy CTC when structured fields incomplete', () => {
        const params = buildWhatsappTemplateBodyParams(
            {
                name: null,
                contactNumber: null,
                email: null,
                linkedinUrl: null,
                yoe: null,
                noticePeriod: null,
                currentCTC: 500000,
            },
            undefined
        );

        expect(params[0]).toBe('N/A');
        expect(params[4]).toBe('N/A');
        expect(params[5]).toContain('₹');
    });

    it('normalizes empty custom message to single space for param 9', () => {
        const params = buildWhatsappTemplateBodyParams(baseCandidate, '   ');

        expect(params[8]).toBe(' ');
    });
});

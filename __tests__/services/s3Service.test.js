jest.mock('../../config/s3', () => ({
    s3Client: { mocked: true },
    bucketName: 'test-bucket',
}));

const mockGetSignedUrl = jest.fn();

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: (...args) => mockGetSignedUrl(...args),
}));

const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { generateSignedUrl } = require('../../services/s3Service');

describe('s3Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('generateSignedUrl returns HTTPS URL from presigner', async () => {
        mockGetSignedUrl.mockResolvedValue('https://s3.example/presigned');

        const url = await generateSignedUrl('resumes/c1/file.pdf');

        expect(mockGetSignedUrl).toHaveBeenCalled();
        const cmd = mockGetSignedUrl.mock.calls[0][1];
        expect(cmd).toBeInstanceOf(GetObjectCommand);
        expect(url).toBe('https://s3.example/presigned');
    });

    it('generateSignedUrl throws when result is not HTTPS', async () => {
        mockGetSignedUrl.mockResolvedValue('http://insecure.example');

        await expect(generateSignedUrl('k')).rejects.toThrow('Signed URL must be HTTPS');
    });
});

const ApiResponse = require('../../utils/response');
const AppError = require('../../utils/appError');

describe('ApiResponse', () => {
    let res;

    beforeEach(() => {
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
    });

    describe('success', () => {
        it('should send default success payload', () => {
            ApiResponse.success(res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'Success',
                    data: null,
                })
            );
        });

        it('should include data and meta when provided', () => {
            ApiResponse.success(res, { id: 1 }, 'OK', 201, { page: 1 });

            expect(res.status).toHaveBeenCalledWith(201);
            const body = res.json.mock.calls[0][0];
            expect(body.data).toEqual({ id: 1 });
            expect(body.meta).toEqual({ page: 1 });
        });

        it('should omit meta when falsy', () => {
            ApiResponse.success(res, {}, 'Done', 200, null);
            expect(res.json.mock.calls[0][0].meta).toBeUndefined();
        });
    });

    describe('error', () => {
        it('should map AppError fields', () => {
            const err = new AppError('msg', 400, 'BAD', { a: 1 });
            err.stack = 'stack-line';

            ApiResponse.error(res, err, 400);

            expect(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            expect(body.success).toBe(false);
            expect(body.error).toBe('BAD');
            expect(body.message).toBe('msg');
            expect(body.details).toEqual({ a: 1 });
            expect(body.stack).toBe('stack-line');
        });

        it('should use defaults for plain Error', () => {
            ApiResponse.error(res, { message: 'oops' }, 500);
            const body = res.json.mock.calls[0][0];
            expect(body.error).toBe('INTERNAL_SERVER_ERROR');
            expect(body.message).toBe('oops');
        });
    });
});

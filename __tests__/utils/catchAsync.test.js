const catchAsync = require('../../utils/catchAsync');

describe('catchAsync', () => {
    it('should call async handler and forward success without next', async () => {
        const fn = jest.fn().mockResolvedValue('ok');
        const next = jest.fn();
        const wrapped = catchAsync(fn);

        await wrapped({}, {}, next);

        expect(fn).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('should pass rejection to next', async () => {
        const err = new Error('fail');
        const fn = jest.fn().mockRejectedValue(err);
        const next = jest.fn();
        const wrapped = catchAsync(fn);

        await wrapped({}, {}, next);

        expect(next).toHaveBeenCalledWith(err);
    });
});

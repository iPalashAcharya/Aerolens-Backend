const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class MemberController {
    constructor(memberService) {
        this.memberService = memberService;
    }

    getAll = catchAsync(async (req, res) => {
        try {
            /*const options = {
                limit: parseInt(req.query.limit) || 10,
                page: parseInt(req.query.page) || 1
            };*/
            const result = await this.memberService.getAllMembers();

            return ApiResponse.success(
                res,
                result,
                'Members retrieved successfully',
                200,
                //result.pagination
            );
        } catch (error) {
            return ApiResponse.error(res, error)
        }
    });

    getById = catchAsync(async (req, res) => {
        const member = await this.memberService.getMemberById(parseInt(req.params.memberId));
        return ApiResponse.success(
            res,
            member,
            'Member entry retrieved successfully'
        );
    })

    updateMember = catchAsync(async (req, res) => {
        const member = await this.memberService.updateMember(
            parseInt(req.params.memberId),
            req.body,
            req.auditContext
        );

        return ApiResponse.success(
            res,
            member,
            'Member entry updated successfully'
        );
    });

    deleteMember = catchAsync(async (req, res) => {
        await this.memberService.deleteMember(parseInt(req.params.memberId), req.auditContext);

        return ApiResponse.success(
            res,
            null,
            'Member entry deactivated successfully and will be deleted from database in 10 days'
        );
    });
}

module.exports = MemberController;
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/response');

class ContactController {
    constructor(contactService) {
        this.contactService = contactService;
    }

    createContact = catchAsync(async (req, res) => {
        const contact = await this.contactService.createContact(req.body);

        return ApiResponse.success(
            res,
            contact,
            'client contact created successfully',
            201
        );
    });

    updateContact = catchAsync(async (req, res) => {
        const contact = await this.contactService.updateContact(
            parseInt(req.params.contactId),
            req.body
        );

        return ApiResponse.success(
            res,
            contact,
            'client contact details updated successfully'
        );
    });

    deleteContact = catchAsync(async (req, res) => {
        await this.contactService.deleteContact(parseInt(req.params.contactId));

        return ApiResponse.success(
            res,
            null,
            'client contact deleted successfully'
        );
    });
}

module.exports = ContactController;
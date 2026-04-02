/**
 * Standard JSON envelopes for API responses (WhatsApp and similar thin controllers).
 */
class ApiResponse {
    static ok(body = {}) {
        return {
            statusCode: 200,
            body: { success: true, ...body }
        };
    }

    static badRequest(message) {
        return {
            statusCode: 400,
            body: { success: false, message }
        };
    }

    static notFound(message) {
        return {
            statusCode: 404,
            body: { success: false, message }
        };
    }

    static serverError(message) {
        return {
            statusCode: 500,
            body: { success: false, message }
        };
    }
}

module.exports = ApiResponse;

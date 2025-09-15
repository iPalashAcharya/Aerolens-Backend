class ApiResponse { //a class for api response used to send uniform responses from the backend
    static success(res, data = null, message = 'Success', statusCode = 200, meta = null) { //static method for returning successful responses
        const response = {
            success: true,
            message,
            data,
            ...(meta && { meta }) //spread operator trick If meta exists, add { meta: meta } to the object else if meta is falsy (null, undefined) add nothing
        };
        return res.status(statusCode).json(response);
    }

    static error(res, error, statusCode = 500) { //static method to return errors, error is expected to be AppError or any error object
        const response = {
            success: false,
            error: error.errorCode || 'INTERNAL_SERVER_ERROR',
            message: error.message || 'An unexpected error occurred',
            ...(error.details && { details: error.details }) //same spread operator trick
        };

        //if (process.env.NODE_ENV === 'development') {
        response.stack = error.stack; //in production do not expose the stack to clients for security
        //}

        return res.status(statusCode).json(response);
    }
}

module.exports = ApiResponse;
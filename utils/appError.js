class AppError extends Error {
    constructor(message, statusCode, errorCode = null, details = null) {
        super(message); //the parent Error class also has the message property so we need to override it with our own message also es6 doesnt allow "this" to be used before calling the constructor of the parent class
        this.statusCode = statusCode;
        this.errorCode = errorCode; //adds a custom error code user_not_found db_error etc
        this.details = details; //extra details about the error
        this.isOperational = true; //helps distinguish operational errors (invalid input,not found) from programming errors like (reference errors)

        Error.captureStackTrace(this, this.constructor); //print the error function call trace without including the constructor of AppError
    }
}

module.exports = AppError;
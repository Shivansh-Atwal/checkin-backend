"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const errorHandler_1 = require("./errorHandler");
const validate = (schema) => {
    return async (req, res, next) => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const errorMessages = error.issues.map((issue) => `${issue.path.slice(1).join('.')}: ${issue.message}`).join(', ');
                return next(new errorHandler_1.AppError(400, `Validation failed: ${errorMessages}`));
            }
            next(error);
        }
    };
};
exports.validate = validate;

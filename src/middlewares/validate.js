const validate = (schema) => (req, res, next) => {

    const { error } = schema.validate(req.body);

    if (error) {
        return next({
            status: 400,
            message: error.details[0].message,
            name: 'ValidationError'
        });
    }

    next();
};

module.exports = validate;

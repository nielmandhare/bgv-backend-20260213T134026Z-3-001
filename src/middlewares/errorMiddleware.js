const logger = require('../utils/logger');

const errorMiddleware = {
  notFound: (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
  },

  errorHandler: (err, req, res, next) => {
    const statusCode = err.status || 500;
    logger.error(`${statusCode} - ${err.message}`);

    res.status(statusCode).json({
      success: false,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  },
};

module.exports = errorMiddleware;

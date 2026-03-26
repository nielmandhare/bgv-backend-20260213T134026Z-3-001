/**
 * BE-8: Polling Fallback Configuration
 * Manages polling intervals, retry logic, and fallback triggers
 */

module.exports = {
    // Polling intervals (in milliseconds)
    polling: {
        initialDelay: 2000,
        maxDelay: 300000,
        backoffMultiplier: 2,
        maxAttempts: 10,
        jitter: true,
        timeout: 10000
    },
    
    // Webhook fallback triggers
    fallback: {
        thresholdMinutes: 5,
        checkInterval: 60000,
        batchSize: 50,
        maxAgeHours: 24
    },
    
    // Status tracking
    status: {
        pendingStates: ["pending", "processing", "polling"],
        completedStates: ["completed", "failed", "timeout"],
        failedStates: ["failed", "timeout", "source_down"]
    },
    
    // Exponential backoff settings
    backoff: {
        baseDelay: 1000,
        maxDelay: 60000,
        maxRetries: 5
    },
    
    // Logging
    logging: {
        enabled: true,
        level: "info"
    }
};

/**
 * BE-8: Polling Scheduler
 */

const pollingFallbackJob = require("../jobs/pollingFallbackJob");

class PollingScheduler {
    constructor() {
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) {
            console.log("[PollingScheduler] Already initialized");
            return;
        }
        
        console.log("[PollingScheduler] Initializing polling fallback scheduler");
        pollingFallbackJob.start();
        this.isInitialized = true;
        console.log("[PollingScheduler] Polling fallback scheduler initialized");
    }

    shutdown() {
        console.log("[PollingScheduler] Shutting down polling scheduler");
        pollingFallbackJob.stop();
        this.isInitialized = false;
    }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            jobStatus: pollingFallbackJob.getStatus()
        };
    }

    async triggerManualPoll() {
        console.log("[PollingScheduler] Manual polling triggered");
        await pollingFallbackJob.run();
        return { success: true, message: "Manual polling completed" };
    }
}

module.exports = new PollingScheduler();

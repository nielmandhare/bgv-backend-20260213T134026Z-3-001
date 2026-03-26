/**
 * BE-8: Polling Fallback Job
 */

const idfyService = require("../services/idfyService");
const verificationModel = require("../models/verificationModel");

class PollingFallbackJob {
    constructor() {
        this.isRunning = false;
        this.pollingInterval = null;
    }

    start() {
        if (this.pollingInterval) {
            console.log("[PollingFallback] Job already running");
            return;
        }
        
        console.log("[PollingFallback] Starting polling fallback job");
        this.run();
        this.pollingInterval = setInterval(() => {
            this.run();
        }, 60000);
    }

    stop() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log("[PollingFallback] Stopped polling fallback job");
        }
    }

    async run() {
        if (this.isRunning) {
            console.log("[PollingFallback] Job already running, skipping...");
            return;
        }
        
        this.isRunning = true;
        
        try {
            console.log("[PollingFallback] Starting polling fallback check");
            await this.pollStaleVerifications();
            await this.pollVerificationsWithoutWebhook();
            console.log("[PollingFallback] Polling fallback check completed");
        } catch (error) {
            console.error("[PollingFallback] Error during polling:", error);
        } finally {
            this.isRunning = false;
        }
    }

    async pollStaleVerifications() {
        try {
            const pendingRecords = await verificationModel.getPendingVerificationsForPolling({
                maxAttempts: 10,
                batchSize: 50,
                maxAgeHours: 24
            });
            
            if (pendingRecords.length === 0) {
                console.log("[PollingFallback] No stale verifications to poll");
                return;
            }
            
            console.log(`[PollingFallback] Polling ${pendingRecords.length} stale verifications`);
            
            const requestIds = pendingRecords
                .filter(record => record.requestId)
                .map(record => record.requestId);
            
            if (requestIds.length === 0) return;
            
            const results = await idfyService.batchGetResults(requestIds, 10);
            
            for (const result of results) {
                await this.processPollingResult(result, pendingRecords);
            }
        } catch (error) {
            console.error("[PollingFallback] Error polling stale verifications:", error);
        }
    }

    async pollVerificationsWithoutWebhook() {
        try {
            const pendingRecords = await verificationModel.getVerificationsPendingWebhook(5);
            
            if (pendingRecords.length === 0) {
                console.log("[PollingFallback] No verifications without webhook");
                return;
            }
            
            console.log(`[PollingFallback] Polling ${pendingRecords.length} verifications without webhook`);
            
            for (const record of pendingRecords) {
                await this.pollWithBackoff(record);
            }
        } catch (error) {
            console.error("[PollingFallback] Error polling without webhook:", error);
        }
    }

    async pollWithBackoff(record, attempt = 1) {
        try {
            console.log(`[PollingFallback] Polling verification ${record.id} (Attempt ${attempt})`);
            
            await verificationModel.incrementPollCount(record.id);
            
            const result = await idfyService.getResult(record.requestId);
            
            if (result.status === "completed") {
                await verificationModel.update(record.id, {
                    status: "completed",
                    resultData: result.data,
                    verifiedAt: new Date(),
                    webhookReceived: true
                });
                console.log(`[PollingFallback] Verification ${record.id} completed via polling`);
            } else if (result.status === "failed") {
                await verificationModel.update(record.id, {
                    status: "failed",
                    resultData: result.data,
                    errorMessage: result.data.error || "Verification failed",
                    verifiedAt: new Date(),
                    webhookReceived: true
                });
                console.log(`[PollingFallback] Verification ${record.id} failed via polling`);
            } else if (result.status === "processing" && attempt < 10) {
                const delay = Math.min(2000 * Math.pow(2, attempt - 1), 300000);
                console.log(`[PollingFallback] Verification ${record.id} still processing. Next poll in ${delay}ms`);
                setTimeout(() => {
                    this.pollWithBackoff(record, attempt + 1);
                }, delay);
            }
        } catch (error) {
            console.error(`[PollingFallback] Error polling verification ${record.id}:`, error.message);
            
            if (attempt < 10 && (error.message.includes("SOURCE_UNAVAILABLE") || error.message.includes("REQUEST_TIMEOUT"))) {
                const delay = Math.min(2000 * Math.pow(2, attempt - 1), 300000);
                console.log(`[PollingFallback] Retrying verification ${record.id} in ${delay}ms`);
                setTimeout(() => {
                    this.pollWithBackoff(record, attempt + 1);
                }, delay);
            } else {
                await verificationModel.update(record.id, {
                    status: "timeout",
                    errorMessage: `Polling failed after ${attempt} attempts: ${error.message}`
                });
                console.log(`[PollingFallback] Verification ${record.id} marked as timeout`);
            }
        }
    }

    async processPollingResult(result, records) {
        const record = records.find(r => r.requestId === result.requestId);
        if (!record) return;
        
        if (!result.success) {
            console.error(`[PollingFallback] Failed to fetch result for ${record.id}:`, result.error);
            await verificationModel.incrementPollCount(record.id);
            return;
        }
        
        if (result.status === "completed") {
            await verificationModel.update(record.id, {
                status: "completed",
                resultData: result.data,
                verifiedAt: new Date(),
                webhookReceived: true
            });
            console.log(`[PollingFallback] Verification ${record.id} completed via batch polling`);
        } else if (result.status === "failed") {
            await verificationModel.update(record.id, {
                status: "failed",
                resultData: result.data,
                errorMessage: result.data.error || "Verification failed",
                verifiedAt: new Date(),
                webhookReceived: true
            });
            console.log(`[PollingFallback] Verification ${record.id} failed via batch polling`);
        } else {
            await verificationModel.incrementPollCount(record.id);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            intervalActive: !!this.pollingInterval,
            checkIntervalMs: 60000
        };
    }
}

module.exports = new PollingFallbackJob();

/**
 * BE-8: Verification Retry Job
 */

const idfyService = require("../services/idfyService");
const verificationModel = require("../models/verificationModel");

class VerificationRetryJob {
    constructor() {
        this.isRunning = false;
        this.retryInterval = null;
    }

    start() {
        if (this.retryInterval) {
            console.log("[RetryJob] Already running");
            return;
        }
        
        console.log("[RetryJob] Starting verification retry job");
        this.retryInterval = setInterval(() => {
            this.run();
        }, 15 * 60 * 1000);
        this.run();
    }

    stop() {
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
            console.log("[RetryJob] Stopped verification retry job");
        }
    }

    async run() {
        if (this.isRunning) {
            console.log("[RetryJob] Already running, skipping...");
            return;
        }
        
        this.isRunning = true;
        
        try {
            console.log("[RetryJob] Checking for failed verifications to retry");
            
            const failedVerifications = await verificationModel.getFailedVerifications({
                maxRetries: 3,
                retryAfterMinutes: 15
            });
            
            if (failedVerifications.length === 0) {
                console.log("[RetryJob] No failed verifications to retry");
                return;
            }
            
            console.log(`[RetryJob] Found ${failedVerifications.length} failed verifications to retry`);
            
            for (const verification of failedVerifications) {
                await this.retryVerification(verification);
            }
        } catch (error) {
            console.error("[RetryJob] Error during retry:", error);
        } finally {
            this.isRunning = false;
        }
    }

    async retryVerification(verification) {
        try {
            console.log(`[RetryJob] Retrying verification ${verification.id} (Attempt ${verification.retryCount + 1})`);
            
            let result;
            
            switch (verification.type) {
                case "PAN":
                    result = await idfyService.verifyPAN(
                        verification.inputData.panNumber,
                        verification.id
                    );
                    break;
                case "AADHAAR":
                    result = await idfyService.verifyAadhaar(
                        verification.inputData.aadhaarNumber,
                        verification.id
                    );
                    break;
                case "GST":
                    result = await idfyService.verifyGST(
                        verification.inputData.gstNumber,
                        verification.id
                    );
                    break;
                default:
                    console.log(`[RetryJob] Unknown verification type: ${verification.type}`);
                    return;
            }
            
            await verificationModel.update(verification.id, {
                status: "pending",
                requestId: result.requestId,
                retryCount: verification.retryCount + 1,
                lastRetryAt: new Date(),
                errorMessage: null
            });
            
            console.log(`[RetryJob] Retry initiated for verification ${verification.id}`);
        } catch (error) {
            console.error(`[RetryJob] Retry failed for ${verification.id}:`, error.message);
            
            const newRetryCount = verification.retryCount + 1;
            
            if (newRetryCount >= 3) {
                await verificationModel.update(verification.id, {
                    status: "failed",
                    errorMessage: `Max retries exceeded (${newRetryCount}): ${error.message}`,
                    retryCount: newRetryCount
                });
                console.log(`[RetryJob] Verification ${verification.id} marked as permanently failed`);
            } else {
                await verificationModel.update(verification.id, {
                    retryCount: newRetryCount,
                    lastRetryAt: new Date(),
                    errorMessage: `Retry ${newRetryCount} failed: ${error.message}`
                });
            }
        }
    }
}

module.exports = new VerificationRetryJob();

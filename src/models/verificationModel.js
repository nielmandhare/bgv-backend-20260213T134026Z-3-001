/**
 * BE-9: Verification Model with Polling Support
 * Manages verification records in database
 */

class VerificationModel {
    constructor() {
        this.verifications = new Map();
    }

    async create(data) {
        const record = {
            id: data.id,
            userId: data.userId,
            type: data.type,
            requestId: data.requestId,
            status: data.status || "pending",
            inputData: data.inputData,
            resultData: null,
            errorMessage: null,
            retryCount: 0,
            pollCount: 0,
            lastPolledAt: null,
            webhookReceived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            verifiedAt: null
        };
        
        this.verifications.set(data.id, record);
        console.log(`[Model] Created verification record: ${data.id}`);
        return record;
    }

    async getById(id) {
        return this.verifications.get(id) || null;
    }

    async getByRequestId(requestId) {
        for (const [id, record] of this.verifications) {
            if (record.requestId === requestId) {
                return record;
            }
        }
        return null;
    }

    async getPendingVerificationsForPolling(options = {}) {
        const {
            maxAgeHours = 24,
            maxAttempts = 10,
            batchSize = 50
        } = options;
        
        const now = new Date();
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
        const pendingRecords = [];
        
        for (const [id, record] of this.verifications) {
            if (record.status !== "pending" && record.status !== "processing") continue;
            if (record.webhookReceived) continue;
            
            const age = now - record.createdAt;
            if (age > maxAgeMs) continue;
            if (record.pollCount >= maxAttempts) continue;
            
            pendingRecords.push(record);
            if (pendingRecords.length >= batchSize) break;
        }
        
        console.log(`[Model] Found ${pendingRecords.length} pending verifications for polling`);
        return pendingRecords;
    }

    async getVerificationsPendingWebhook(thresholdMinutes = 5) {
        const now = new Date();
        const thresholdMs = thresholdMinutes * 60 * 1000;
        const pendingRecords = [];
        
        for (const [id, record] of this.verifications) {
            if (record.status !== "pending") continue;
            if (record.webhookReceived) continue;
            
            const age = now - record.createdAt;
            if (age >= thresholdMs) {
                pendingRecords.push(record);
            }
        }
        
        console.log(`[Model] Found ${pendingRecords.length} verifications pending webhook beyond ${thresholdMinutes} minutes`);
        return pendingRecords;
    }

    async update(id, updates) {
        const record = this.verifications.get(id);
        if (!record) return null;
        
        const updatedRecord = {
            ...record,
            ...updates,
            updatedAt: new Date()
        };
        
        this.verifications.set(id, updatedRecord);
        console.log(`[Model] Updated verification: ${id}`);
        return updatedRecord;
    }

    async updateByRequestId(requestId, updates) {
        for (const [id, record] of this.verifications) {
            if (record.requestId === requestId) {
                return this.update(id, updates);
            }
        }
        return null;
    }

    async incrementPollCount(id) {
        const record = this.verifications.get(id);
        if (!record) return null;
        
        return this.update(id, {
            pollCount: (record.pollCount || 0) + 1,
            lastPolledAt: new Date()
        });
    }

    async getFailedVerifications(options = {}) {
        const {
            maxRetries = 3,
            retryAfterMinutes = 15
        } = options;
        
        const now = new Date();
        const retryAfterMs = retryAfterMinutes * 60 * 1000;
        const failedRecords = [];
        
        for (const [id, record] of this.verifications) {
            if (record.status !== "failed") continue;
            if (record.retryCount >= maxRetries) continue;
            
            if (record.lastRetryAt) {
                const timeSinceLastRetry = now - record.lastRetryAt;
                if (timeSinceLastRetry < retryAfterMs) continue;
            }
            
            failedRecords.push(record);
        }
        
        return failedRecords;
    }
}

module.exports = new VerificationModel();

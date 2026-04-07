-- src/migrations/002_webhook_events.sql
--
-- Creates the webhook_events table used by webhookController to audit
-- every inbound webhook payload.
--
-- Run with:
--   psql -U postgres -d bgv_platform -f src/migrations/002_webhook_events.sql
--
-- This table is append-only. Never update or delete rows — it is a
-- compliance audit trail.

CREATE TABLE IF NOT EXISTS webhook_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor           VARCHAR(50)  NOT NULL,          -- 'idfy' | 'gridlines'
    event_type       VARCHAR(100) NOT NULL,          -- IDfy's payload.status or 'unmatched'
    payload          JSONB        NOT NULL,           -- full raw inbound payload
    verification_id  UUID REFERENCES verification_requests(id) ON DELETE SET NULL,
                                                     -- null if we couldn't match a request
    status           VARCHAR(50)  NOT NULL,          -- 'received' | 'processed' | 'duplicate' | 'unmatched' | 'db_error'
    error_message    TEXT,                            -- populated when status = 'db_error'
    received_at      TIMESTAMP    DEFAULT NOW()
);

-- Index for looking up all webhooks for a given verification
CREATE INDEX IF NOT EXISTS idx_webhook_events_verification_id
    ON webhook_events(verification_id);

-- Index for filtering by vendor and status (e.g. find all unmatched IDfy webhooks)
CREATE INDEX IF NOT EXISTS idx_webhook_events_vendor_status
    ON webhook_events(vendor, status);

-- Index for time-based queries (e.g. "all webhooks in the last hour")
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
    ON webhook_events(received_at DESC);

-- Extend channel enum
ALTER TYPE reservation_channel ADD VALUE IF NOT EXISTS 'website';
ALTER TYPE reservation_channel ADD VALUE IF NOT EXISTS 'ical';

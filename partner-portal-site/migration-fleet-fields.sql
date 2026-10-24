-- Adds the extra vehicle/driver fields used by the redesigned Fleet & Documents
-- screen (vehicle make, driver phone/language). Run once in the Cloudflare D1
-- console against the partner-portal-db database, in addition to any earlier
-- migration-*.sql files you've already run.
ALTER TABLE vehicles ADD COLUMN make TEXT;
ALTER TABLE drivers ADD COLUMN phone TEXT;
ALTER TABLE drivers ADD COLUMN language TEXT;

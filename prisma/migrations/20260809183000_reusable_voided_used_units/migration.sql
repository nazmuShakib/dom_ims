-- A voided IMEI may be received again after correcting an intake mistake.
-- Keep every accepted acquisition as history instead of overwriting the old row.
DROP INDEX "used_device_acquisitions_unitId_key";

CREATE INDEX "used_device_acquisitions_unitId_acquiredAt_idx"
  ON "used_device_acquisitions"("unitId", "acquiredAt");

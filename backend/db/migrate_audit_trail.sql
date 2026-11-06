-- Complaint lifecycle audit trail.
--
-- Every complaint workflow step (create, edit, scrutiny, status transition,
-- documents, replies, clubbing, closure, ...) writes one row here. OldValues
-- and NewValues hold the changed columns only, as JSON, so the trail records
-- exactly what changed. IPAddress / UserAgent capture who made the change.

IF OBJECT_ID('tbl_AuditTrail', 'U') IS NULL
BEGIN
  CREATE TABLE tbl_AuditTrail (
    AuditID     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CompID      INT NULL,
    CompNo      NVARCHAR(50) NULL,
    UserID      INT NULL,
    UserType    INT NULL,
    Action      NVARCHAR(100) NOT NULL,
    Entity      NVARCHAR(80) NULL,
    EntityID    NVARCHAR(80) NULL,
    OldValues   NVARCHAR(MAX) NULL,
    NewValues   NVARCHAR(MAX) NULL,
    Details     NVARCHAR(MAX) NULL,
    IPAddress   NVARCHAR(64) NULL,
    UserAgent   NVARCHAR(500) NULL,
    CreatedAt   DATETIME2 NOT NULL CONSTRAINT DF_tbl_AuditTrail_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_tbl_AuditTrail_CompID' AND object_id = OBJECT_ID('tbl_AuditTrail')
)
  CREATE INDEX IX_tbl_AuditTrail_CompID
    ON tbl_AuditTrail (CompID, CreatedAt DESC);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_tbl_AuditTrail_UserID' AND object_id = OBJECT_ID('tbl_AuditTrail')
)
  CREATE INDEX IX_tbl_AuditTrail_UserID
    ON tbl_AuditTrail (UserID, CreatedAt DESC);

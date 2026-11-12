-- ===========================================================================
-- ICAI_COMPLAINT - SERVER DB UPDATE SCRIPT
-- ---------------------------------------------------------------------------
-- Source (local, app-connected): DESKTOP-CRTSJHO\SQLEXPRESS   / ICAI_COMPLAINT
-- Target (server copy)         : DESKTOP-CRTSJHO\SQLEXPRESS01 / ICAI_COMPLAINT
-- Generated                    : 2026-11-12
--
-- Run this script against the SERVER database in SSMS. Every statement is
-- guarded, so it is safe to run more than once.
--
-- COMPARISON RESULT
--   Missing on server - TABLES   : tbl_AuditTrail
--   Missing on server - COLUMNS  : tbl_NewComplaint.ScrutinySheet
--                                  tbl_NewComplaint.ClubbedWithCompID
--                                  tbl_NewComplaint.ClubRule
--                                  tbl_NewComplaint.VerificationDate
--                                  tbl_NewComplaint.VerificationPlace
--                                  tbl_NewComplaint.VerificationTime
--   Missing on server - STATUSES : 124, 125, 126, 127, 128, 129, 130, 131, 132, 133
--   Outdated on server - LABEL   : status 5 should be
--                                  'Recommendation to Director Discipline'
--   Missing on server - PROCS    : none
--                                  (local has sp_GetComplaintDetails and
--                                   ValidateLogin; both already exist on server)
--   Tables only on server        : tbl_FindingApprovalLog, tbl_Notification,
--                                  tbl_Punishment, tbl_PunishmentApprovalLog,
--                                  tbl_PunishmentMemberApproval
--                                  (leave them as-is; not present locally)
--
-- LAST DB UPDATES (from backend/db/*.sql, newest first)
--   2026-11-06  migrate_audit_trail.sql        -> tbl_AuditTrail + 2 indexes
--   2026-11-06  migrate_verification.sql       -> 3 verification columns
--   2026-11-06  migrate_status_133.sql         -> status 133
--   2026-10-23  migrate_additional_document_parties.sql -> statuses 131, 132
--   2026-10-16  migrate_rule54_rule6.sql       -> ClubbedWithCompID, ClubRule,
--                                                 statuses 125-130
--   2026-10-16  migrate_status5_label.sql      -> status 5 label
--   (ScrutinySheet column is present locally but has no migration file.)
-- ===========================================================================

USE [ICAI_COMPLAINT];
GO
SET NOCOUNT ON;
GO

-- ===========================================================================
-- 1. MISSING TABLE : tbl_AuditTrail
-- ===========================================================================
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
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_tbl_AuditTrail_CompID' AND object_id = OBJECT_ID('tbl_AuditTrail')
)
  CREATE INDEX IX_tbl_AuditTrail_CompID
    ON tbl_AuditTrail (CompID, CreatedAt DESC);
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_tbl_AuditTrail_UserID' AND object_id = OBJECT_ID('tbl_AuditTrail')
)
  CREATE INDEX IX_tbl_AuditTrail_UserID
    ON tbl_AuditTrail (UserID, CreatedAt DESC);
GO

-- ===========================================================================
-- 2. MISSING COLUMNS : tbl_NewComplaint
-- ===========================================================================
IF COL_LENGTH('dbo.tbl_NewComplaint', 'ScrutinySheet') IS NULL
  ALTER TABLE dbo.tbl_NewComplaint ADD ScrutinySheet NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH('dbo.tbl_NewComplaint', 'ClubbedWithCompID') IS NULL
  ALTER TABLE dbo.tbl_NewComplaint ADD ClubbedWithCompID INT NULL;
GO

IF COL_LENGTH('dbo.tbl_NewComplaint', 'ClubRule') IS NULL
  ALTER TABLE dbo.tbl_NewComplaint ADD ClubRule VARCHAR(1) NULL;
GO

IF COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationDate') IS NULL
  ALTER TABLE dbo.tbl_NewComplaint ADD VerificationDate DATE NULL;
GO

IF COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationPlace') IS NULL
  ALTER TABLE dbo.tbl_NewComplaint ADD VerificationPlace NVARCHAR(200) NULL;
GO

IF COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationTime') IS NULL
  ALTER TABLE dbo.tbl_NewComplaint ADD VerificationTime NVARCHAR(20) NULL;
GO

-- ===========================================================================
-- 3. MISSING STATUS MASTER ROWS : 124 to 133
-- ===========================================================================
IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 124)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (124, 'Recommendation to Working Officer', 124);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 125)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (125, 'Placed before Board of Discipline or Committee for clubbing decision', 125);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 126)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (126, 'Placed before Board of Discipline for closure', 126);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 127)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (127, 'Letter of withdrawal received', 127);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 128)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (128, 'Withdrawal placed before the Board of Discipline', 128);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 129)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (129, 'Withdrawal placed before the Committee', 129);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 130)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder)
  VALUES (130, 'Withdrawal permitted', 130);
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 131)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, CumulativeDays, UserTypeSO)
  VALUES (131, 'Additional documents submitted by the Respondent', 131, 'Under Scrutiny', 45, '5,7');
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 132)
  INSERT INTO tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, CumulativeDays, UserTypeSO)
  VALUES (132, 'Additional documents submitted by the Third Party', 132, 'Under Scrutiny', 45, '5,7');
GO

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 133)
  INSERT INTO tbl_StatusMaster
    (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
  VALUES
    (133, 'Assigned to Vetting Officer for Examination', 133, NULL, NULL, NULL, NULL, '5,13', 'Assigned to Vetting Officer for Examination');
GO

-- ===========================================================================
-- 4. OUTDATED STATUS LABEL : status 5
-- ===========================================================================
UPDATE tbl_StatusMaster
SET StatusName = 'Recommendation to Director Discipline'
WHERE StatusID = 5;
GO

-- ===========================================================================
-- 5. VERIFY
-- ===========================================================================
SELECT 'tbl_AuditTrail' AS ObjectName,
       CASE WHEN OBJECT_ID('tbl_AuditTrail', 'U') IS NULL THEN 'MISSING' ELSE 'OK' END AS Result
UNION ALL
SELECT 'ScrutinySheet',
       CASE WHEN COL_LENGTH('dbo.tbl_NewComplaint', 'ScrutinySheet') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL
SELECT 'ClubbedWithCompID',
       CASE WHEN COL_LENGTH('dbo.tbl_NewComplaint', 'ClubbedWithCompID') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL
SELECT 'ClubRule',
       CASE WHEN COL_LENGTH('dbo.tbl_NewComplaint', 'ClubRule') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL
SELECT 'VerificationDate',
       CASE WHEN COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationDate') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL
SELECT 'VerificationPlace',
       CASE WHEN COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationPlace') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL
SELECT 'VerificationTime',
       CASE WHEN COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationTime') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL
SELECT 'Statuses 124-133',
       CASE WHEN COUNT(*) = 10 THEN 'OK' ELSE 'MISSING ' + CAST(10 - COUNT(*) AS VARCHAR(5)) END
FROM tbl_StatusMaster WHERE StatusID BETWEEN 124 AND 133;
GO

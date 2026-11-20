-- ===========================================================================
-- ICAI_COMPLAINT - PROJECT DATABASE SCHEMA SYNC (SAFE)
-- Run in SSMS on the database that backend/.env points to.
-- Adds only missing tables/columns/indexes/function and refreshes seed rows.
-- It never DELETEs or truncates complaint/business data.
-- Change @ExpectedDb if your server database has a different name.
-- Views/SPs whose DDL is not in this repo are only reported. Paste their
-- CREATE statements into @ObjectDdl below to have them created when missing.
-- ===========================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ExpectedDb SYSNAME = N'ICAI_COMPLAINT';
DECLARE @CurrentDb SYSNAME = DB_NAME();

IF @CurrentDb <> @ExpectedDb
BEGIN
  RAISERROR('Wrong database. Connect to %s (current: %s).', 16, 1, @ExpectedDb, @CurrentDb);
  RETURN;
END;

IF OBJECT_ID(N'dbo.tbl_NewComplaint', N'U') IS NULL
   OR OBJECT_ID(N'dbo.tbl_StatusMaster', N'U') IS NULL
   OR OBJECT_ID(N'dbo.tbl_UserTypes', N'U') IS NULL
BEGIN
  RAISERROR('This database does not look like the ICAI complaint schema.', 16, 1);
  RETURN;
END;

DECLARE @ExpectedTables TABLE (ObjectName SYSNAME NOT NULL PRIMARY KEY);
INSERT @ExpectedTables (ObjectName) VALUES
 (N'tbl_NewComplaint'), (N'tbl_Users'), (N'tbl_StatusMaster'),
 (N'tbl_ComplaintStatus'), (N'tbl_ComplaintSubStatus'), (N'tbl_CompType'),
 (N'tbl_StateMaster'), (N'tbl_CityMaster'), (N'tbl_PaymentMode'),
 (N'tbl_DocumentMaster'), (N'tbl_AcademicSession'), (N'tbl_Regulator'),
 (N'tbl_Schedule'), (N'tbl_ItemMaster'), (N'tbl_PartNo'), (N'tbl_Master_CY'),
 (N'tbl_BoardFormation'), (N'tbl_BoardMembers'), (N'tbl_DecisionMaster'),
 (N'tbl_AdjournmentReasonMaster'), (N'tbl_UserTypes'),
 (N'tbl_ComplaintDocument'), (N'tbl_FactPersons'), (N'tbl_AnswerableMember'),
 (N'tbl_AudioVideoAttachment'), (N'tbl_ScheduleList'), (N'tbl_SimilarCase'),
 (N'tbl_ComplaintDefect'), (N'tbl_StayDetails'), (N'tbl_Finding'),
 (N'tbl_AdjournmentAttachment'), (N'tbl_AdjournmentResponse'),
 (N'tbl_ComplaintStatusAttachment'), (N'tbl_Ajenda'), (N'tbl_CauseList'),
 (N'tbl_CauseList_1'), (N'tbl_Decision'), (N'tbl_Witness'),
 (N'tbl_BenchAttendance'), (N'tbl_Token'), (N'tbl_AuditTrail'),
 (N'tbl_PaymentTransaction');

DECLARE @ExpectedColumns TABLE (TableName SYSNAME NOT NULL, ColumnName SYSNAME NOT NULL, PRIMARY KEY (TableName, ColumnName));
INSERT @ExpectedColumns (TableName, ColumnName) VALUES
 (N'tbl_NewComplaint', N'ScrutinySheet'),
 (N'tbl_NewComplaint', N'ClubbedWithCompID'),
 (N'tbl_NewComplaint', N'ClubRule'),
 (N'tbl_NewComplaint', N'VerificationDate'),
 (N'tbl_NewComplaint', N'VerificationPlace'),
 (N'tbl_NewComplaint', N'VerificationTime'),
 (N'tbl_NewComplaint', N'IdentityType'),
 (N'tbl_NewComplaint', N'SignedFormICopy'),
 (N'tbl_ComplaintDefect', N'RelevantColumn'),
 (N'tbl_PaymentTransaction', N'OrderID'),
 (N'tbl_PaymentTransaction', N'CompID'),
 (N'tbl_PaymentTransaction', N'UserID'),
 (N'tbl_PaymentTransaction', N'Amount'),
 (N'tbl_PaymentTransaction', N'Status'),
 (N'tbl_PaymentTransaction', N'CreatedAt');

DECLARE @ExpectedObjects TABLE (ObjectName SYSNAME NOT NULL PRIMARY KEY, ObjectType NVARCHAR(30) NOT NULL);
INSERT @ExpectedObjects (ObjectName, ObjectType) VALUES
 (N'vw_NewComplaint', N'VIEW'),
 (N'vw_ScheduleList', N'VIEW'),
 (N'vw_CauseList', N'VIEW'),
 (N'vw_Agenda', N'VIEW'),
 (N'SplitString', N'FUNCTION'),
 (N'sp_GetComplaintDetails', N'PROCEDURE'),
 (N'ValidateLogin', N'PROCEDURE');

DECLARE @ExpectedStatusIds TABLE (StatusID INT NOT NULL PRIMARY KEY);
INSERT @ExpectedStatusIds (StatusID) VALUES
 (124), (125), (126), (127), (128), (129), (130), (131), (132), (133), (134);

DECLARE @ObjectDdl TABLE (ObjectName SYSNAME NOT NULL PRIMARY KEY, Ddl NVARCHAR(MAX) NULL);

INSERT @ObjectDdl (ObjectName, Ddl) VALUES
 (N'SplitString', N'CREATE FUNCTION dbo.SplitString(@List NVARCHAR(MAX), @Delimiter NVARCHAR(1))
RETURNS TABLE
AS RETURN
  SELECT Value = LTRIM(RTRIM(t.n.value(N''.'', N''NVARCHAR(MAX)'')))
  FROM (SELECT CAST(N''<r><n>'' + REPLACE(@List, @Delimiter, N''</n><n>'') + N''</n></r>'' AS XML) AS x) AS d
  CROSS APPLY d.x.nodes(N''/r/n'') AS t(n);');

BEGIN TRY
  BEGIN TRAN;

  IF OBJECT_ID(N'dbo.tbl_AuditTrail', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.tbl_AuditTrail (
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

  IF OBJECT_ID(N'dbo.tbl_AuditTrail', N'U') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tbl_AuditTrail_CompID' AND object_id = OBJECT_ID(N'dbo.tbl_AuditTrail'))
    CREATE INDEX IX_tbl_AuditTrail_CompID ON dbo.tbl_AuditTrail (CompID, CreatedAt DESC);

  IF OBJECT_ID(N'dbo.tbl_AuditTrail', N'U') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tbl_AuditTrail_UserID' AND object_id = OBJECT_ID(N'dbo.tbl_AuditTrail'))
    CREATE INDEX IX_tbl_AuditTrail_UserID ON dbo.tbl_AuditTrail (UserID, CreatedAt DESC);

  IF OBJECT_ID(N'dbo.tbl_ComplaintDefect', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.tbl_ComplaintDefect (
      ComplaintDefectID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      CompID INT NOT NULL,
      CompStatusID INT NULL,
      DefectCode NVARCHAR(20) NOT NULL,
      DefectText NVARCHAR(500) NOT NULL,
      RelevantColumn NVARCHAR(200) NULL,
      Communication NVARCHAR(MAX) NULL,
      ResponseRemark NVARCHAR(MAX) NULL,
      ResponseAttachment NVARCHAR(500) NULL,
      RespondedBy INT NULL,
      RespondedDate DATETIME NULL,
      CreatedBy INT NULL,
      CreatedDate DATETIME NOT NULL CONSTRAINT DF_tbl_ComplaintDefect_CreatedDate DEFAULT (GETDATE())
    );
  END;

  IF OBJECT_ID(N'dbo.tbl_ComplaintDefect', N'U') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tbl_ComplaintDefect_CompID' AND object_id = OBJECT_ID(N'dbo.tbl_ComplaintDefect'))
    CREATE INDEX IX_tbl_ComplaintDefect_CompID ON dbo.tbl_ComplaintDefect (CompID, CompStatusID);

  IF OBJECT_ID(N'dbo.tbl_ComplaintDefect', N'U') IS NOT NULL
     AND COL_LENGTH(N'dbo.tbl_ComplaintDefect', N'RelevantColumn') IS NULL
    ALTER TABLE dbo.tbl_ComplaintDefect ADD RelevantColumn NVARCHAR(200) NULL;

  IF OBJECT_ID(N'dbo.tbl_PaymentTransaction', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.tbl_PaymentTransaction (
      PaymentTxnID   BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      OrderID        NVARCHAR(50) NOT NULL CONSTRAINT UQ_tbl_PaymentTransaction_OrderID UNIQUE,
      CompID         INT NULL,
      UserID         INT NULL,
      Amount         DECIMAL(10,2) NOT NULL,
      ProductInfo    NVARCHAR(200) NULL,
      FirstName      NVARCHAR(100) NULL,
      Email          NVARCHAR(150) NULL,
      Phone          NVARCHAR(20) NULL,
      Status         NVARCHAR(30) NOT NULL CONSTRAINT DF_tbl_PaymentTransaction_Status DEFAULT N'INITIATED',
      PayUStatus     NVARCHAR(50) NULL,
      PayUTxnID      NVARCHAR(100) NULL,
      GatewayRefNo   NVARCHAR(100) NULL,
      ErrorMessage   NVARCHAR(500) NULL,
      IsHashVerified BIT NULL,
      UDF1           NVARCHAR(50) NULL,
      CreatedAt      DATETIME2 NOT NULL CONSTRAINT DF_tbl_PaymentTransaction_CreatedAt DEFAULT SYSUTCDATETIME(),
      UpdatedAt      DATETIME2 NULL
    );
  END;

  IF OBJECT_ID(N'dbo.tbl_PaymentTransaction', N'U') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_tbl_PaymentTransaction_OrderID' AND parent_object_id = OBJECT_ID(N'dbo.tbl_PaymentTransaction'))
     AND COL_LENGTH(N'dbo.tbl_PaymentTransaction', N'OrderID') IS NOT NULL
    ALTER TABLE dbo.tbl_PaymentTransaction ADD CONSTRAINT UQ_tbl_PaymentTransaction_OrderID UNIQUE (OrderID);

  IF OBJECT_ID(N'dbo.tbl_PaymentTransaction', N'U') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tbl_PaymentTransaction_CompID' AND object_id = OBJECT_ID(N'dbo.tbl_PaymentTransaction'))
     AND COL_LENGTH(N'dbo.tbl_PaymentTransaction', N'CompID') IS NOT NULL
    CREATE INDEX IX_tbl_PaymentTransaction_CompID ON dbo.tbl_PaymentTransaction (CompID, CreatedAt DESC);

  IF OBJECT_ID(N'dbo.tbl_PaymentTransaction', N'U') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tbl_PaymentTransaction_UserID' AND object_id = OBJECT_ID(N'dbo.tbl_PaymentTransaction'))
     AND COL_LENGTH(N'dbo.tbl_PaymentTransaction', N'UserID') IS NOT NULL
    CREATE INDEX IX_tbl_PaymentTransaction_UserID ON dbo.tbl_PaymentTransaction (UserID, CreatedAt DESC);

  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'ScrutinySheet') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD ScrutinySheet NVARCHAR(MAX) NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'ClubbedWithCompID') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD ClubbedWithCompID INT NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'ClubRule') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD ClubRule VARCHAR(1) NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'VerificationDate') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD VerificationDate DATE NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'VerificationPlace') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD VerificationPlace NVARCHAR(200) NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'VerificationTime') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD VerificationTime NVARCHAR(20) NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'IdentityType') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD IdentityType NVARCHAR(30) NULL;
  IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'SignedFormICopy') IS NULL
    ALTER TABLE dbo.tbl_NewComplaint ADD SignedFormICopy NVARCHAR(500) NULL;

  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 124)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (124, N'Recommendation to Working Officer', 124);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 125)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (125, N'Placed before Board of Discipline or Committee for clubbing decision', 125);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 126)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (126, N'Placed before Board of Discipline for closure', 126);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 127)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (127, N'Letter of withdrawal received', 127);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 128)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (128, N'Withdrawal placed before the Board of Discipline', 128);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 129)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (129, N'Withdrawal placed before the Committee', 129);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 130)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder) VALUES (130, N'Withdrawal permitted', 130);
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 131)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, CumulativeDays, UserTypeSO)
    VALUES (131, N'Additional documents submitted by the Respondent', 131, N'Under Scrutiny', 45, N'5,7');
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 132)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, CumulativeDays, UserTypeSO)
    VALUES (132, N'Additional documents submitted by the Third Party', 132, N'Under Scrutiny', 45, N'5,7');
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 133)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
    VALUES (133, N'Assigned to Vetting Officer for Examination', 133, NULL, NULL, NULL, NULL, N'5,13', N'Assigned to Vetting Officer for Examination');
  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster WHERE StatusID = 134)
    INSERT INTO dbo.tbl_StatusMaster (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
    VALUES (134, N'Offline Complaint Submitted by Sub SO', 134, N'Under Scrutiny', NULL, NULL, NULL, N'5', N'Offline Complaint Submitted by Sub SO');

  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Recommendation to Director Discipline' WHERE StatusID = 5;
  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Placed before Board of Discipline or Committee for clubbing decision' WHERE StatusID = 125;
  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Placed before Board of Discipline for closure' WHERE StatusID = 126;
  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Letter of withdrawal received' WHERE StatusID = 127;
  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Withdrawal placed before the Board of Discipline' WHERE StatusID = 128;
  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Withdrawal placed before the Committee' WHERE StatusID = 129;
  UPDATE dbo.tbl_StatusMaster SET StatusName = N'Withdrawal permitted' WHERE StatusID = 130;

  IF NOT EXISTS (SELECT 1 FROM dbo.tbl_UserTypes WHERE UserTypeID = 14)
  BEGIN
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.tbl_UserTypes') AND name = N'UserTypeID' AND is_identity = 1)
    BEGIN
      SET IDENTITY_INSERT dbo.tbl_UserTypes ON;
      INSERT INTO dbo.tbl_UserTypes (UserTypeID, UserTypeName, UserAbb) VALUES (14, N'Sub SO', N'014');
      SET IDENTITY_INSERT dbo.tbl_UserTypes OFF;
    END
    ELSE
      INSERT INTO dbo.tbl_UserTypes (UserTypeID, UserTypeName, UserAbb) VALUES (14, N'Sub SO', N'014');
  END;

  DECLARE @obj SYSNAME;
  DECLARE @ddl NVARCHAR(MAX);
  DECLARE obj_cur CURSOR LOCAL FAST_FORWARD FOR SELECT ObjectName FROM @ExpectedObjects;
  OPEN obj_cur;
  FETCH NEXT FROM obj_cur INTO @obj;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    IF OBJECT_ID(N'dbo.' + @obj) IS NULL
    BEGIN
      SELECT @ddl = Ddl FROM @ObjectDdl WHERE ObjectName = @obj;
      IF @ddl IS NOT NULL AND LTRIM(RTRIM(@ddl)) <> N''
        EXEC sys.sp_executesql @ddl;
    END;
    FETCH NEXT FROM obj_cur INTO @obj;
  END;
  CLOSE obj_cur;
  DEALLOCATE obj_cur;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;
  THROW;
END CATCH;

SELECT CheckType = N'TABLE',
       ObjectName = t.ObjectName,
       Status = CASE WHEN OBJECT_ID(N'dbo.' + t.ObjectName, N'U') IS NULL THEN N'MISSING' ELSE N'OK' END,
       Note = CASE WHEN OBJECT_ID(N'dbo.' + t.ObjectName, N'U') IS NULL THEN N'No DDL in repo' ELSE NULL END
FROM @ExpectedTables t
UNION ALL
SELECT CheckType = N'COLUMN',
       ObjectName = c.TableName + N'.' + c.ColumnName,
       Status = CASE WHEN COL_LENGTH(N'dbo.' + c.TableName, c.ColumnName) IS NULL THEN N'MISSING' ELSE N'OK' END,
       Note = NULL
FROM @ExpectedColumns c
UNION ALL
SELECT CheckType = N'OBJECT',
       ObjectName = o.ObjectName + N' (' + o.ObjectType + N')',
       Status = CASE WHEN OBJECT_ID(N'dbo.' + o.ObjectName) IS NULL THEN N'MISSING' ELSE N'OK' END,
       Note = CASE WHEN OBJECT_ID(N'dbo.' + o.ObjectName) IS NULL
                   THEN CASE WHEN EXISTS (SELECT 1 FROM @ObjectDdl d WHERE d.ObjectName = o.ObjectName AND d.Ddl IS NOT NULL AND LTRIM(RTRIM(d.Ddl)) <> N'')
                             THEN N'DDL supplied but creation failed'
                             ELSE N'No DDL in repo - paste CREATE statement into @ObjectDdl'
                        END
                   ELSE NULL END
FROM @ExpectedObjects o
UNION ALL
SELECT CheckType = N'SEED STATUS',
       ObjectName = N'StatusID=' + CAST(s.StatusID AS NVARCHAR(10)),
       Status = CASE WHEN EXISTS (SELECT 1 FROM dbo.tbl_StatusMaster sm WHERE sm.StatusID = s.StatusID) THEN N'OK' ELSE N'MISSING' END,
       Note = NULL
FROM @ExpectedStatusIds s
UNION ALL
SELECT CheckType = N'SEED USER TYPE',
       ObjectName = N'UserTypeID=14',
       Status = CASE WHEN EXISTS (SELECT 1 FROM dbo.tbl_UserTypes ut WHERE ut.UserTypeID = 14) THEN N'OK' ELSE N'MISSING' END,
       Note = NULL
ORDER BY CheckType, ObjectName;

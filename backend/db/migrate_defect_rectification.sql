-- Rule 5(5) defect rectification. The SO selects one or more defects from the
-- Disciplinary Directorate catalogue when returning a complaint to the
-- complainant; each selected defect is stored as its own row so the complainant
-- can respond to every defect separately with a document and/or remark.
IF OBJECT_ID('tbl_ComplaintDefect', 'U') IS NULL
BEGIN
  CREATE TABLE tbl_ComplaintDefect (
    ComplaintDefectID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
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

  CREATE INDEX IX_tbl_ComplaintDefect_CompID
    ON tbl_ComplaintDefect (CompID, CompStatusID);
END

IF COL_LENGTH('tbl_ComplaintDefect', 'RelevantColumn') IS NULL
BEGIN
  ALTER TABLE tbl_ComplaintDefect ADD RelevantColumn NVARCHAR(200) NULL;
END

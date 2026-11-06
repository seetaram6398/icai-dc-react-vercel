IF COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationDate') IS NULL
BEGIN
  ALTER TABLE dbo.tbl_NewComplaint ADD VerificationDate DATE NULL;
END;

IF COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationPlace') IS NULL
BEGIN
  ALTER TABLE dbo.tbl_NewComplaint ADD VerificationPlace NVARCHAR(200) NULL;
END;

IF COL_LENGTH('dbo.tbl_NewComplaint', 'VerificationTime') IS NULL
BEGIN
  ALTER TABLE dbo.tbl_NewComplaint ADD VerificationTime NVARCHAR(20) NULL;
END;

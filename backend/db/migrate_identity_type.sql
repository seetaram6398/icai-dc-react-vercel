IF COL_LENGTH('dbo.tbl_NewComplaint', 'IdentityType') IS NULL
BEGIN
  ALTER TABLE dbo.tbl_NewComplaint ADD IdentityType NVARCHAR(30) NULL;
END;

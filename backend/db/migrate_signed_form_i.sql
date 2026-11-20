IF COL_LENGTH('dbo.tbl_NewComplaint', 'SignedFormICopy') IS NULL
BEGIN
  ALTER TABLE dbo.tbl_NewComplaint ADD SignedFormICopy NVARCHAR(500) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_UserTypes WHERE UserTypeID = 15)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.tbl_UserTypes') AND name = N'UserTypeID' AND is_identity = 1)
  BEGIN
    SET IDENTITY_INSERT dbo.tbl_UserTypes ON;
    INSERT INTO dbo.tbl_UserTypes (UserTypeID, UserTypeName, UserAbb)
    VALUES (15, N'Info Sub SO', N'015');
    SET IDENTITY_INSERT dbo.tbl_UserTypes OFF;
  END
  ELSE
    INSERT INTO dbo.tbl_UserTypes (UserTypeID, UserTypeName, UserAbb)
    VALUES (15, N'Info Sub SO', N'015');
END

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_UserTypes WHERE UserTypeID = 16)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.tbl_UserTypes') AND name = N'UserTypeID' AND is_identity = 1)
  BEGIN
    SET IDENTITY_INSERT dbo.tbl_UserTypes ON;
    INSERT INTO dbo.tbl_UserTypes (UserTypeID, UserTypeName, UserAbb)
    VALUES (16, N'Info SO', N'016');
    SET IDENTITY_INSERT dbo.tbl_UserTypes OFF;
  END
  ELSE
    INSERT INTO dbo.tbl_UserTypes (UserTypeID, UserTypeName, UserAbb)
    VALUES (16, N'Info SO', N'016');
END

IF COL_LENGTH(N'dbo.tbl_NewComplaint', N'IsInformant') IS NULL
BEGIN
  ALTER TABLE dbo.tbl_NewComplaint
    ADD IsInformant BIT NOT NULL CONSTRAINT DF_tbl_NewComplaint_IsInformant DEFAULT (0);
END

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 135)
BEGIN
  INSERT INTO tbl_StatusMaster
    (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
  VALUES
    (135, 'Information Submitted by Info Sub SO', 135, 'Under Scrutiny', NULL, NULL, NULL, '16', 'Information Submitted by Info Sub SO');
END

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 136)
BEGIN
  INSERT INTO tbl_StatusMaster
    (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
  VALUES
    (136, 'Information Under Scrutiny by Info SO', 136, 'Under Scrutiny', NULL, NULL, NULL, '16', 'Information Under Scrutiny by Info SO');
END

IF NOT EXISTS (SELECT 1 FROM tbl_StatusMaster WHERE StatusID = 137)
BEGIN
  INSERT INTO tbl_StatusMaster
    (StatusID, StatusName, DisplayOrder, SubStatus, MaxDays, CumulativeDays, UserTypeDD, UserTypeSO, StatusNameForAgenda)
  VALUES
    (137, 'Information Disposed', 137, NULL, NULL, NULL, NULL, '16', 'Information Disposed');
END

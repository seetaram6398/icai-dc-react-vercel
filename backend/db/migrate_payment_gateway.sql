IF OBJECT_ID('tbl_PaymentTransaction', 'U') IS NULL
BEGIN
  CREATE TABLE tbl_PaymentTransaction (
    PaymentTxnID   BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    OrderID        NVARCHAR(50) NOT NULL CONSTRAINT UQ_tbl_PaymentTransaction_OrderID UNIQUE,
    CompID         INT NULL,
    UserID         INT NULL,
    Amount         DECIMAL(10,2) NOT NULL,
    ProductInfo    NVARCHAR(200) NULL,
    FirstName      NVARCHAR(100) NULL,
    Email          NVARCHAR(150) NULL,
    Phone          NVARCHAR(20) NULL,
    Status         NVARCHAR(30) NOT NULL CONSTRAINT DF_tbl_PaymentTransaction_Status DEFAULT 'INITIATED',
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

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_tbl_PaymentTransaction_CompID' AND object_id = OBJECT_ID('tbl_PaymentTransaction')
)
  CREATE INDEX IX_tbl_PaymentTransaction_CompID
    ON tbl_PaymentTransaction (CompID, CreatedAt DESC);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_tbl_PaymentTransaction_UserID' AND object_id = OBJECT_ID('tbl_PaymentTransaction')
)
  CREATE INDEX IX_tbl_PaymentTransaction_UserID
    ON tbl_PaymentTransaction (UserID, CreatedAt DESC);

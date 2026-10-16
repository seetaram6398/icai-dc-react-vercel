const express = require('express');
const { query } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();

/**
 * Master types that are safe reference dictionaries (states, cities) and
 * usable without authentication – required by the public registration page.
 */
const PUBLIC_TYPES = new Set([3, 7, 11, 25, 33]);

/**
 * GET /api/masters/:type
 * Mirrors iDiary_CLS.LoadMasterInfo switch cases (1-32).
 * ?option1=... for dependent dropdowns
 * Public types (3, 7, 11) are reference dictionaries callable without a token.
 */
router.get('/:type', (req, res, next) => {
    const type = Number(req.params.type);
    if (PUBLIC_TYPES.has(type)) return next();
    return authMiddleware(req, res, next);
  }, async (req, res) => {
    try {
      const type = Number(req.params.type);
      const option1 = req.query.option1 || '';
      let sqlStr = '';
      const params = {};

      switch (type) {
      case 1:
        sqlStr = "SELECT ASID AS value, ASName AS label FROM tbl_AcademicSession WHERE IsDeactive='False' ORDER BY ASID";
        break;
      case 2:
        sqlStr = option1
          ? "SELECT CompTypeID AS value, CompTypeName AS label FROM tbl_CompType WHERE isGov=@o1 ORDER BY DisplayOrder"
          : "SELECT CompTypeID AS value, CompTypeName AS label FROM tbl_CompType ORDER BY DisplayOrder";
        if (option1) params.o1 = option1;
        break;
      case 3:
        sqlStr = 'SELECT StateID AS value, UPPER(StateName) AS label, Region FROM tbl_StateMaster ORDER BY StateName';
        break;
      case 4:
        sqlStr = 'SELECT PaymentModeID AS value, PaymentModeName AS label FROM tbl_PaymentMode ORDER BY DisplayOrder';
        break;
      case 5:
        sqlStr = 'SELECT DocumentID AS value, DocumentName AS label FROM tbl_DocumentMaster ORDER BY DisplayOrder';
        break;
      case 6:
        sqlStr = 'SELECT UserID AS value, CONCAT(NameOfTheUser, \' (\', ISNULL(Email, \'\'), \')\') AS label FROM tbl_Users WHERE UserType=@o1 ORDER BY NameOfTheUser';
        params.o1 = Number(option1);
        break;
      case 7:
        sqlStr = 'SELECT CityID AS value, UPPER(CityName) AS label FROM tbl_CityMaster WHERE StateID=@o1 ORDER BY CityName';
        params.o1 = Number(option1);
        break;
      case 8:
        sqlStr = 'SELECT ScheduleID AS value, ScheduleName AS label FROM tbl_Schedule ORDER BY DisplayOrder';
        break;
      case 9:
        sqlStr = "SELECT ItemID AS value, ItemName AS label FROM tbl_ItemMaster WHERE PartID=@o1 ORDER BY DisplayOrder";
        params.o1 = option1;
        break;
      case 10:
        sqlStr = "SELECT PartNoID AS value, PartNo AS label FROM tbl_PartNo WHERE ScheduleID=@o1 ORDER BY DisplayOrder";
        params.o1 = option1;
        break;
      case 11:
        sqlStr = 'SELECT CityID AS value, UPPER(CityName) AS label FROM tbl_CityMaster ORDER BY CityName';
        break;
      case 12:
        sqlStr = 'SELECT StatusID AS value, UPPER(StatusName) AS label FROM tbl_StatusMaster ORDER BY DisplayOrder';
        break;
      case 13:
        sqlStr = 'SELECT CYWiseID AS value, UPPER(CYName) AS label FROM tbl_Master_CY';
        break;
      case 14:
        sqlStr = 'SELECT BFID AS value, UPPER(BoardName) AS label FROM tbl_BoardFormation';
        break;
      case 15:
        sqlStr = 'SELECT CauseListID AS value, CauseDate AS label FROM tbl_CauseList';
        break;
      case 16:
        sqlStr = option1
          ? req.query.option2
            ? "SELECT CauseListID AS value, CauseTime AS label FROM tbl_CauseList WHERE CauseListID=@o1 AND HearingType=@o2"
            : "SELECT CauseListID AS value, CauseTime AS label FROM tbl_CauseList WHERE CauseListID=@o1"
          : 'SELECT CauseListID AS value, CauseTime AS label FROM tbl_CauseList WHERE CauseListID=-1';
        params.o1 = option1 || 0;
        if (req.query.option2) params.o2 = req.query.option2;
        break;
      case 17:
        sqlStr = 'SELECT CauseListID AS value, Place AS label FROM tbl_CauseList WHERE CauseListID=@o1';
        params.o1 = option1;
        break;
      case 18:
        sqlStr = 'SELECT CauseListID AS value, HearingURL AS label FROM tbl_CauseList WHERE CauseListID=@o1';
        params.o1 = option1;
        break;
      case 19:
        sqlStr = "SELECT CompID AS value, CompNo AS label FROM tbl_NewComplaint WHERE CompID IN (SELECT CompID FROM tbl_CauseList WHERE CauseListID=@o1 AND (IsAdjour IS NULL OR IsAdjour=0))";
        params.o1 = option1;
        break;
      case 20:
        sqlStr = 'SELECT ADID AS value, AdName AS label FROM tbl_AdjournmentReasonMaster ORDER BY ADName';
        break;
      case 21:
        sqlStr = "SELECT CLID AS value, (CONVERT(varchar, HearingDate, 105) + ' ' + CONVERT(varchar, HearingTime, 108)) AS label FROM tbl_CauseList_1 ORDER BY CLID";
        break;
      case 22:
        sqlStr = 'SELECT CLID AS value, CompNo AS label FROM vw_CauseList ORDER BY CLID';
        break;
      case 23:
        sqlStr = "SELECT DMID AS value, DecisionName AS label FROM tbl_DecisionMaster WHERE Dtype=@o1 ORDER BY DMID";
        params.o1 = option1;
        break;
      case 24:
        sqlStr = "SELECT CompID AS value, CompNo AS label FROM tbl_NewComplaint WHERE IsTemp='0'";
        break;
      case 25:
        sqlStr = "SELECT CompTypeID AS value, CompTypeName AS label FROM tbl_CompType WHERE IsGov='1'";
        break;
      case 26:
        sqlStr = 'SELECT StatusID AS value, StatusName AS label FROM tbl_StatusMaster WHERE StatusID IN (6,11,25,36)';
        break;
      case 27:
        sqlStr = 'SELECT AjendaID AS value, ADate AS label FROM vw_Agenda WHERE StatusID IN (6,11,25)';
        break;
      case 28:
        sqlStr = "SELECT StatusID AS value, StatusName AS label FROM tbl_StatusMaster CROSS APPLY STRING_SPLIT(UserTypeSO, ',') AS split WHERE split.value=@o1";
        params.o1 = option1;
        break;
      case 29:
        sqlStr = 'SELECT CompID AS value, CompNo AS label FROM tbl_NewComplaint WHERE StatusID IN (36,34,25,41)';
        break;
      case 30:
        sqlStr = "SELECT UserID AS value, NameOfTheUser AS label FROM tbl_Users WHERE UserType=@o1 AND BMID IS NULL AND CanMarkDecision=1 ORDER BY NameOfTheUser";
        params.o1 = Number(option1);
        break;
      case 31:
        sqlStr = "SELECT UserID AS value, NameOfTheUser AS label FROM tbl_Users WHERE UserType=6 AND BMID IS NULL AND UserID <> @o1 ORDER BY NameOfTheUser";
        params.o1 = Number(option1);
        break;
      case 32:
        sqlStr = 'SELECT UserID AS value, NameOfTheUser AS label FROM tbl_Users WHERE UserType IN (SELECT value FROM STRING_SPLIT(@o1, \',\')) AND BMID IS NULL ORDER BY NameOfTheUser';
        params.o1 = option1;
        break;
      case 33:
        sqlStr = 'SELECT RegulatorID AS value, RegulatorName AS label FROM tbl_Regulator WHERE CompTypeID=@o1 ORDER BY RegulatorName';
        params.o1 = Number(option1);
        break;
      default:
        return res.status(400).json({ error: 'Unknown master type' });
    }

    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('masters error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

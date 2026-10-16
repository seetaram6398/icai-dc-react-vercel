const express = require('express');
const { query, executeScalar, executeNonQuery } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/hearings
 * List hearings for a complaint or all.
 * Query: ?compId=...&type=hearing|punishment
 */
router.get('/', async (req, res) => {
  try {
    const { compId, type } = req.query;
    let sqlStr = `
      SELECT cl.CauseListID, cl.CompID, cl.CauseDate, cl.CauseTime, cl.Place, cl.IsDeleted,
             cl.IsOnline, cl.IsOnlineResp, cl.IsAccept, cl.IsAcceptResp, cl.IsAdjour,
             nc.CompNo, nc.ResName
      FROM tbl_CauseList cl
      INNER JOIN tbl_NewComplaint nc ON cl.CompID = nc.CompID
      WHERE 1=1`;
    const params = {};
    if (compId) {
      sqlStr += ' AND cl.CompID=@compId';
      params.compId = Number(compId);
    }
    if (type === 'punishment') {
      sqlStr += ' AND cl.StatusID=88';
    }
    sqlStr += ' ORDER BY cl.CauseDate DESC';
    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('hearings list error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/hearings
 * Create a hearing record. Body: full cause-list payload
 */
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const userId = req.user.UserID;
    await executeNonQuery(
      `INSERT INTO tbl_CauseList
        (CompID, CauseDate, CauseTime, Place, CauseList, UserID, HearingURL, HearingDetails, LastDate, HearingType, StatusID)
       VALUES
        (@compId, @causeDate, @causeTime, @place, @causeList, @userId, @url, @details, @lastDate, @hearingType, @statusId)`,
      {
        compId: b.compId,
        causeDate: b.causeDate,
        causeTime: b.causeTime,
        place: b.place,
        causeList: b.causeList || null,
        userId,
        url: b.hearingUrl || null,
        details: b.hearingDetails || null,
        lastDate: b.lastDate || null,
        hearingType: b.hearingType || '1',
        statusId: b.statusId || null,
      }
    );
    res.status(201).json({ message: 'Hearing created' });
  } catch (e) {
    console.error('create hearing error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/hearings/:id/preference
 * Party sets online/offline and accept/decline.
 * Body: { isRespondent, isOnline, isAccept }
 */
router.post('/:id/preference', async (req, res) => {
  try {
    const id = req.params.id;
    const { isRespondent, isOnline, isAccept } = req.body;
    const set = [];
    const params = { id };
    if (isRespondent === 1) {
      set.push(`IsOnlineResp=@isOnline`);
      set.push(`IsAcceptResp=@isAccept`);
    } else {
      set.push(`IsOnline=@isOnline`);
      set.push(`IsAccept=@isAccept`);
    }
    params.isOnline = isOnline ? 1 : 0;
    params.isAccept = isAccept ? 1 : 0;
    await executeNonQuery(`UPDATE tbl_CauseList SET ${set.join(', ')} WHERE CauseListID=@id`, params);
    res.json({ message: 'Preference saved' });
  } catch (e) {
    console.error('preference error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/hearings/:id/adjourn
 * Request adjournment.
 * Body: { compId, adID (reason), remark, hearingId }
 */
router.post('/:id/adjourn', async (req, res) => {
  try {
    const id = req.params.id;
    const { compId, adID, remark, isComp } = req.body;
    const userId = req.user.UserID;
    await executeNonQuery(
      `INSERT INTO tbl_AdjournmentResponse (ADID, Remark, CompID, UserID, HearingID, IsComp)
       VALUES (@adID, @remark, @compId, @userId, @hearingId, @isComp)`,
      { adID: adID || null, remark, compId, userId, hearingId: id, isComp: isComp ? 1 : 0 }
    );
    await executeNonQuery('UPDATE tbl_CauseList SET IsAdjour=1 WHERE CauseListID=@id', { id });
    res.json({ message: 'Adjournment requested' });
  } catch (e) {
    console.error('adjourn error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** GET /api/hearings/:id/witnesses - list witnesses for a hearing/cause list */
router.get('/:id/witnesses', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM tbl_Witness WHERE CauseListID=@id', { id: req.params.id });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/hearings/:id/witnesses - add a witness */
router.post('/:id/witnesses', async (req, res) => {
  try {
    const { wname, waddress, wemail, wmobile, compId, isRespondant } = req.body;
    await executeNonQuery(
      `INSERT INTO tbl_Witness (WName, WAddress, WEmailID, WMobileNo, CauseListID, CompID, UserID, IsComp)
       VALUES (@wname, @waddress, @wemail, @wmobile, @id, @compId, @userId, @isComp)`,
      {
        wname,
        waddress,
        wemail,
        wmobile,
        id: req.params.id,
        compId,
        userId: req.user.UserID,
        isComp: isRespondant ? 1 : 0,
      }
    );
    res.status(201).json({ message: 'Witness added' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/hearings/:id/bench-attendance - mark bench attendance */
router.post('/:id/bench-attendance', async (req, res) => {
  try {
    const { members } = req.body;
    for (const m of members) {
      await executeNonQuery(
        `INSERT INTO tbl_BenchAttendance (BMID, CLID, EntryDate, IsPresent)
         VALUES (@bmID, @id, GETDATE(), @isPresent)`,
        { bmID: m.bmID, id: req.params.id, isPresent: m.isPresent ? 1 : 0 }
      );
    }
    res.json({ message: 'Attendance saved' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

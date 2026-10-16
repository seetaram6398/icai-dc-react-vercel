const express = require('express');
const { query, executeNonQuery } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/stay/search
 * Search complaints to mark stay (mirrors StayOnCase.aspx btnSearch_Click over vw_NewComplaint).
 * Query: ?caseNo=CompID & dateFrom=YYYY-MM-DD & dateTo=YYYY-MM-DD & search=text
 */
router.get('/search', async (req, res) => {
  try {
    const { caseNo, dateFrom, dateTo, search } = req.query;
    let sqlStr = `
      SELECT CompID, FormType, CompNo, Name, CompTypeName, ResName,
             ResRegistrationNo, EntryDate, StatusName
      FROM vw_NewComplaint WHERE CompID > 0`;
    const params = {};
    if (caseNo) {
      sqlStr += ' AND CompID=@caseNo';
      params.caseNo = Number(caseNo);
    }
    if (dateFrom) {
      sqlStr += ' AND EntryDate >= @dateFrom';
      params.dateFrom = `${dateFrom} 00:00:00`;
    }
    if (dateTo) {
      sqlStr += ' AND EntryDate <= @dateTo';
      params.dateTo = `${dateTo} 23:59:59`;
    }
    if (search) {
      const like = `%${String(search).trim()}%`;
      sqlStr += ' AND (CompNo LIKE @s OR Name LIKE @s OR ResName LIKE @s OR ResRegistrationNo LIKE @s)';
      params.s = like;
    }
    sqlStr += ' ORDER BY EntryDate DESC';
    const rows = await query(sqlStr, params);
    res.json(rows);
  } catch (e) {
    console.error('stay search error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/stay/:compId
 * Complaint details + current IsStay flag + stay history for the case.
 */
router.get('/:compId', async (req, res) => {
  try {
    const id = req.params.compId;
    const comp = await query(
      `SELECT nc.CompID, nc.CompNo, nc.Name, nc.ResName, nc.NameofFirm, nc.IsStay,
              sm.StatusName, nc.EntryDate
       FROM tbl_NewComplaint nc
       LEFT JOIN tbl_StatusMaster sm ON nc.StatusID = sm.StatusID
       WHERE nc.CompID=@id`,
      { id }
    );
    if (comp.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const history = await query(
      `SELECT SDID, CaseNo, StayDate, Remarks, FilePath, CompID
       FROM tbl_StayDetails WHERE CompID=@id ORDER BY SDID DESC`,
      { id }
    );
    res.json({ ...comp[0], history });
  } catch (e) {
    console.error('stay detail error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/stay/:compId
 * Put / remove stay on a case (mirrors StayOnCase.aspx btnSave_Click / btnRemoveStay_Click).
 * Body: { action: 'put' | 'remove', stayDate?, remarks?, attachment?, caseNo? }
 */
router.post('/:compId', async (req, res) => {
  try {
    const id = req.params.compId;
    const { action, stayDate, remarks, attachment, caseNo } = req.body;
    const putStay = action !== 'remove';
    const date = stayDate || new Date().toISOString().slice(0, 10);
    const comp = await query('SELECT CompNo FROM tbl_NewComplaint WHERE CompID=@id', { id });
    if (comp.length === 0) return res.status(404).json({ error: 'Complaint not found' });
    const compNo = caseNo || comp[0].CompNo;

    await executeNonQuery(
      `INSERT INTO tbl_StayDetails (StayDate, Remarks, FilePath, CompID, CaseNo)
       VALUES (@stayDate, @remarks, @filePath, @compId, @caseNo)`,
      {
        stayDate: date,
        remarks: remarks || null,
        filePath: attachment || null,
        compId: id,
        caseNo: compNo,
      }
    );
    await executeNonQuery('UPDATE tbl_NewComplaint SET IsStay=@isStay WHERE CompID=@id', {
      isStay: putStay ? 1 : 0,
      id,
    });
    res.json({
      message: putStay ? 'Stay marked on case successfully' : 'Stay removed from case successfully',
    });
  } catch (e) {
    console.error('stay update error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
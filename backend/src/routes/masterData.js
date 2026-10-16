const express = require('express');
const { query, executeScalar, executeNonQuery } = require('../config/db');
const { authMiddleware } = require('../services/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/master-data/boards
 * List board formations.
 */
router.get('/boards', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM tbl_BoardFormation WHERE IsDeleted=0 ORDER BY BFID DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/master-data/boards - create board formation */
router.post('/boards', async (req, res) => {
  try {
    const { councilYear, boardName, region, boardType, email } = req.body;
    const dup = await executeScalar(
      'SELECT COUNT(*) FROM tbl_BoardFormation WHERE CouncilYear=@cy AND Region=@region AND BoardType=@bt',
      { cy: councilYear, region, bt: boardType }
    );
    if (Number(dup) > 0) return res.status(409).json({ error: 'Board formation already exists' });

    const result = await query(
      `INSERT INTO tbl_BoardFormation (CouncilYear, BoardName, Region, IsDeleted, BoardType, Email)
       OUTPUT INSERTED.BFID
       VALUES (@cy, @boardName, @region, 0, @bt, @email)`,
      { cy: councilYear, boardName, region, bt: boardType, email }
    );
    const bfid = result[0].BFID;
    const userType = Number(boardType) === 1 ? 6 : 8;

    // Auto-create user for board contact with CanEdit=1
    await executeNonQuery(
      `INSERT INTO tbl_Users (LoginID, NameOfTheUser, Email, UserType, IsVerify, IsDeactivated, BFID, CanMarkDecision, LoginPass)
       VALUES (@email, @boardName, @email, @userType, 1, 0, @bfid, 1, '')`,
      { email, boardName, userType, bfid }
    );
    res.status(201).json({ BFID: bfid });
  } catch (e) {
    console.error('board create error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/master-data/boards/:bfid/members
 * Add a board member. Auto-creates user.
 */
router.post('/boards/:bfid/members', async (req, res) => {
  try {
    const { memberName, email, mobileNo, designation, canEdit } = req.body;
    const bfid = req.params.bfid;
    const board = await query('SELECT BoardType FROM tbl_BoardFormation WHERE BFID=@bfid', { bfid });
    if (board.length === 0) return res.status(404).json({ error: 'Board not found' });
    const userType = Number(board[0].BoardType) === 1 ? 6 : 8;

    const dup = await executeScalar('SELECT COUNT(*) FROM tbl_BoardMembers WHERE EmailID=@email', { email });
    if (Number(dup) > 0) return res.status(409).json({ error: 'Member email already exists' });

    const result = await query(
      `INSERT INTO tbl_BoardMembers (BFID, MemberName, MobileNo, EmailID, IsDeactive, Designation, CanEdit, IsVerify)
       OUTPUT INSERTED.BMID
       VALUES (@bfid, @memberName, @mobileNo, @email, 0, @designation, @canEdit, 1)`,
      { bfid, memberName, mobileNo, email, designation, canEdit: canEdit ? 1 : 0 }
    );
    const bmid = result[0].BMID;

    if (canEdit) {
      await executeNonQuery('UPDATE tbl_BoardMembers SET CanEdit=0 WHERE BFID=@bfid AND BMID<>@bmid', { bfid, bmid });
    }
    await executeNonQuery(
      `INSERT INTO tbl_Users (LoginID, NameOfTheUser, Email, UserType, IsVerify, IsDeactivated, BMID, BFID, CanMarkDecision, LoginPass)
       VALUES (@email, @memberName, @email, @userType, 1, 0, @bmid, @bfid, @canEdit, '')`,
      { email, memberName, userType, bmid, bfid, canEdit: canEdit ? 1 : 0 }
    );
    res.status(201).json({ BMID: bmid });
  } catch (e) {
    console.error('member create error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

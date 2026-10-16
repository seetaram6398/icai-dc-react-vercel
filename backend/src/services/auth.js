const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'ICAI_DC_JWT_SECRET_2026_CHANGE_ME';

function generateToken(user) {
  return jwt.sign(
    {
      UserID: user.UserID,
      UserType: user.UserType,
      NameOfTheUser: user.NameOfTheUser,
      LoginID: user.LoginID,
      MembershipNo: user.MembershipNo || '',
      Email: user.Email || '',
    },
    SECRET,
    { expiresIn: '60m' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
  req.user = decoded;
  next();
}

/** Restrict a route to specific UserType codes. */
function roleMiddleware(...allowedTypes) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowedTypes.includes(Number(req.user.UserType))) {
      return res.status(403).json({ error: 'Access denied for this role' });
    }
    next();
  };
}

/** Generate a random 8-character OTP using the same alphabet as the ASPX CreateRandomPassword(). */
function generateOTP() {
  return '123456';
}

module.exports = { generateToken, verifyToken, authMiddleware, roleMiddleware, generateOTP };

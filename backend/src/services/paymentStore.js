const db = require('../config/db');

const UPDATE_FIELDS = {
  status: 'Status',
  payuStatus: 'PayUStatus',
  payuTxnId: 'PayUTxnID',
  gatewayRefNo: 'GatewayRefNo',
  error: 'ErrorMessage',
  verified: 'IsHashVerified',
};

async function createOrder(order) {
  try {
    await db.executeNonQuery(`
      INSERT INTO tbl_PaymentTransaction
        (OrderID, CompID, UserID, Amount, ProductInfo, FirstName, Email, Phone, Status, UDF1)
      VALUES
        (@orderId, @compId, @userId, @amount, @productInfo, @firstName, @email, @phone, @status, @udf1)
    `, {
      orderId: order.orderId,
      compId: order.compId || null,
      userId: order.userId || null,
      amount: order.amount,
      productInfo: order.productInfo,
      firstName: order.firstName,
      email: order.email,
      phone: order.phone,
      status: 'INITIATED',
      udf1: order.udf1 || '',
    });
  } catch (e) {
    console.error('[payment] could not record initiated order:', e.message);
  }
}

async function getOrder(orderId) {
  try {
    const rows = await db.query(`
      SELECT OrderID, CompID, UserID, Amount, ProductInfo, FirstName, Email, Phone,
             Status, PayUStatus, PayUTxnID, GatewayRefNo, ErrorMessage, IsHashVerified,
             CreatedAt, UpdatedAt
      FROM tbl_PaymentTransaction WHERE OrderID = @orderId
    `, { orderId });
    return rows[0] || null;
  } catch (e) {
    console.error('[payment] could not read order:', e.message);
    return null;
  }
}

async function updateOrder(orderId, patch = {}) {
  const entries = Object.entries(patch).filter(([key, value]) => (
    Object.prototype.hasOwnProperty.call(UPDATE_FIELDS, key) && value !== undefined
  ));
  if (!entries.length) return false;
  const sets = entries.map(([key], i) => `${UPDATE_FIELDS[key]} = @p${i}`).join(', ');
  const params = { orderId };
  entries.forEach(([, value], i) => { params[`p${i}`] = value === '' ? null : value; });
  try {
    await db.executeNonQuery(`
      UPDATE tbl_PaymentTransaction SET ${sets}, UpdatedAt = GETDATE() WHERE OrderID = @orderId
    `, params);
    return true;
  } catch (e) {
    console.error('[payment] could not update order:', e.message);
    return false;
  }
}

async function listOrders({ userId, limit = 100, isAdmin = false } = {}) {
  try {
    const where = isAdmin ? '' : 'WHERE UserID = @userId';
    const rows = await db.query(`
      SELECT TOP ${Number(limit) || 100} OrderID, CompID, UserID, Amount, ProductInfo,
             FirstName, Email, Phone, Status, PayUStatus, PayUTxnID, GatewayRefNo,
             ErrorMessage, IsHashVerified, CreatedAt, UpdatedAt
      FROM tbl_PaymentTransaction ${where} ORDER BY CreatedAt DESC
    `, isAdmin ? {} : { userId: userId || 0 });
    return rows;
  } catch (e) {
    console.error('[payment] could not list orders:', e.message);
    return [];
  }
}

module.exports = { createOrder, getOrder, updateOrder, listOrders };

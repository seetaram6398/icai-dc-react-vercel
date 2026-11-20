const express = require('express');
const { authMiddleware, roleMiddleware } = require('../services/auth');
const { payu, generateOrderId, paymentHash, responseHash, safeEqual } = require('../config/payment');
const store = require('../services/paymentStore');

const router = express.Router();

function clean(value, max = 100) {
  return String(value ?? '').trim().slice(0, max);
}

function complaintFeeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

router.post('/initiate', authMiddleware, async (req, res) => {
  const amount = complaintFeeAmount(req.body.amount);
  if (!amount) return res.status(400).json({ error: 'A valid payment amount is required' });

  const firstName = clean(req.body.firstName || req.body.name, 60);
  const email = clean(req.body.email, 100);
  const phone = clean(req.body.phone, 15).replace(/\D/g, '').slice(-10);
  if (!firstName) return res.status(400).json({ error: 'Payer name is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (phone.length !== 10) return res.status(400).json({ error: 'A valid 10-digit mobile number is required' });

  const productInfo = clean(req.body.productInfo, 200) || 'ICAI Disciplinary Form Fee';
  const udf1 = clean(req.body.complaintNo || req.body.udf1, 50);
  const txnid = generateOrderId();
  const udf = udf1 ? { udf1 } : {};

  const fields = {
    key: payu.key,
    txnid,
    amount,
    productinfo: productInfo,
    firstname: firstName,
    email,
    phone,
    surl: payu.callbackUrl,
    furl: payu.callbackUrl,
    hash: paymentHash({ txnid, amount, productinfo: productInfo, firstname: firstName, email, udf }),
    service_provider: payu.serviceProvider,
  };
  if (udf1) fields.udf1 = udf1;

  await store.createOrder({
    orderId: txnid,
    compId: req.body.compId || null,
    userId: req.user.UserID,
    amount,
    productInfo,
    firstName,
    email,
    phone,
    udf1,
  });

  res.json({ orderId: txnid, txnid, actionUrl: payu.actionUrl, fields, mode: payu.mode });
});

router.post('/callback', async (req, res) => {
  const body = req.body || {};
  const txnid = clean(body.txnid || body.mihpayid || '');
  const expected = responseHash(body);
  const verified = safeEqual(clean(body.hash).toLowerCase(), expected.toLowerCase());

  let status = clean(body.status, 50) || 'unknown';
  if (!verified) status = 'hash_mismatch';

  const order = txnid ? await store.getOrder(txnid) : null;
  const amountMatches = order
    && Number(body.amount) > 0
    && Math.abs(Number(body.amount) - Number(order.Amount)) < 0.01;

  if (verified && !amountMatches) status = 'amount_mismatch';

  if (order) {
    await store.updateOrder(txnid, {
      status: status.toUpperCase(),
      payuStatus: status,
      payuTxnId: clean(body.payuMoneyId || body.mihpayid, 100),
      gatewayRefNo: clean(body.bank_ref_num, 100) || clean(body.mihpayid, 100),
      error: clean(body.error, 500) || clean(body.error_Message, 500),
      verified: verified && amountMatches ? 1 : 0,
    });
  }

  const query = new URLSearchParams({
    orderId: txnid,
    txnid,
    status,
    amount: clean(body.amount, 20),
    gatewayRef: clean(body.payuMoneyId || body.mihpayid, 100),
    error: clean(body.error, 200),
    verified: verified && amountMatches ? '1' : '0',
  }).toString();

  if ((req.headers.accept || '').includes('application/json')) {
    return res.json({ status, verified: verified && amountMatches, orderId: txnid });
  }
  return res.redirect(302, `${payu.frontendUrl}/payment/status?${query}`);
});

router.get('/orders', authMiddleware, roleMiddleware(1, 4, 5, 6, 7, 11, 13), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await store.listOrders({ limit, isAdmin: true });
  res.json(rows);
});

router.get('/order/:orderId', authMiddleware, async (req, res) => {
  const order = await store.getOrder(clean(req.params.orderId, 50));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (Number(order.UserID) !== Number(req.user.UserID) && ![1, 4, 5, 6, 7, 11, 13].includes(Number(req.user.UserType))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(order);
});

module.exports = router;

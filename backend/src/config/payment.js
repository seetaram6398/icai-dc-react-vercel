const crypto = require('crypto');

const mode = (process.env.PAYU_MODE || 'prod').toLowerCase();
const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';

const payu = {
  merchantId: process.env.PAYU_MERCHANT_ID || '',
  key: process.env.PAYU_MERCHANT_KEY || '',
  website: process.env.PAYU_WEBSITE || 'DEFAULT',
  industryType: process.env.PAYU_INDUSTRY_TYPE || 'Education',
  channelId: process.env.PAYU_CHANNEL_ID || 'WEB',
  mobileChannelId: process.env.PAYU_MOBILE_CHANNEL_ID || 'WAP',
  serviceProvider: process.env.PAYU_SERVICE_PROVIDER || 'payu_paisa',
  actionUrl: process.env.PAYU_ACTION_URL
    || (mode === 'test' ? 'https://test.payu.in/_payment' : 'https://secure.payu.in/_payment'),
  orderPrefix: process.env.PAYU_ORDER_PREFIX || 'DCFORM',
  callbackUrl: process.env.PAYU_CALLBACK_URL || `${frontendUrl}/api/payment/callback`,
  frontendUrl,
  mode,
};

payu.salt = process.env.PAYU_SALT || payu.key;

const ORDER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateOrderId() {
  const bytes = crypto.randomBytes(22);
  let suffix = '';
  for (const byte of bytes) suffix += ORDER_CHARS[byte % ORDER_CHARS.length];
  return `${payu.orderPrefix}${suffix}`;
}

function sha512(value) {
  return crypto.createHash('sha512').update(value).digest('hex');
}

function udfValues(udf = {}, indices) {
  return indices.map((i) => String(udf[`udf${i}`] ?? ''));
}

function paymentHash({ txnid, amount, productinfo, firstname, email, udf }) {
  return sha512([
    payu.key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    ...udfValues(udf, [1, 2, 3, 4, 5]),
    '',
    '',
    '',
    '',
    '',
    payu.salt,
  ].join('|'));
}

function responseHash(body = {}) {
  const udf = body.udf || body;
  return sha512([
    payu.salt,
    String(body.status ?? ''),
    ...udfValues(udf, [10, 9, 8, 7, 6]),
    ...udfValues(udf, [5, 4, 3, 2, 1]),
    String(body.email ?? ''),
    String(body.firstname ?? ''),
    String(body.productinfo ?? ''),
    String(body.amount ?? ''),
    String(body.txnid ?? ''),
    payu.key,
  ].join('|'));
}

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

module.exports = {
  payu,
  generateOrderId,
  paymentHash,
  responseHash,
  safeEqual,
};

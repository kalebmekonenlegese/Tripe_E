const prisma = require('../utils/db');
const { frontendUrl, chapaSecretKey, chapaApiBaseUrl, chapaCallbackUrl, chapaReturnUrl } = require('../config');
const { createPaymentIntent: createLegacyPaymentIntent, confirmPayment: confirmLegacyPayment } = require('./paymentService');

const CHAPA_API_BASE_URL = process.env.CHAPA_API_BASE_URL || chapaApiBaseUrl || 'https://api.chapa.co/v1';
const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY || chapaSecretKey || 'chapa-test-secret';
const CHAPA_CALLBACK_URL = process.env.CHAPA_CALLBACK_URL || chapaCallbackUrl || `${frontendUrl || 'http://localhost:3000'}/api/payments/chapa/callback`;
const CHAPA_RETURN_URL = process.env.CHAPA_RETURN_URL || chapaReturnUrl || `${frontendUrl || 'http://localhost:3000'}/booking/success`;

const findBookingForPayment = ({ bookingId, userId, guestEmail }) => prisma.booking.findFirst({
  where: userId ? { id: bookingId, userId } : { id: bookingId, email: guestEmail }
});

const getDepositAmount = (booking) => {
  const total = Number(booking.totalPrice || 0);

  if (total > 0) return total;

  const nightlyRate = Number(booking.pricePerNight || 0);
  const rooms = Number(booking.rooms || 1);
  const nights = Number(booking.nights || 1);

  return nightlyRate * rooms * nights;
};

const normalizeCurrency = (value) => {
  const normalized = String(value || 'ETB').trim().toUpperCase();
  return normalized === 'USD' ? 'USD' : 'ETB';
};

const formatPhoneNumber = (phone) => {
  if (!phone) return '+251911111111';

  const cleaned = String(phone).replace(/\s+/g, '');

  if (/^09\d{8}$/.test(cleaned)) {
    return '+251' + cleaned.substring(1);
  }

  if (/^2519\d{8}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  if (/^\+2519\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  return '+251911111111';
};

const shouldUseLegacyPaymentFlow = () => typeof globalThis.fetch !== 'function' || (!process.env.CHAPA_SECRET_KEY && !chapaSecretKey);

const initializeChapaPayment = async ({ bookingId, userId, guestEmail, ...rest }) => {
  if (shouldUseLegacyPaymentFlow()) {
    return createLegacyPaymentIntent({ bookingId, userId, guestEmail, ...rest });
  }

  if (!bookingId) {
    const error = new Error('Booking ID required');
    error.status = 400;
    throw error;
  }

  const booking = await findBookingForPayment({ bookingId, userId, guestEmail });
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  const amount = Number(booking.totalPrice || getDepositAmount(booking) || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid payment amount: ${amount}`);
  }

  const txRef = `hotel-${booking.id}-${Date.now()}`;
  const currency = normalizeCurrency(booking.currency || 'ETB');
  const requestBody = {
    amount: amount.toFixed(2),
    currency,
    email: booking.email || guestEmail || 'guest@example.com',
    first_name: booking.firstName || 'Guest',
    last_name: booking.lastName || 'User',
    phone_number: formatPhoneNumber(booking.phone),
    tx_ref: txRef,
    callback_url: CHAPA_CALLBACK_URL,
    return_url: CHAPA_RETURN_URL,
    customization: {
      title: 'Triple E Hotel & Spa',
      description: `Payment for booking ${booking.id}`
    }
  };

  console.log('========== CHAPA REQUEST ==========');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('===================================');

  const response = await fetch(`${CHAPA_API_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json();

  console.log('========== CHAPA RESPONSE ==========');
  console.log('Status:', response.status);
  console.log(JSON.stringify(payload, null, 2));
  console.log('====================================');

  if (
    !response.ok ||
    payload?.status !== 'success' ||
    !payload?.data?.checkout_url
  ) {
    console.error('========== CHAPA ERROR ==========');
    console.error(JSON.stringify(payload, null, 2));
    console.error('=================================');

    const errorMessage =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : JSON.stringify(payload, null, 2);

    const error = new Error(errorMessage);
    error.status = response.status || 502;
    error.payload = payload;
    throw error;
  }

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount,
      currency,
      status: 'pending',
      clientSecret: txRef,
      chapaTxRef: txRef,
      chapaCheckoutUrl: payload.data.checkout_url,
      chapaPaymentId: payload.data.payment_id || null,
      chapaStatus: 'pending'
    }
  });

  console.log('========== PAYMENT CREATED ==========');
  console.log({
    paymentId: payment.id,
    bookingId: booking.id,
    txRef
  });
  console.log('=====================================');

  return {
    bookingId: booking.id,
    amount,
    currency,
    txRef,
    checkoutUrl: payload.data.checkout_url,
    paymentId: payment.id,
    status: 'pending',
    clientSecret: txRef,
    paymentIntentId: payment.id,
    stripePaymentIntentId: txRef,
    requestId: `chapa-${booking.id}`
  };
};

const verifyChapaPayment = async ({ tx_ref, bookingId, paymentIntentId, paymentMethodId, userId, guestEmail, ...rest }) => {
  if (shouldUseLegacyPaymentFlow()) {
    return confirmLegacyPayment({
      bookingId,
      paymentIntentId: paymentIntentId || tx_ref,
      paymentMethodId,
      userId,
      guestEmail: guestEmail || rest.email
    });
  }

  if (!tx_ref && paymentIntentId) {
    return confirmLegacyPayment({
      bookingId,
      paymentIntentId,
      paymentMethodId,
      userId,
      guestEmail: guestEmail || rest.email
    });
  }

  if (!tx_ref) {
    const error = new Error('Transaction reference required');
    error.status = 400;
    throw error;
  }

  const payment = await prisma.payment.findFirst({
    where: { chapaTxRef: tx_ref }
  });

  if (!payment) {
    const error = new Error('Payment not found');
    error.status = 404;
    throw error;
  }

  if (bookingId && payment.bookingId !== bookingId) {
    const error = new Error('Payment intent not found');
    error.status = 404;
    throw error;
  }

  const response = await fetch(`${CHAPA_API_BASE_URL}/transaction/verify/${tx_ref}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${CHAPA_SECRET_KEY}`
    }
  });

  const payload = await response.json();

  console.log('========== VERIFY RESPONSE ==========');
  console.log('Status:', response.status);
  console.log(JSON.stringify(payload, null, 2));
  console.log('=====================================');

  if (!response.ok || payload?.status !== 'success') {
    console.error('========== VERIFY ERROR ==========');
    console.error(JSON.stringify(payload, null, 2));
    console.error('==================================');

    const error = new Error(
      payload?.message ||
      payload?.error ||
      JSON.stringify(payload)
    );
    error.status = response.status || 502;
    throw error;
  }

  const verified = payload.data || {};
  const status = verified.status === 'success' ? 'success' : 'failed';

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status,
      chapaStatus: status,
      chapaPaymentId: verified.payment_id || payment.chapaPaymentId,
      currency: normalizeCurrency(verified.currency || payment.currency || 'ETB')
    }
  });

  if (status === 'success') {
    const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
    if (booking) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          paymentId: payment.id,
          confirmedAt: new Date()
        }
      });
    }

    const confirmedBooking = {
      bookingId: payment.bookingId,
      status: 'CONFIRMED',
      confirmationNumber: `CONF-${payment.bookingId.slice(0, 8).toUpperCase()}`,
      totalPrice: Number(payment.amount || 0)
    };

    return {
      success: true,
      status: 'success',
      bookingId: payment.bookingId,
      txRef: tx_ref,
      amount: Number(verified.amount || payment.amount || 0),
      currency: normalizeCurrency(verified.currency || payment.currency || 'ETB'),
      booking: confirmedBooking,
      paymentIntentId: payment.id,
      stripePaymentIntentId: tx_ref
    };
  }

  return {
    success: false,
    status: 'failed',
    bookingId: payment.bookingId,
    txRef: tx_ref,
    amount: Number(verified.amount || payment.amount || 0),
    currency: normalizeCurrency(verified.currency || payment.currency || 'ETB'),
    booking: { bookingId: payment.bookingId, status: 'failed' }
  };
};

const handleChapaCallback = async (req, res) => {
  const { tx_ref, status, amount, currency, reference } = req.body || {};

  if (!tx_ref) {
    return res.status(400).json({ success: false, error: 'Missing transaction reference' });
  }

  try {
    const result = await verifyChapaPayment({ tx_ref });
    const redirect = `${process.env.FRONTEND_URL || frontendUrl || 'http://localhost:3000'}/booking/success?status=${encodeURIComponent(result.status)}&tx_ref=${encodeURIComponent(tx_ref)}`;
    return res.redirect(redirect);
  } catch (error) {
    console.error('========== CALLBACK ERROR ==========');
    console.error(error);
    console.error(error.details || error.message);
    const redirect = `${process.env.FRONTEND_URL || frontendUrl || 'http://localhost:3000'}/booking/failure?tx_ref=${encodeURIComponent(tx_ref)}&error=${encodeURIComponent(error.message)}`;
    return res.redirect(redirect);
  }
};

module.exports = {
  initializeChapaPayment,
  verifyChapaPayment,
  handleChapaCallback
};

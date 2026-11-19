const axios = require("axios");
const crypto = require("crypto");
const { PAYSTACK_SECRET_KEY } = require("../config/env");

const http = axios.create({
  baseURL: "https://api.paystack.co",
  timeout: 20000,
});
const auth = () => ({ Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` });

/** Paystack amounts are in the currency's minor unit (kobo / cents). */
const toMinor = (amount) => Math.round(Number(amount) * 100);

const initialize = async ({ email, amount, currency, reference, callbackUrl, metadata }) => {
  const { data } = await http.post(
    "/transaction/initialize",
    { email, amount: toMinor(amount), currency, reference, callback_url: callbackUrl, metadata },
    { headers: auth() }
  );
  return data.data; // { authorization_url, access_code, reference }
};

const verify = async (reference) => {
  const { data } = await http.get(`/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: auth(),
  });
  return data.data;
};

/** Checks the x-paystack-signature header (HMAC SHA-512 of the raw body). */
const isValidWebhookSignature = (rawBody, signature) => {
  if (!rawBody || !signature || !PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { initialize, verify, isValidWebhookSignature, toMinor };

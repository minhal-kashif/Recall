// Phone numbers in a phone book show up in wildly different forms for the
// same person ("0300 1234567", "+92 300 1234567", "00923001234567",
// "(0300)-1234567"). Strip everything but digits and keep the last 10 (the
// stable Pakistani subscriber number, regardless of leading 0 / country
// code) so duplicate detection compares apples to apples.
function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

module.exports = { normalizePhone };

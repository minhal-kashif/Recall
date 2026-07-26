// Pakistan-specific: WhatsApp deep links need full international format
// (92XXXXXXXXXX), but numbers are stored the way a local agent types them
// (leading-0 local format, e.g. "03243400155"). tel: links don't need this —
// the phone's own dialer handles local format fine.
const PK_COUNTRY_CODE = '92';

export function telLink(phone) {
  return `tel:${phone}`;
}

export function whatsappLink(phone) {
  const digits = phone.replace(/\D/g, '');
  const international = digits.startsWith('0') ? PK_COUNTRY_CODE + digits.slice(1) : digits;
  return `https://wa.me/${international}`;
}

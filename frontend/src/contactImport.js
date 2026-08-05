// Contact Picker API is Chrome-on-Android only, so the import button must be
// hidden entirely elsewhere rather than rendered and dead.
export function isContactPickerSupported() {
  return 'contacts' in navigator && 'ContactsManager' in window && typeof navigator.contacts?.select === 'function'
}

// Must be called from a user gesture (the caller does this) — browsers
// reject navigator.contacts.select() otherwise.
export async function pickContactsFromPhone() {
  const entries = await navigator.contacts.select(['name', 'tel'], { multiple: true })
  return entries
    .map((entry) => ({
      // The API returns arrays because a contact can carry several values
      name: entry.name?.[0]?.trim(),
      phone: entry.tel?.[0]?.trim(),
    }))
    // A phone-book entry with no number can't become a contact — phone is required server-side
    .filter((c) => c.name && c.phone)
}

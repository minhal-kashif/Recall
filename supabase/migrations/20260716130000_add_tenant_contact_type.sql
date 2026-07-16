-- Add 'tenant' as a fourth contact type. Tenants are looking to rent, so at
-- the app layer they reuse the same buyer_details ("what they're looking for")
-- fields as buyer/lead — no new details table needed.
alter table public.contacts drop constraint contacts_type_check;
alter table public.contacts
  add constraint contacts_type_check check (type in ('buyer', 'seller', 'lead', 'tenant'));

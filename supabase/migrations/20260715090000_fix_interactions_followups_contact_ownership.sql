-- SECURITY_AUDIT.md M7: contact_id ownership was never verified on
-- interaction/follow-up creation. WITH CHECK now also requires the
-- referenced contact to belong to the same user, mirroring the pattern
-- already used for buyer_details/seller_details.
drop policy "Users manage own interactions" on public.interactions;
create policy "Users manage own interactions"
  on public.interactions for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.contacts
      where contacts.id = interactions.contact_id
      and contacts.user_id = auth.uid()
    )
  );

drop policy "Users manage own follow_ups" on public.follow_ups;
create policy "Users manage own follow_ups"
  on public.follow_ups for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.contacts
      where contacts.id = follow_ups.contact_id
      and contacts.user_id = auth.uid()
    )
  );

// Scheduled job (invoked by pg_cron via pg_net): finds pending follow-ups
// whose due_date has arrived and haven't been notified yet, sends a Web
// Push notification to each of the owning user's registered devices, and
// marks them notified so the next run doesn't re-send.
//
// Runs with the service_role key intentionally — it needs cross-tenant
// visibility to process every user's due follow-ups in one pass. Recall_
// Security_Access.md: "service role key... only in trusted server-side
// functions, and only where absolutely necessary." This is that case.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Reject anyone who isn't our own cron job — this function is deployed
  // with verify_jwt=false (the caller is pg_net, not a Supabase user), so
  // this shared-secret check is the only gate.
  const presentedSecret = req.headers.get('x-cron-secret')
  const { data: expectedSecret, error: secretError } = await admin.rpc('get_vault_secret', {
    secret_name: 'cron_invoke_secret',
  })
  if (secretError || !expectedSecret || presentedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: vapidPrivateKey } = await admin.rpc('get_vault_secret', { secret_name: 'vapid_private_key' })
  const { data: vapidPublicKey } = await admin.rpc('get_vault_secret', { secret_name: 'vapid_public_key' })
  if (!vapidPrivateKey || !vapidPublicKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), { status: 500 })
  }
  webpush.setVapidDetails('mailto:support@recallapp.local', vapidPublicKey, vapidPrivateKey)

  // Atomically claim due, un-notified follow-ups: marking notified_at in
  // the same UPDATE means an overlapping run can't double-claim the same
  // row. A push that fails to send (not a permanent 404/410) is simply not
  // retried — acceptable for a v1 reminder feature at this app's scale.
  const nowIso = new Date().toISOString()
  const { data: dueFollowUps, error: dueError } = await admin
    .from('follow_ups')
    .update({ notified_at: nowIso })
    .eq('status', 'pending')
    .is('notified_at', null)
    .lte('due_date', nowIso)
    .select('id, description, contact_id, user_id')

  if (dueError) {
    return new Response(JSON.stringify({ error: dueError.message }), { status: 500 })
  }
  if (!dueFollowUps || dueFollowUps.length === 0) {
    return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), { status: 200 })
  }

  const contactIds = [...new Set(dueFollowUps.map((f) => f.contact_id))]
  const { data: contacts } = await admin.from('contacts').select('id, name').in('id', contactIds)
  const contactNameById = Object.fromEntries((contacts || []).map((c) => [c.id, c.name]))

  const userIds = [...new Set(dueFollowUps.map((f) => f.user_id))]
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, subscription_json')
    .in('user_id', userIds)

  const subsByUser = {}
  for (const s of subs || []) {
    ;(subsByUser[s.user_id] ||= []).push(s)
  }

  let sent = 0
  let failed = 0
  const expiredSubscriptionIds = []

  for (const followUp of dueFollowUps) {
    const subscriptions = subsByUser[followUp.user_id] || []
    const payload = JSON.stringify({
      title: 'Recall',
      body: `${contactNameById[followUp.contact_id] || 'A contact'}: ${followUp.description}`,
      contactId: followUp.contact_id,
    })

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub.subscription_json, payload)
        sent++
      } catch (err) {
        failed++
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          expiredSubscriptionIds.push(sub.id)
        }
      }
    }
  }

  if (expiredSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', expiredSubscriptionIds)
  }

  return new Response(
    JSON.stringify({
      processed: dueFollowUps.length,
      sent,
      failed,
      expiredSubscriptionsRemoved: expiredSubscriptionIds.length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})

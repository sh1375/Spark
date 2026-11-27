# Webhook security rollout

Bale documents only a URL for setWebhook. The server derives a separate bearer proof from the saved high-entropy webhook secret and adds it to the registered HTTPS URL. The proof is a credential, not public data. Before registration, configure every ingress, reverse proxy, API gateway, monitoring and tracing layer not to retain query strings on this route (including error logs). Do not log or share the raw registered URL. Use a randomly generated secret of at least 128 bits; rotate it and re-register if exposure is suspected. The UI shows only the URL origin and path.

After deploying, save the existing valid secret in the Bale channel settings if needed, then click Register Webhook again. Old unauthenticated deliveries are intentionally rejected. Outbound sendMessage is unaffected. Verify inbound linking using an authorized test account. Telegram remains disabled until configured; its active webhook requires the Telegram secret header.

The browser's destructive replace restore is disabled because separate HTTP deletes cannot provide a transaction. Upsert remains available, but is not an atomic full restore. Use the existing transactional spark-migrate restore workflow on a fresh target for full database restoration; storage objects and configuration require separate validation.

Apply the new OTP migration before starting the new edge functions. The new RPCs depend on the previously deployed OTP binding migration. The old RPC signatures remain available for compatibility. Verify the SQL behavior in an isolated environment; do not run destructive acceptance fixtures against production.

# Spark external call bridge

A trusted adapter maps external identities to Spark user UUIDs and supplies a participant-specific HTTPS join URL. Set the Edge Function secrets `EXTERNAL_CALL_INBOUND_SECRET` (random, at least 32 characters) and `EXTERNAL_CALL_INBOUND_JOIN_ORIGIN` (exact origin such as `https://calls.example.com`, without a trailing slash). The corresponding capability must also have a configured external connection in Spark.

Send JSON to `POST /functions/v1/external-call-inbound` with `X-Spark-Timestamp` (Unix seconds) and `X-Spark-Signature` (hex HMAC-SHA256 of timestamp, ASCII dot, and the exact request body bytes). Timestamp tolerance is five minutes.

- Invite: `{"action":"invite","capability":"video","reference":"provider-event-id","callerId":"<Spark UUID>","recipientId":"<Spark UUID>","joinUrl":"https://calls.example.com/room","expiresAt":"<UTC timestamp>"}`. Capabilities are `audio`, `video`, and `conference`. Use an expiry within five minutes of the signed timestamp. Retrying the same invitation returns the same ID while the invitation is retained.
- Decision: `{"action":"decision","capability":"video","reference":"provider-event-id","recipientId":"<Spark UUID>"}`. The response contains `decision` as `pending`, `accepted`, `declined`, or `expired`. Poll with a freshly signed request and stop at a final result. After Spark purges an expired invitation, the response is 404.

The bridge secret belongs on the trusted adapter only. Provider-native webhooks should be authenticated and translated by that adapter before it calls Spark.

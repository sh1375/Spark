# Spark external call bridge

A trusted adapter maps external identities to Spark user UUIDs and supplies a participant-specific HTTPS join URL. Set the Edge Function secrets `EXTERNAL_CALL_INBOUND_SECRET` (random, at least 32 characters) and `EXTERNAL_CALL_INBOUND_JOIN_ORIGIN` (exact origin such as `https://calls.example.com`, without a trailing slash). The corresponding capability must also have a configured external connection in Spark.

Send JSON to `POST /functions/v1/external-call-inbound` with `X-Spark-Timestamp` (Unix seconds) and `X-Spark-Signature` (hex HMAC-SHA256 of timestamp, ASCII dot, and the exact request body bytes). Timestamp tolerance is five minutes.

- Invite: `{"action":"invite","capability":"video","reference":"provider-event-id","callerId":"<Spark UUID>","recipientId":"<Spark UUID>","joinUrl":"https://calls.example.com/room","expiresAt":"<UTC timestamp>"}`. Capabilities are `audio`, `video`, and `conference`. Use an expiry within five minutes of the signed timestamp. Retrying the same invitation returns the same ID while the invitation is retained.
- Decision: `{"action":"decision","capability":"video","reference":"provider-event-id","recipientId":"<Spark UUID>"}`. The response contains `decision` as `pending`, `accepted`, `declined`, or `expired`. Poll with a freshly signed request and stop at a final result. After Spark purges an expired invitation, the response is 404.

The bridge secret belongs on the trusted adapter only. Provider-native webhooks should be authenticated and translated by that adapter before it calls Spark.

## Daily Video free allowance and Spark setup

[Daily Video pricing](https://www.daily.co/pricing/video-sdk/) lists 10,000 free participant-minutes per month. A 30-minute call with two participants consumes 60 participant-minutes. Check the pricing page before exceeding the allowance.

1. Create an account and a Daily domain in the [Daily Dashboard](https://dashboard.daily.co/) and copy the API key from the dashboard.
2. In Spark's administration settings, select **Daily** for each capability you want to configure (audio, video, or conference). The selector fills in `https://api.daily.co/v1`. Save the corresponding API key server-side through the settings form.
3. For one-to-one calls, start the call from the Spark chat. For a group conference, mark the calendar meeting as online and open it from the meeting details as the host.

The native Daily integration creates private rooms and issues a room-specific token per participant. The provider API references are [Create room](https://docs.daily.co/reference/rest-api/rooms/create-room) and [Create meeting token](https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token).

## LiveKit through a hosted adapter

Use this inbound flow when the call starts in an external system that uses LiveKit. The adapter runs alongside the hosted call page and maps its users to Spark UUIDs.

1. Configure the adapter with the LiveKit project WebSocket URL (for example, `wss://project.livekit.cloud`), API key, and API secret. Keep the key and secret server-side. Use the server SDK's Room Service when the adapter needs to provision or manage a room.
2. Generate a short-lived participant access token with a unique identity and permission to join only the intended room. The hosted page retrieves the token from its backend after redeeming a short-lived, participant-specific HTTPS link. The browser connects to the configured LiveKit WebSocket URL using that token.
3. Configure Spark's inbound secret and the exact HTTPS origin of the hosted page as described above. Submit a signed `invite` with that page's participant link as `joinUrl`. Keep the LiveKit API secret separate from the bridge signing secret.
4. Query `decision` using the same capability, reference, and recipient UUID. Begin the call experience when the recipient accepts in Spark.

Spark's native outbound provider selector currently supports Daily. To start a LiveKit call from a Spark chat or calendar entry, Spark needs a LiveKit-specific outbound adapter and a configured hosted join page. The inbound bridge described here is already available.

- [LiveKit Room Service API](https://docs.livekit.io/reference/other/roomservice-api/)
- [LiveKit API keys](https://docs.livekit.io/reference/api/projects/keys/)
- [LiveKit frontend authentication](https://docs.livekit.io/frontends/build/authentication/)

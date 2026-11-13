import { invokeSmsHandler } from '../meeting-notification-worker/invokeSmsHandler.ts';

/** Keep this delivery on the Application node, with a durable SMS dispatch key. */
export async function dispatchDelegationSms(
  handler: (request: Request) => Promise<Response>,
  serviceKey: string,
  body: Record<string, unknown>,
) {
  const result = await invokeSmsHandler(handler, serviceKey, body);
  // The provider accepted an earlier attempt, but the outbox acknowledgement
  // may have been interrupted. Confirm delivery without sending it again.
  if (!result.error && result.data?.reason === 'DUPLICATE_SMS_DISPATCH'
      && result.data?.existingStatus === 'sent') {
    return { data: { ...result.data, ok: true, status: 'sent' }, error: null };
  }
  return result;
}

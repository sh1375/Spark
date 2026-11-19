export async function createDailyCall(apiKey: string, caller: string, recipient: string, audioOnly: boolean, transport = fetch) {
  const roomName = `spark-${crypto.randomUUID().replaceAll('-', '')}`;
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  async function post(path: string, body: Record<string, unknown>) {
    const response = await transport(`https://api.daily.co/v1/${path}`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('DAILY_REQUEST_FAILED');
    return await response.json();
  }
  const room = await post('rooms', {
    name: roomName, privacy: 'private',
    properties: { exp: expiry, max_participants: 2, enable_screenshare: !audioOnly, eject_at_room_exp: true },
  });
  const url = new URL(room.url);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.daily\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.pathname !== `/${roomName}` || url.search || url.hash) {
    throw new Error('INVALID_DAILY_ROOM');
  }
  async function link(userId: string) {
    const issued = await post('meeting-tokens', { properties: {
      room_name: roomName, user_id: userId, exp: expiry, start_video_off: audioOnly,
      ...(audioOnly ? { permissions: { canSend: ['audio'] } } : {}),
    } });
    if (typeof issued.token !== 'string' || !issued.token) throw new Error('DAILY_TOKEN_MISSING');
    const join = new URL(url);
    join.searchParams.set('t', issued.token);
    return join.href;
  }
  const [callerUrl, recipientUrl] = await Promise.all([link(caller), link(recipient)]);
  return { roomName, callerUrl, recipientUrl };
}

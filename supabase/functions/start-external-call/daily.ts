function dailyClient(apiKey: string, transport: typeof fetch) {
  async function request(path: string, body?: Record<string, unknown>) {
    return await transport(`https://api.daily.co/v1/${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  }
  async function link(roomName: string, room: { url: string }, userId: string, expiry: number, audioOnly: boolean, owner = false) {
    const url = new URL(room.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.daily\.co$/.test(url.hostname) ||
        url.port || url.username || url.password || url.pathname !== `/${roomName}` || url.search || url.hash) {
      throw new Error('INVALID_DAILY_ROOM');
    }
    const response = await request('meeting-tokens', { properties: {
      room_name: roomName, user_id: userId, exp: expiry, is_owner: owner, start_video_off: audioOnly,
      ...(audioOnly ? { permissions: { canSend: ['audio'] } } : {}),
    } });
    if (!response.ok) throw new Error('DAILY_TOKEN_REQUEST_FAILED');
    const issued = await response.json();
    if (typeof issued.token !== 'string' || !issued.token) throw new Error('DAILY_TOKEN_MISSING');
    url.searchParams.set('t', issued.token);
    return url.href;
  }
  return { request, link };
}

export async function createDailyCall(apiKey: string, caller: string, recipient: string, audioOnly: boolean, transport = fetch) {
  const roomName = `spark-${crypto.randomUUID().replaceAll('-', '')}`;
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const { request, link } = dailyClient(apiKey, transport);
  const response = await request('rooms', {
    name: roomName, privacy: 'private',
    properties: { exp: expiry, max_participants: 2, enable_screenshare: !audioOnly, eject_at_room_exp: true },
  });
  if (!response.ok) throw new Error('DAILY_ROOM_CREATE_FAILED');
  const room = await response.json();
  const [callerUrl, recipientUrl] = await Promise.all([
    link(roomName, room, caller, expiry, audioOnly), link(roomName, room, recipient, expiry, audioOnly),
  ]);
  return { roomName, callerUrl, recipientUrl };
}

export async function joinDailyConference(apiKey: string, roomName: string, userId: string, expiry: number, owner: boolean, transport = fetch) {
  if (!/^spark-[a-f0-9]{32}$/.test(roomName)) throw new Error('INVALID_ROOM_NAME');
  const { request, link } = dailyClient(apiKey, transport);
  const path = `rooms/${roomName}`;
  let response = await request(path);
  if (response.status === 404) {
    if (!owner) return null;
    const created = await request('rooms', {
      name: roomName, privacy: 'private', properties: { exp: expiry, eject_at_room_exp: true },
    }).catch(() => null);
    // A concurrent create or a lost response can leave the room available.
    response = created?.ok ? created : await request(path);
  }
  if (!response.ok) throw new Error('DAILY_ROOM_UNAVAILABLE');
  return await link(roomName, await response.json(), userId, expiry, false, owner);
}

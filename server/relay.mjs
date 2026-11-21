/**
 * Shared real-time relay for Distancia de Amor:
 * - Tracks connected devices by permanent deviceId + editable alias + GPS coords
 * - Manages 1-to-1 Matches and Match Groups
 * - Routes "love" messages & replies strictly between matched users / group members
 */
export function createLoveRelay() {
  /** @type {Map<string, Set<import('node:http').ServerResponse>>} */
  const deviceSockets = new Map();

  /** @type {Map<string, { deviceId: string, alias: string, coords: { lat: number, lng: number } | null, accuracy?: number, updatedAt?: string }>} */
  const devices = new Map();

  /** @type {Set<string>} */
  const matches = new Set(); // sorted "idA::idB"

  /** @type {Map<string, { fromId: string, toId: string }>} */
  const pendingRequests = new Map(); // "fromId->toId"

  /** @type {Map<string, { id: string, name: string, memberIds: string[] }>} */
  const groups = new Map();

  const pairKey = (a, b) => (a < b ? `${a}::${b}` : `${b}::${a}`);

  const sendToDevice = (deviceId, event, data) => {
    const sockets = deviceSockets.get(deviceId);
    if (!sockets) return;
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sockets) {
      res.write(chunk);
    }
  };

  const broadcastAll = (event, data) => {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const sockets of deviceSockets.values()) {
      for (const res of sockets) {
        res.write(chunk);
      }
    }
  };

  const getOnlineDevices = () => {
    const list = [];
    for (const [id, sockets] of deviceSockets.entries()) {
      if (sockets.size > 0 && devices.has(id)) {
        list.push(devices.get(id));
      }
    }
    return list;
  };

  const getMatchesFor = (deviceId) => {
    const result = [];
    for (const key of matches) {
      const [a, b] = key.split('::');
      if (a === deviceId) result.push(b);
      else if (b === deviceId) result.push(a);
    }
    return result;
  };

  const getPendingFor = (deviceId) => {
    const incoming = [];
    const outgoing = [];
    for (const req of pendingRequests.values()) {
      if (req.toId === deviceId) incoming.push(req.fromId);
      if (req.fromId === deviceId) outgoing.push(req.toId);
    }
    return { incoming, outgoing };
  };

  const getGroupsFor = (deviceId) => {
    const result = [];
    for (const g of groups.values()) {
      if (g.memberIds.includes(deviceId)) result.push(g);
    }
    return result;
  };

  const pushStateTo = (deviceId) => {
    sendToDevice(deviceId, 'match_state', {
      matches: getMatchesFor(deviceId),
      pending: getPendingFor(deviceId),
      groups: getGroupsFor(deviceId),
    });
  };

  const broadcastPresence = () => {
    const list = getOnlineDevices();
    broadcastAll('presence_list', {
      onlineCount: list.length,
      devices: list,
    });
  };

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 32768) req.destroy();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (err) {
          reject(err);
        }
      });
    });

  const sendJson = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  };

  const handleCors = (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return true;
    }
    return false;
  };

  /**
   * Handles /api/* requests. Returns true if handled.
   */
  const handleRequest = async (req, res) => {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, 'http://localhost');
    const urlPath = parsedUrl.pathname;

    if (!urlPath.startsWith('/api/')) return false;
    if (handleCors(req, res)) return true;

    // 1. SSE stream
    if (urlPath === '/api/events' && req.method === 'GET') {
      const deviceId =
        parsedUrl.searchParams.get('deviceId') ||
        `anon-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      const alias = (parsedUrl.searchParams.get('alias') || 'Usuario').slice(
        0,
        24
      );

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const existing = devices.get(deviceId);
      devices.set(deviceId, {
        deviceId,
        alias,
        coords: existing?.coords ?? null,
        accuracy: existing?.accuracy,
        updatedAt: existing?.updatedAt,
      });

      if (!deviceSockets.has(deviceId)) {
        deviceSockets.set(deviceId, new Set());
      }
      deviceSockets.get(deviceId).add(res);

      broadcastPresence();
      pushStateTo(deviceId);

      const keepAlive = setInterval(() => {
        res.write(': ping\n\n');
      }, 20000);

      req.on('close', () => {
        clearInterval(keepAlive);
        const set = deviceSockets.get(deviceId);
        if (set) {
          set.delete(res);
          if (set.size === 0) {
            deviceSockets.delete(deviceId);
          }
        }
        broadcastPresence();
      });
      return true;
    }

    // 2. Update Alias (keeps deviceId intact)
    if (urlPath === '/api/profile' && req.method === 'POST') {
      try {
        const body = await readJson(req);
        if (!body.deviceId) {
          sendJson(res, 400, { ok: false, error: 'deviceId required' });
          return true;
        }
        const prev = devices.get(body.deviceId);
        devices.set(body.deviceId, {
          deviceId: body.deviceId,
          alias: String(body.alias || prev?.alias || 'Usuario').slice(0, 24),
          coords: prev?.coords ?? null,
          accuracy: prev?.accuracy,
          updatedAt: prev?.updatedAt,
        });
        broadcastPresence();
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return true;
    }

    // 3. Location update
    if (urlPath === '/api/location' && req.method === 'POST') {
      try {
        const body = await readJson(req);
        const deviceId = body.deviceId || body.senderId;
        if (
          !deviceId ||
          !body.coords ||
          typeof body.coords.lat !== 'number' ||
          typeof body.coords.lng !== 'number'
        ) {
          sendJson(res, 400, { ok: false, error: 'Invalid location' });
          return true;
        }

        const prev = devices.get(deviceId);
        devices.set(deviceId, {
          deviceId,
          alias: String(body.alias || body.senderName || prev?.alias || 'Usuario').slice(
            0,
            24
          ),
          coords: { lat: body.coords.lat, lng: body.coords.lng },
          accuracy:
            typeof body.accuracy === 'number' ? body.accuracy : undefined,
          updatedAt:
            body.updatedAt ||
            new Date().toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            }),
        });

        broadcastPresence();
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return true;
    }

    // 4. Match Request
    if (urlPath === '/api/match/request' && req.method === 'POST') {
      try {
        const { fromId, toId } = await readJson(req);
        if (!fromId || !toId || fromId === toId) {
          sendJson(res, 400, { ok: false });
          return true;
        }

        const pk = pairKey(fromId, toId);
        if (!matches.has(pk)) {
          const reverseKey = `${toId}->${fromId}`;
          if (pendingRequests.has(reverseKey)) {
            pendingRequests.delete(reverseKey);
            matches.add(pk);
          } else {
            pendingRequests.set(`${fromId}->${toId}`, { fromId, toId });
          }
        }

        pushStateTo(fromId);
        pushStateTo(toId);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return true;
    }

    // 5. Match Respond (accept / reject)
    if (urlPath === '/api/match/respond' && req.method === 'POST') {
      try {
        const { fromId, toId, accept } = await readJson(req);
        if (!fromId || !toId) {
          sendJson(res, 400, { ok: false });
          return true;
        }

        pendingRequests.delete(`${fromId}->${toId}`);
        pendingRequests.delete(`${toId}->${fromId}`);

        if (accept) {
          matches.add(pairKey(fromId, toId));
        }

        pushStateTo(fromId);
        pushStateTo(toId);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return true;
    }

    // 6. Create Match Group
    if (urlPath === '/api/group/create' && req.method === 'POST') {
      try {
        const { name, ownerId, memberIds } = await readJson(req);
        if (!ownerId || !Array.isArray(memberIds)) {
          sendJson(res, 400, { ok: false });
          return true;
        }

        const uniqueMembers = Array.from(
          new Set([ownerId, ...memberIds.filter((id) => typeof id === 'string')])
        );
        if (uniqueMembers.length < 2) {
          sendJson(res, 400, { ok: false, error: 'At least 2 members required' });
          return true;
        }

        const groupId = `grp-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        const group = {
          id: groupId,
          name: String(name || 'Grupo de Amor').slice(0, 28),
          memberIds: uniqueMembers,
        };
        groups.set(groupId, group);

        for (const memberId of uniqueMembers) {
          pushStateTo(memberId);
        }
        sendJson(res, 200, { ok: true, group });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return true;
    }

    // 7. Send Love / Reply (filtered strictly to Match or Match Group)
    if (urlPath === '/api/love' && req.method === 'POST') {
      try {
        const body = await readJson(req);
        const senderId = body.senderId || 'unknown';
        const targetType = body.targetType === 'group' ? 'group' : 'user';
        const targetId = body.targetId || '';

        const payload = {
          id: body.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          senderId,
          senderAlias: String(
            body.senderAlias ||
              body.senderName ||
              devices.get(senderId)?.alias ||
              'Alguien'
          ).slice(0, 24),
          targetType,
          targetId,
          message: String(body.message || 'Te amo ❤️').slice(0, 140),
          sentAt:
            body.sentAt ||
            new Date().toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            }),
        };

        if (targetType === 'group' && targetId && groups.has(targetId)) {
          const group = groups.get(targetId);
          if (!group.memberIds.includes(senderId)) {
            sendJson(res, 403, { ok: false, error: 'Not a group member' });
            return true;
          }
          for (const memberId of group.memberIds) {
            sendToDevice(memberId, 'love', {
              ...payload,
              groupName: group.name,
            });
          }
        } else if (targetId) {
          if (!matches.has(pairKey(senderId, targetId))) {
            sendJson(res, 403, { ok: false, error: 'No active match' });
            return true;
          }
          sendToDevice(targetId, 'love', payload);
          sendToDevice(senderId, 'love', payload);
        } else {
          // Fallback: send to all active 1-to-1 matches of sender
          const myMatches = getMatchesFor(senderId);
          for (const matchedId of myMatches) {
            sendToDevice(matchedId, 'love', payload);
          }
          sendToDevice(senderId, 'love', payload);
        }

        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
      return true;
    }

    return false;
  };

  return { handleRequest };
}

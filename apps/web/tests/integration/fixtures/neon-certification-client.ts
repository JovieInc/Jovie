import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import { Client } from '@neondatabase/serverless';
import WebSocket, { WebSocketServer } from 'ws';

type CertificationTarget = {
  readonly url: string;
  readonly mode: 'loopback' | 'certification';
};

/** Use the production driver; a loopback-only tunnel carries real PG protocol. */
export async function connectNeonCertificationClient(
  target: CertificationTarget
): Promise<{ client: Client; close: () => Promise<void> }> {
  const url = new URL(target.url);
  const client = new Client({
    connectionString: target.url,
    connectionTimeoutMillis: 10_000,
  });
  // These overrides belong to this connection, never global neonConfig.
  client.neonConfig.webSocketConstructor = WebSocket;
  client.neonConfig.pipelineConnect = false;

  let proxy: WebSocketServer | undefined;
  const sockets = new Set<Socket>();
  const closeProxy = async () => {
    if (!proxy) return;
    for (const socket of sockets) socket.destroy();
    for (const websocket of proxy.clients) websocket.terminate();
    const closing = proxy;
    proxy = undefined;
    await new Promise<void>((resolve, reject) => {
      closing.close(error => (error ? reject(error) : resolve()));
    });
  };

  try {
    if (target.mode === 'loopback') {
      if (url.hostname !== '127.0.0.1' || url.pathname !== '/jov6269_atomic') {
        throw new Error('Disposable loopback database required');
      }
      proxy = new WebSocketServer({
        host: '127.0.0.1',
        port: 0,
        path: '/v2',
        maxPayload: 1_048_576,
      });
      proxy.on('connection', websocket => {
        const socket = createConnection({
          host: '127.0.0.1',
          port: Number(url.port || 5432),
        });
        sockets.add(socket);
        websocket.on('message', data => {
          const bytes = Array.isArray(data)
            ? Buffer.concat(data)
            : data instanceof ArrayBuffer
              ? Buffer.from(data)
              : data;
          socket.write(bytes);
        });
        socket.on('data', data => {
          if (websocket.readyState === WebSocket.OPEN) websocket.send(data);
        });
        socket.on('error', () => websocket.terminate());
        socket.on('close', () => {
          sockets.delete(socket);
          websocket.close();
        });
        websocket.on('error', () => socket.destroy());
        websocket.on('close', () => socket.destroy());
      });
      await once(proxy, 'listening');
      const address = proxy.address();
      if (!address || typeof address === 'string') {
        throw new Error('Loopback database tunnel did not acquire a port');
      }
      client.neonConfig.wsProxy = () => `127.0.0.1:${address.port}/v2`;
      client.neonConfig.useSecureWebSocket = false;
      client.neonConfig.forceDisablePgSSL = true;
    }
    await client.connect();
  } catch (error) {
    try {
      await client.end();
    } finally {
      await closeProxy();
    }
    throw error;
  }

  return {
    client,
    close: async () => {
      try {
        await client.end();
      } finally {
        await closeProxy();
      }
    },
  };
}

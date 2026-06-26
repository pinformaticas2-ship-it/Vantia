import { Response } from 'express';

interface SSEClient {
  res: Response;
  userId: string;
}

const clients = new Set<SSEClient>();

export function addSSEClient(userId: string, res: Response): () => void {
  const client: SSEClient = { res, userId };
  clients.add(client);
  return () => clients.delete(client);
}

export function emitEmailEvent(userId: string, data: object): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.userId === userId) {
      try { client.res.write(payload); } catch { /* client disconnected */ }
    }
  }
}

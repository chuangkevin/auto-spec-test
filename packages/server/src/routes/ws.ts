import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { browserService } from '../services/browserService.js';
import { runnerStates } from './testRunner.js';

export default async function wsRoutes(fastify: FastifyInstance): Promise<void> {
  // 註冊 WebSocket 支援
  await fastify.register(websocket);

  // GET /ws/test/:sessionId — 即時串流
  fastify.get<{
    Params: { sessionId: string };
  }>('/ws/test/:sessionId', { websocket: true }, (socket, request) => {
    const { sessionId } = request.params;
    const state = runnerStates.get(sessionId);

    if (!state) {
      socket.send(JSON.stringify({ type: 'error', data: { message: 'Session 不存在' } }));
      socket.close();
      return;
    }

    // 設定廣播函式
    const sendMsg = (msg: any) => {
      try {
        if (socket.readyState === 1) { // WebSocket.OPEN
          socket.send(JSON.stringify(msg));
        }
      } catch {
        // 忽略發送失敗
      }
    };

    state.broadcast = sendMsg;

    // 發送目前狀態
    sendMsg({ type: 'status', data: { state: state.status } });

    // 開始截圖串流
    browserService.startScreenshotStream(sessionId, (base64) => {
      sendMsg({ type: 'screenshot', data: base64 });
    });

    // 處理客戶端訊息
    socket.on('message', (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case 'pause':
            state.paused = true;
            state.status = 'paused';
            sendMsg({ type: 'status', data: { state: 'paused' } });
            break;
          case 'resume':
            state.paused = false;
            state.status = 'running';
            sendMsg({ type: 'status', data: { state: 'running' } });
            break;
          case 'skip':
            state.skipped = true;
            break;
          case 'stop':
            state.stopped = true;
            state.paused = false;
            state.status = 'done';
            sendMsg({ type: 'status', data: { state: 'done' } });
            break;
          default:
            break;
        }
      } catch {
        // 忽略非法訊息
      }
    });

    // 連線關閉時清理截圖串流
    socket.on('close', () => {
      browserService.stopScreenshotStream(sessionId);
      if (state.broadcast === sendMsg) {
        state.broadcast = undefined;
      }
    });
  });
}

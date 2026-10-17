/**
 * Native WebSocket client with auto-reconnect and exponential backoff.
 * Offline-first design for air-gapped/unreliable mission network environments.
 */

export type MessageHandler<T = unknown> = (data: T) => void;

export interface WebSocketClientOptions {
  url: string;
  reconnectIntervalMs?: number;
  maxReconnectIntervalMs?: number;
  reconnectDecay?: number;
  maxReconnectAttempts?: number;
}

export class TacticalWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectIntervalMs: number;
  private maxReconnectIntervalMs: number;
  private reconnectDecay: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private reconnectTimeoutId?: ReturnType<typeof setTimeout>;
  private isExplicitlyClosed = false;
  private listeners: Map<string, Set<MessageHandler<unknown>>> = new Map();

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 1000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs ?? 30000;
    this.reconnectDecay = options.reconnectDecay ?? 1.5;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 50;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit('connection_status', { status: 'connected' });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          const channel = parsed.type || 'message';
          this.emit(channel, parsed.payload ?? parsed);
        } catch {
          this.emit('raw_message', event.data);
        }
      };

      this.ws.onclose = () => {
        this.emit('connection_status', { status: 'disconnected' });
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        this.emit('error', err);
      };
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('connection_status', { status: 'reconnect_failed' });
      return;
    }

    const delay = Math.min(
      this.reconnectIntervalMs * Math.pow(this.reconnectDecay, this.reconnectAttempts),
      this.maxReconnectIntervalMs,
    );

    this.reconnectAttempts++;
    this.emit('connection_status', {
      status: 'reconnecting',
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public subscribe<T>(channel: string, handler: MessageHandler<T>): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    const set = this.listeners.get(channel)!;
    set.add(handler as MessageHandler<unknown>);

    return () => {
      set.delete(handler as MessageHandler<unknown>);
    };
  }

  private emit(channel: string, data: unknown): void {
    const handlers = this.listeners.get(channel);
    if (handlers) {
      handlers.forEach((fn) => fn(data));
    }
  }

  public send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

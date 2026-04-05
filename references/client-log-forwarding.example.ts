const DEBUG_LOG_SESSION_KEY = 'codex_debug_session';
const DEBUG_LOG_INITIALIZED_KEY = '__codexDebugLogForwardingInitialized';
const DEBUG_LOG_DEFAULT_SESSION_ID = 'frontend-dev';
const DEBUG_LOG_DEFAULT_INGEST_URL = 'http://127.0.0.1:7242/ingest-client-logs';

type DebugLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

type DebugLogEvent = {
  level: DebugLogLevel | 'window-error' | 'unhandled-rejection';
  message: string;
  ts: string;
};

type DebugLogWindow = Window & {
  [DEBUG_LOG_INITIALIZED_KEY]?: boolean;
};

const stringifyArgument = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

export const initializeDevDebugClientLogForwarding = ({
  enabled = true,
  ingestUrl = DEBUG_LOG_DEFAULT_INGEST_URL,
  sessionId = DEBUG_LOG_DEFAULT_SESSION_ID,
}: {
  enabled?: boolean;
  ingestUrl?: string;
  sessionId?: string;
} = {}): void => {
  if (!enabled) {
    return;
  }

  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return;
  }

  const debugWindow = window as DebugLogWindow;
  if (debugWindow[DEBUG_LOG_INITIALIZED_KEY]) {
    return;
  }
  debugWindow[DEBUG_LOG_INITIALIZED_KEY] = true;

  const resolvedSessionId =
    sessionStorage.getItem(DEBUG_LOG_SESSION_KEY) ?? sessionId;
  sessionStorage.setItem(DEBUG_LOG_SESSION_KEY, resolvedSessionId);

  const queue: DebugLogEvent[] = [];
  let flushTimer: number | null = null;

  const flush = async (): Promise<void> => {
    if (queue.length === 0) {
      return;
    }

    const events = queue.splice(0, queue.length);

    try {
      await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: resolvedSessionId,
          events,
        }),
        keepalive: true,
        mode: 'cors',
      });
    } catch {
      queue.unshift(...events); // If the ingest server is still booting, keep buffered logs for the next flush.
    }
  };

  const scheduleFlush = (): void => {
    if (flushTimer !== null) {
      return;
    }

    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, 200);
  };

  const enqueue = (level: DebugLogEvent['level'], args: unknown[]): void => {
    queue.push({
      level,
      message: args.map(stringifyArgument).join(' '),
      ts: new Date().toISOString(),
    });
    scheduleFlush();
  };

  const wrapConsole = (level: DebugLogLevel): void => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      enqueue(level, args);
      original(...args);
    };
  };

  wrapConsole('log');
  wrapConsole('info');
  wrapConsole('warn');
  wrapConsole('error');
  wrapConsole('debug');

  window.addEventListener('error', (event) => {
    enqueue('window-error', [event.message]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    enqueue('unhandled-rejection', [event.reason]);
  });
};

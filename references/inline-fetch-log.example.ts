const DEBUG_LOG_DEFAULT_INGEST_URL = 'http://127.0.0.1:7242/ingest-client-logs';

type InlineDebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

type InlineDebugLogDetails = Record<string, unknown> | undefined;

type InlineDebugLogOptions = {
  enabled?: boolean;
  ingestUrl?: string;
  sessionId: string;
  level?: InlineDebugLogLevel;
  event: string;
  details?: InlineDebugLogDetails;
};

const toMessage = (event: string, details?: InlineDebugLogDetails): string => {
  if (!details) {
    return event;
  }

  try {
    return `${event} ${JSON.stringify(details)}`;
  } catch {
    return event;
  }
};

export const postInlineDebugLog = async ({
  enabled = true,
  ingestUrl = DEBUG_LOG_DEFAULT_INGEST_URL,
  sessionId,
  level = 'debug',
  event,
  details,
}: InlineDebugLogOptions): Promise<void> => {
  if (!enabled || typeof window === 'undefined') {
    return;
  }

  try {
    await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        events: [
          {
            level,
            message: toMessage(event, details),
            ts: new Date().toISOString(),
          },
        ],
      }),
      keepalive: true,
      mode: 'cors',
    });
  } catch {
    // Debug logging must never affect the normal app flow.
  }
};

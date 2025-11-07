const API_BASE = import.meta.env.VITE_SERVER_URL ?? '/api';

type HttpMethod = 'GET' | 'POST' | 'DELETE';

export class ApiError<TData = unknown> extends Error {
  status: number;
  data?: TData;

  constructor(message: string, status: number, data?: TData) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions<TBody> {
  method?: HttpMethod;
  body?: TBody;
  signal?: AbortSignal;
}

export async function apiFetch<TResponse, TBody = unknown, TErrorData = unknown>(
  path: string,
  options: RequestOptions<TBody> = {}
): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });

  const contentType = response.headers.get('content-type');
  if (!response.ok) {
    if (contentType?.includes('application/json')) {
      const data = (await response.json()) as TErrorData;
      throw new ApiError((data as { error?: string })?.error ?? 'Request failed', response.status, data);
    }
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  if (contentType?.includes('application/json')) {
    return response.json() as Promise<TResponse>;
  }
  return (undefined as unknown) as TResponse;
}

export { API_BASE };


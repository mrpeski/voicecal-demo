export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "http_error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function toApiError(
  res: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  let envelope: ApiErrorEnvelope | null = null;
  try {
    envelope = (await res.json()) as ApiErrorEnvelope;
  } catch {
    envelope = null;
  }

  const message =
    envelope?.error?.message ?? `${fallbackMessage}: ${res.status} ${res.statusText}`;
  const code = envelope?.error?.code ?? "http_error";
  return new ApiError(message, res.status, code);
}

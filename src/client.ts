import type {
  AppointmentFiltersRequest,
  AppointmentFiltersResponse,
  AvailableTimesRequest,
  AvailableTimesResponse,
  BookRequest,
  BookResponse,
  CancelAppointmentRequest,
  CancelAppointmentResponse,
  ClassFiltersResponse,
  ContentGetRequest,
  ContentGetResponse,
  PrebookRequest,
  PrebookResponse,
  Studio,
  UserClass,
  UserClassesRequest,
  UserRef,
  UserStatus,
  UserStatusRequest,
} from './types.js';

export interface DiscoverStrengthClientOptions {
  /** PHPSESSID cookie value — the credential the API uses to identify a logged-in user. */
  sessionId?: string;
  /** API key sent as the `apikey` header. Defaults to the value observed in the iOS app. */
  apiKey?: string;
  /** Group ID sent as the `client-group` header. */
  clientGroup?: string;
  /** Profile key sent as the `profilekey` header. */
  profileKey?: string;
  /** Override the API base URL. */
  baseUrl?: string;
  /** User-Agent header. Defaults to the iOS DiscoverStrength UA. */
  userAgent?: string;
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
  /** Default ClientID/PersonID applied to user-scoped calls. */
  user?: UserRef;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Called whenever the server rotates the PHPSESSID via `Set-Cookie`.
   * The client updates its own `sessionId` automatically; use this hook to
   * persist the new value (e.g. write it back to `.env`).
   */
  onSessionRotated?: (newSessionId: string, previousSessionId: string | undefined) => void;
}

export class DiscoverStrengthApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(message: string, status: number, url: string, body: string) {
    super(message);
    this.name = 'DiscoverStrengthApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

const DEFAULTS = {
  baseUrl: 'https://api-fit-mbo.axl3.io',
  apiKey: '3m6PUwyq9p23DjrXZhbC',
  clientGroup: 'G00070',
  profileKey: 'oYRcBdeku1lEODPPlsUB',
  userAgent: 'DiscoverStrength/38 CFNetwork/3860.600.12 Darwin/25.5.0',
} as const;

/**
 * Client for the api-fit-mbo.axl3.io backend used by the Discover Strength
 * iOS app. The service is a Mindbody Online wrapper; responses are returned as
 * base64-encoded JSON which this client decodes transparently.
 */
export class DiscoverStrengthClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly clientGroup: string;
  private readonly profileKey: string;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs?: number;
  private user?: UserRef;
  private sessionId?: string;
  private readonly onSessionRotated?: (newSessionId: string, previousSessionId: string | undefined) => void;

  constructor(options: DiscoverStrengthClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULTS.baseUrl).replace(/\/+$/, '');
    this.apiKey = options.apiKey ?? DEFAULTS.apiKey;
    this.clientGroup = options.clientGroup ?? DEFAULTS.clientGroup;
    this.profileKey = options.profileKey ?? DEFAULTS.profileKey;
    this.userAgent = options.userAgent ?? DEFAULTS.userAgent;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs;
    this.user = options.user;
    this.sessionId = options.sessionId;
    this.onSessionRotated = options.onSessionRotated;
  }

  /** Set or replace the default user (ClientID/PersonID) for user-scoped calls. */
  setUser(user: UserRef | undefined): void {
    this.user = user;
  }

  getUser(): UserRef | undefined {
    return this.user;
  }

  /** Set or replace the PHPSESSID cookie used to authenticate requests. */
  setSessionId(sessionId: string | undefined): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  // ---------- Endpoints ----------

  /** POST /studios — list of all studios with timezone metadata. */
  studios(): Promise<Studio[]> {
    return this.post<Studio[]>('/studios');
  }

  /** POST /class/filters — full set of locations (group-classes view). */
  classFilters(): Promise<ClassFiltersResponse> {
    return this.post<ClassFiltersResponse>('/class/filters');
  }

  /** POST /content/get — fetch content blocks (e.g. banners) for a user. */
  contentGet(label: string, user?: UserRef): Promise<ContentGetResponse> {
    const body: ContentGetRequest = { Label: label, User: this.requireUser(user) };
    return this.post<ContentGetResponse>('/content/get', body);
  }

  /** POST /user/status — dashboard / streak / membership info. */
  userStatus(opts: { appVersion?: string; user?: UserRef } = {}): Promise<UserStatus> {
    const body: UserStatusRequest = {
      ...this.requireUser(opts.user),
      ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
    };
    return this.post<UserStatus>('/user/status', body);
  }

  /** POST /user/classes — booked classes/appointments for the user. */
  userClasses(
    opts: { futureOnly?: boolean; type?: 'Both' | 'Class' | 'Appointment'; user?: UserRef } = {},
  ): Promise<UserClass[]> {
    const body: UserClassesRequest = {
      ...this.requireUser(opts.user),
      FutureOnly: opts.futureOnly ?? true,
      Type: opts.type ?? 'Both',
    };
    return this.post<UserClass[]>('/user/classes', body);
  }

  /** POST /user/familyclasses — booked classes for linked family members. */
  userFamilyClasses(
    opts: { futureOnly?: boolean; type?: 'Both' | 'Class' | 'Appointment'; user?: UserRef } = {},
  ): Promise<UserClass[]> {
    const body: UserClassesRequest = {
      ...this.requireUser(opts.user),
      FutureOnly: opts.futureOnly ?? true,
      Type: opts.type ?? 'Both',
    };
    return this.post<UserClass[]>('/user/familyclasses', body);
  }

  /** POST /user/familymembers — list linked family members. */
  userFamilyMembers(user?: UserRef): Promise<unknown[]> {
    return this.post<unknown[]>('/user/familymembers', this.requireUser(user));
  }

  /** POST /appointment/v2/filters — session categories/types for a location. */
  appointmentFilters(
    locations: string | { ClientID: string; LocationID: string },
  ): Promise<AppointmentFiltersResponse> {
    const body: AppointmentFiltersRequest = {
      Locations: typeof locations === 'string' ? locations : `${locations.ClientID}-${locations.LocationID}`,
    };
    return this.post<AppointmentFiltersResponse>('/appointment/v2/filters', body);
  }

  /** POST /appointment/v2/availabletimes — open appointment slots for a date. */
  availableTimes(opts: {
    date: string; // "YYYY-MM-DD"
    locations: string | { ClientID: string; LocationID: string };
    sessionName: string; // e.g. "Group"
    startTime?: string;
    endTime?: string;
    showUTCTime?: boolean;
  }): Promise<AvailableTimesResponse> {
    const body: AvailableTimesRequest = {
      Date: opts.date,
      StartTime: opts.startTime ?? '0:00:00',
      EndTime: opts.endTime ?? '23:00:00',
      Locations:
        typeof opts.locations === 'string'
          ? opts.locations
          : `${opts.locations.ClientID}-${opts.locations.LocationID}`,
      SessionName: opts.sessionName,
      ShowUTCTime: opts.showUTCTime ?? false,
    };
    return this.post<AvailableTimesResponse>('/appointment/v2/availabletimes', body);
  }

  /** POST /appointment/prebook — confirms which package will be used for booking. */
  prebook(opts: {
    clientId: string;
    locationId: string;
    sessionTypeId: string;
    startDateTime: string;
    user?: UserRef;
  }): Promise<PrebookResponse> {
    const body: PrebookRequest = {
      ClientID: opts.clientId,
      LocationID: opts.locationId,
      SessionTypeID: opts.sessionTypeId,
      StartDateTime: opts.startDateTime,
      User: this.requireUser(opts.user),
    };
    return this.post<PrebookResponse>('/appointment/prebook', body);
  }

  /** POST /appointment/book — actually books the appointment. Call prebook first. */
  book(opts: {
    clientId: string;
    locationId: string;
    sessionTypeId: string;
    coachId: string;
    startDateTime: string;
    endDateTime: string;
    appointmentDescription?: string;
    notes?: string;
    user?: UserRef;
  }): Promise<BookResponse> {
    const body: BookRequest = {
      AppointmentDescription: opts.appointmentDescription ?? 'Group',
      ClientID: opts.clientId,
      CoachID: opts.coachId,
      EndDateTime: opts.endDateTime,
      LocationID: opts.locationId,
      Notes: opts.notes ?? '',
      SessionTypeID: opts.sessionTypeId,
      StartDateTime: opts.startDateTime,
      User: this.requireUser(opts.user),
    };
    return this.post<BookResponse>('/appointment/book', body);
  }

  /** POST /appointment/cancel — cancels a booked appointment by its AppointmentID. */
  cancelAppointment(opts: {
    appointmentId: string;
    clientId: string;
    user?: UserRef;
  }): Promise<CancelAppointmentResponse> {
    const body: CancelAppointmentRequest = {
      Appointment: {
        AppointmentID: opts.appointmentId,
        ClientID: opts.clientId,
      },
      User: this.requireUser(opts.user),
    };
    return this.post<CancelAppointmentResponse>('/appointment/cancel', body);
  }

  // ---------- Internals ----------

  private requireUser(override?: UserRef): UserRef {
    const u = override ?? this.user;
    if (!u) {
      throw new Error(
        'DiscoverStrengthClient: user (ClientID + PersonID) is required. ' +
          'Pass it to the constructor, setUser(), or the per-call options.',
      );
    }
    return u;
  }

  private captureRotatedSession(res: Response): void {
    // Node 18+ undici exposes getSetCookie() returning each Set-Cookie line.
    // Fall back to .get('set-cookie') (comma-joined) for other runtimes.
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const cookieLines: string[] =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : headers.get('set-cookie')
          ? [headers.get('set-cookie') as string]
          : [];

    for (const line of cookieLines) {
      const match = /(?:^|;\s*)PHPSESSID=([^;]+)/.exec(line);
      if (match && match[1] && match[1] !== this.sessionId) {
        const previous = this.sessionId;
        this.sessionId = match[1];
        this.onSessionRotated?.(match[1], previous);
        return;
      }
    }
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = this.timeoutMs ? new AbortController() : undefined;
    const timer = controller && this.timeoutMs ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        'apikey': this.apiKey,
        'client-group': this.clientGroup,
        'profilekey': this.profileKey,
      };
      if (this.sessionId) {
        headers['Cookie'] = `PHPSESSID=${this.sessionId}`;
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller?.signal,
      });

      this.captureRotatedSession(res);

      const raw = await res.text();

      if (!res.ok) {
        throw new DiscoverStrengthApiError(
          `POST ${path} failed with status ${res.status}`,
          res.status,
          url,
          raw,
        );
      }

      return decodeBody<T>(raw, url);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/**
 * Responses from this API are JSON re-encoded as base64. We try base64 first
 * and fall back to plain JSON in case the upstream behavior changes.
 */
function decodeBody<T>(raw: string, url: string): T {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined as unknown as T;
  }

  if (looksLikeBase64(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      return JSON.parse(decoded) as T;
    } catch {
      // fall through
    }
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new DiscoverStrengthApiError(
      `Failed to parse response from ${url}: ${(err as Error).message}`,
      200,
      url,
      raw.slice(0, 500),
    );
  }
}

function looksLikeBase64(s: string): boolean {
  if (s.length < 8 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

# CLAUDE.md

Notes for Claude Code working in this repository. Aimed at things that aren't
obvious from a quick read of the source. The README has the user-facing API
docs — don't duplicate them here.

## What this is

A reverse-engineered TypeScript client for `api-fit-mbo.axl3.io`, the backend
behind the Discover Strength iOS app (a Mindbody Online wrapper). Everything
here was derived from a single Charles Proxy HAR capture of the mobile app.

## Source of truth

The HAR file in the repo root (gitignored) is the *only* authoritative source
for endpoints and shapes. **Do not invent endpoints or fields that aren't in
the HAR** — there is no public documentation, and guessing leads to
silently-broken calls.

When extending the client, the right workflow is:

1. Capture a new HAR from the iOS app (Charles Proxy with SSL pinning bypass).
2. Decode the response (base64 → JSON, see below).
3. Add types in `src/types.ts`, then a method on `DiscoverStrengthClient`.

## Layout

```
src/
  client.ts   # DiscoverStrengthClient class + transport, base64 decode, session rotation
  types.ts    # Request/response interfaces; all derived from observed payloads
  index.ts    # Re-exports
.env          # PHPSESSID=…   (gitignored, hand-managed)
.env.example  # Template, committed
```

Single class, single file — keep it that way unless the surface grows
substantially. No barrel files beyond `index.ts`.

## Quirks that will trip you up

- **Responses are base64-encoded JSON.** Every successful body comes back as
  a base64 string of UTF-8 JSON. `decodeBody()` in `client.ts` handles this
  with a fallback to plain JSON in case behavior changes. Don't strip this
  in user code — the raw `fetch` text is what `decodeBody()` expects.
- **Session rotation via `Set-Cookie`.** The server can issue a fresh
  `PHPSESSID` on any response (observed on `/user/status` and
  `/class/filters`). `captureRotatedSession()` reads it and updates
  `this.sessionId`. The constructor's `onSessionRotated` hook is how callers
  persist the new value (e.g. write back to `.env`). There is **no login
  endpoint** in the HAR — full re-auth must happen out-of-band.
- **`getSetCookie()` vs `get('set-cookie')`.** Node 18+ undici exposes
  `Headers.getSetCookie()` as an array of lines. Other runtimes only have
  `headers.get('set-cookie')` (comma-joined, lossy for multi-cookie cases).
  `captureRotatedSession()` prefers the array form when available.
- **Stringly-typed IDs.** `ClientID`, `LocationID`, `SessionTypeID`,
  `CoachID`, `PersonID` are strings on the way in, but the `book` and
  `availableTimes` responses return some of them as numbers. The types
  reflect the actual wire format — don't "fix" them to match.
- **Date strings are local studio time.** `YYYY-MM-DD HH:mm:ss`, no
  timezone suffix. If you need UTC, look up the studio's `TimeZone`
  (IANA) from `studios()` and convert.
- **`Locations` field format.** Where the API takes a `Locations` string,
  it's `<ClientID>-<LocationID>` (e.g. `100946-1`). Helpers accept either
  the string or `{ ClientID, LocationID }`.

## Defaults baked into the client

These were captured from `DiscoverStrength/38 CFNetwork/3860.600.12`:

- `apiKey = 3m6PUwyq9p23DjrXZhbC` (sent as `apikey` header)
- `clientGroup = G00070` (sent as `client-group` header)
- `profileKey = oYRcBdeku1lEODPPlsUB` (sent as `profilekey` header)
- `userAgent = DiscoverStrength/38 CFNetwork/3860.600.12 Darwin/25.5.0`
- `baseUrl = https://api-fit-mbo.axl3.io`

If the vendor rotates any of these, the client takes constructor overrides
for all of them — bump the defaults in `client.ts` (`DEFAULTS` const) and
update the README's configuration table.

## Build / typecheck

```bash
npm install
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit
```

Node 18+ required (global `fetch`). No runtime dependencies.

## Testing

There is currently no test suite. The HAR file is the closest thing — when
adding methods, hand-verify request bodies match what the iOS app sent for
the same operation. If you add tests, mock at the `fetch` boundary using the
constructor's `fetch` option.

## Adding a new endpoint

1. Decode the HAR entry. Quick recipe:
   ```python
   import json, base64
   with open(har_file) as f: har = json.load(f)
   for e in har['log']['entries']:
       url = e['request']['url']
       body = e['response']['content'].get('text', '')
       try: print(url, json.dumps(json.loads(base64.b64decode(body)), indent=2)[:2000])
       except: pass
   ```
2. Add request/response interfaces to `src/types.ts`. Match observed nullability
   carefully — many fields are `null` rather than missing.
3. Add a method to `DiscoverStrengthClient`. Use `requireUser()` for
   user-scoped calls so the error message is consistent.
4. Update the README's API reference table and add a section for the method.

## Scope discipline

- Don't add a login flow or token refresh — the HAR doesn't show one, and
  fabricating one is worse than failing loudly when the session expires.
- Don't add retries or rate-limiting unless we have evidence the API needs
  them. The iOS app doesn't appear to.
- Don't introduce a separate "models" layer or DTO transformation. The
  response shapes are stable enough to expose directly.

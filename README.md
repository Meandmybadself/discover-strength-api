# discover-strength-api

Reverse-engineered Node / TypeScript client for `api-fit-mbo.axl3.io` — the
backend used by the Discover Strength iOS app (a Mindbody Online wrapper).

> **Heads up:** This is an unofficial client, derived from a HAR capture of the
> mobile app. The endpoints, headers, and shapes can change without notice.
> Responses are returned as base64-encoded JSON — the client decodes them
> transparently.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Authentication & session rotation](#authentication--session-rotation)
- [API reference](#api-reference)
- [Conventions & quirks](#conventions--quirks)

## Install

```bash
npm install
npm run build
```

Requires Node 18+ (uses global `fetch`).

## Quick start

```ts
import { DiscoverStrengthClient } from 'discover-strength-api';

const client = new DiscoverStrengthClient({
  sessionId: process.env.PHPSESSID,
  user: { ClientID: '100946', PersonID: '100002485' },
});

// Dashboard
const status = await client.userStatus({ appVersion: '1.4.4' });
console.log(status.weekStreak, status.ActivePackages);

// Booked classes
const upcoming = await client.userClasses({ futureOnly: true });

// Find an open Group slot at Wayzata
const times = await client.availableTimes({
  date: '2026-05-25',
  locations: { ClientID: '100946', LocationID: '1' },
  sessionName: 'Group',
});

// Two-step booking
await client.prebook({
  clientId: '100946',
  locationId: '1',
  sessionTypeId: '49',
  startDateTime: '2026-05-25 09:15:00',
});

const booking = await client.book({
  clientId: '100946',
  locationId: '1',
  sessionTypeId: '49',
  coachId: '100000035',
  startDateTime: '2026-05-25 09:15:00',
  endDateTime: '2026-05-25 10:00:00',
});
console.log('Booked appointment', booking.AppointmentID);
```

## Configuration

`new DiscoverStrengthClient(options)` accepts:

| Option              | Type                                            | Default                                | Notes |
|---------------------|-------------------------------------------------|----------------------------------------|-------|
| `sessionId`         | `string`                                        | —                                      | `PHPSESSID` cookie value. Required for any user-scoped call. |
| `user`              | `{ ClientID: string; PersonID: string }`        | —                                      | Default user applied to user-scoped calls. Per-call override is supported. |
| `apiKey`            | `string`                                        | `3m6PUwyq9p23DjrXZhbC`                 | Sent as the `apikey` header. |
| `clientGroup`       | `string`                                        | `G00070`                               | Sent as the `client-group` header. |
| `profileKey`        | `string`                                        | `oYRcBdeku1lEODPPlsUB`                 | Sent as the `profilekey` header. |
| `userAgent`         | `string`                                        | `DiscoverStrength/38 CFNetwork/...`    | |
| `baseUrl`           | `string`                                        | `https://api-fit-mbo.axl3.io`          | |
| `fetch`             | `typeof fetch`                                  | `globalThis.fetch`                     | Inject your own (e.g. for proxies, logging). |
| `timeoutMs`         | `number`                                        | —                                      | Per-request abort timeout. |
| `onSessionRotated`  | `(next, prev) => void`                          | —                                      | See below. |

Mutators: `setUser(user)`, `setSessionId(id)`. Accessors: `getUser()`, `getSessionId()`.

## Authentication & session rotation

Authentication is a `PHPSESSID` cookie. Hand it to the constructor and the
client attaches `Cookie: PHPSESSID=…` to every request.

A `.env` file with `PHPSESSID=…` is provided locally and listed in
`.gitignore`. Load it with your env-loader of choice (Node 20.6+ supports
`node --env-file=.env script.js`).

**Rotation:** the server hands back a fresh `PHPSESSID` on `Set-Cookie`
periodically (observed on `/user/status` and `/class/filters` in the original
capture). The client follows the rotation automatically — the new value is
visible via `client.getSessionId()`. Pass `onSessionRotated` to persist it:

```ts
import fs from 'node:fs';

const client = new DiscoverStrengthClient({
  sessionId: process.env.PHPSESSID,
  onSessionRotated: (next) => {
    fs.writeFileSync('.env', `PHPSESSID=${next}\n`);
  },
});
```

**Limitation:** the HAR contains no login endpoint, so the client cannot mint
a brand-new session. If the cookie expires entirely you'll need to obtain a
fresh `PHPSESSID` out-of-band (e.g. by signing in via the iOS app and
re-capturing).

## API reference

All endpoints are `POST` against `https://api-fit-mbo.axl3.io`. Responses
are JSON re-encoded as base64; the client decodes transparently.

| Method                              | Path                                |
| ----------------------------------- | ----------------------------------- |
| [`studios()`](#studios)                                          | `/studios`                              |
| [`classFilters()`](#classfilters)                                | `/class/filters`                        |
| [`contentGet(label, user?)`](#contentgetlabel-user)              | `/content/get`                          |
| [`userStatus(opts?)`](#userstatusopts)                           | `/user/status`                          |
| [`userClasses(opts?)`](#userclassesopts)                         | `/user/classes`                         |
| [`userFamilyClasses(opts?)`](#userfamilyclassesopts)             | `/user/familyclasses`                   |
| [`userFamilyMembers(user?)`](#userfamilymembersuser)             | `/user/familymembers`                   |
| [`appointmentFilters(locations)`](#appointmentfilterslocations)  | `/appointment/v2/filters`               |
| [`availableTimes(opts)`](#availabletimesopts)                    | `/appointment/v2/availabletimes`        |
| [`prebook(opts)`](#prebookopts)                                  | `/appointment/prebook`                  |
| [`book(opts)`](#bookopts)                                        | `/appointment/book`                     |

---

### `studios()`

List of all Discover Strength studios with timezone and capability flags.

- **Body:** none.
- **Returns:** `Studio[]`

```ts
const studios = await client.studios();
// [{ ClientID, LocationID, Slug, Nickname, Address, City, State, Zip,
//    Latitude, Longitude, mboSiteID, hasFutureClasses, hasAppointments,
//    TimeZone, ... }, ...]
```

### `classFilters()`

Locations payload used by the group-classes filter UI. Almost identical to
`studios()` but without the `hasFutureClasses` / `TimeZone` fields.

- **Body:** none.
- **Returns:** `{ Locations: Location[] }`

### `contentGet(label, user?)`

Fetches a content block (banners, announcements, etc.) for the user.

- **Body:** `{ Label: string, User: { ClientID, PersonID } }`
- **Returns:** `{ code: number, message: string, ... }` — payload depends on `Label`.

```ts
const banners = await client.contentGet('banners');
```

### `userStatus(opts?)`

Dashboard summary: streaks, package balance, next class, home studio.

- **Body:** `{ ClientID, PersonID, appVersion? }`
- **Returns:** `UserStatus` — includes `weekStreak`, `totalClasses`,
  `nextClassDateTime`, `homeStudio` (full `Studio` object), and
  `ActivePackages[]` with sessions remaining and expiry dates.

```ts
const s = await client.userStatus({ appVersion: '1.4.4' });
console.log(s.weekStreak, s.ActivePackages[0].totalRemaining);
```

### `userClasses(opts?)`

Booked classes & appointments for the signed-in user.

- **Body:** `{ ClientID, PersonID, FutureOnly: boolean, Type: 'Both' | 'Class' | 'Appointment' }`
- **Returns:** `UserClass[]`

Each entry includes `StartDateTime`, `EndDateTime`, `Coach` (full coach
object), `Location`, `VisitRefNo`, `isCancellable`, `IsLateCancel`, etc.

```ts
const upcoming = await client.userClasses({ futureOnly: true, type: 'Both' });
```

### `userFamilyClasses(opts?)`

Same shape as `userClasses` but for linked family members. Returns `[]` if
the account has no family options.

### `userFamilyMembers(user?)`

Returns linked family members. `[]` for accounts without family options.

### `appointmentFilters(locations)`

Returns the session categories and types bookable at a location — needed
to populate the "what kind of session?" picker.

- **Body:** `{ Locations: "ClientID-LocationID" }` — pass either a string
  in that format or an object `{ ClientID, LocationID }` (the helper builds
  the string for you).
- **Returns:** `{ SessionCategories: SessionCategory[] }`, where each
  category has `id`, `Name`, and a list of `SessionTypes` with
  `SessionTypeID` and `SessionName`.

```ts
const filters = await client.appointmentFilters({
  ClientID: '100946', LocationID: '1',
});
const groupSessionTypeId = filters.SessionCategories
  .flatMap(c => c.SessionTypes)
  .find(t => t.SessionName === 'Group')?.SessionTypeID;
```

### `availableTimes(opts)`

Open appointment slots on a given date, broken out by coach.

- **Body:** `{ Date, StartTime, EndTime, Locations, SessionName, ShowUTCTime }`
- **Returns:** `{ AvailableTimes: AvailableTimeBlock[], Coaches: Coach[], Locations: Location[] }`

Each `AvailableTimeBlock` is one coach's slots for the day:
`{ ClientID, LocationID, CoachID, AppointmentID, SessionTypeID, SessionTimes: [{ Start, End }] }`.
The `Coaches[]` array provides bios/headshots indexed by `CoachID`.

```ts
const times = await client.availableTimes({
  date: '2026-05-25',
  locations: { ClientID: '100946', LocationID: '1' },
  sessionName: 'Group',
  startTime: '0:00:00',   // optional, default
  endTime: '23:00:00',    // optional, default
  showUTCTime: false,     // optional, default
});
```

### `prebook(opts)`

Confirms which package or pricing option will be charged for a booking.
Must be called before `book()` — the iOS app uses it to display "8 Group
Sessions Per Month — 6 remaining" before the user taps confirm.

- **Body:** `{ ClientID, LocationID, SessionTypeID, StartDateTime, User }`
- **Returns:** `{ PackageCount, Packages: [{ Name, ID, FinePrint, Expires, Remaining }], PackageOptions, AllowUnpaid, AllowAddons, AllowNotes, InformationRequired }`

```ts
const pre = await client.prebook({
  clientId: '100946',
  locationId: '1',
  sessionTypeId: '49',
  startDateTime: '2026-05-25 09:15:00',
});
console.log(pre.Packages[0]?.Name, pre.Packages[0]?.Remaining);
```

### `book(opts)`

Creates the appointment.

- **Body:** `{ AppointmentDescription, ClientID, CoachID, EndDateTime, LocationID, Notes, SessionTypeID, StartDateTime, User }`
- **Returns:** booking confirmation with `AppointmentID`, `Status` ("Booked"),
  `StaffID` (the chosen coach), `Duration`, `ProgramID`, etc.

```ts
const booked = await client.book({
  clientId: '100946',
  locationId: '1',
  sessionTypeId: '49',
  coachId: '100000035',
  startDateTime: '2026-05-25 09:15:00',
  endDateTime: '2026-05-25 10:00:00',
  appointmentDescription: 'Group',  // optional, default
  notes: '',                        // optional, default
});
```

## Conventions & quirks

- **Base64 responses.** Every response body is base64-encoded JSON. The
  client decodes transparently. If you swap in your own `fetch`, do *not*
  decode it yourself — the client expects the raw text.
- **Date strings.** All times are local studio time in the form
  `YYYY-MM-DD HH:mm:ss` (no timezone suffix, despite a `ShowUTCTime` flag
  on `availableTimes`). The studio's `TimeZone` is on its `Studio` object.
- **Location identity.** The `Locations` request field uses the
  `ClientID-LocationID` format (e.g. `100946-1`). Helpers accept either the
  string or the `{ ClientID, LocationID }` object.
- **IDs are stringly typed.** `ClientID`, `PersonID`, `LocationID`,
  `SessionTypeID`, `CoachID` are strings in requests and most responses,
  but a handful of response fields (`book` response, `availableTimes`
  `CoachID`/`AppointmentID`) come back as numbers. The types reflect this
  faithfully.
- **Session sentinel headers.** `apikey`, `client-group`, and `profilekey`
  defaults match the iOS app build observed (DiscoverStrength/38). They
  may be rotated by the vendor — override via constructor options if needed.
- **No login endpoint.** Auth is handled outside this surface (see the
  [session rotation section](#authentication--session-rotation)).

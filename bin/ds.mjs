#!/usr/bin/env node
// CLI wrapper around DiscoverStrengthClient. Designed for the
// ~/.claude/skills/discover-strength skill to shell out to.
//
// Subcommands:
//   status                  Print streak, packages, next class.
//   upcoming [--limit N]    List upcoming booked classes.
//   slots <YYYY-MM-DD> [--session Group] [--location <ClientID-LocationID>]
//                           List available slots for a date.
//   book   --start <YYYY-MM-DD HH:MM:SS>
//          [--coach <CoachID>]  (default: first available)
//          [--session Group]
//          [--location <ClientID-LocationID>]
//   prebook --start <...> [--session Group] [--location <...>]
//   cancel --appointment <AppointmentID> [--client <ClientID>]
//
// Auth is loaded from the project's .env. The CLI updates .env on session
// rotation so the next invocation stays fresh.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiscoverStrengthClient, DiscoverStrengthApiError } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env');

// Lazy .env loader so the script can be invoked directly.
if (!process.env.PHPSESSID && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
  }
}

const USER = { ClientID: '100946', PersonID: '100002485' };
const HOME_LOCATION = '100946-1'; // Wayzata

const client = new DiscoverStrengthClient({
  sessionId: process.env.PHPSESSID,
  user: USER,
  onSessionRotated: (next) => {
    try {
      fs.writeFileSync(envPath, `PHPSESSID=${next}\n`);
    } catch {/* best effort */}
  },
});

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) return argv[i + 1];
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

const DEFAULT_SESSION = 'Group Training';

// availabletimes returns {code: 605, message: "No results found"} instead of
// an AvailableTimes array when nothing matches.
function availableBlocks(t) {
  if (t && t.code === 605) return [];
  if (!Array.isArray(t?.AvailableTimes)) {
    throw new Error(`Unexpected availabletimes response: ${JSON.stringify(t).slice(0, 200)}`);
  }
  return t.AvailableTimes;
}

function parseLocation(spec = HOME_LOCATION) {
  const [ClientID, LocationID] = spec.split('-');
  if (!ClientID || !LocationID) throw new Error(`Invalid location: ${spec}`);
  return { ClientID, LocationID };
}

function fail(msg, body) {
  console.error(`ERROR: ${msg}`);
  if (body) console.error(body.slice(0, 500));
  process.exit(1);
}

async function lookupSessionTypeId(location, sessionName) {
  const filters = await client.appointmentFilters(location);
  const t = filters.SessionCategories
    .flatMap(c => c.SessionTypes)
    .find(s => s.SessionName.trim().toLowerCase() === sessionName.trim().toLowerCase());
  if (!t) throw new Error(`Unknown session "${sessionName}" at ${location.ClientID}-${location.LocationID}`);
  return t.SessionTypeID;
}

async function findBlock({ date, start, sessionName, location }) {
  const times = await client.availableTimes({ date, locations: location, sessionName });
  for (const block of availableBlocks(times)) {
    for (const slot of block.SessionTimes) {
      if (slot.Start === start) {
        return {
          coachId: String(block.CoachID),
          sessionTypeId: String(block.SessionTypeID),
          start: slot.Start,
          end: slot.End,
          appointmentId: block.AppointmentID,
        };
      }
    }
  }
  return null;
}

function coachName(coaches, coachId) {
  const c = coaches.find(x => String(x.CoachID) === String(coachId));
  return c ? (c.Nickname || `${c.FirstName} ${c.LastName}`) : `Coach ${coachId}`;
}

// ---------- subcommands ----------

async function cmdStatus() {
  const s = await client.userStatus({ appVersion: '1.4.4' });
  console.log(`Streak       : ${s.weekStreak} weeks`);
  console.log(`Total classes: ${s.totalClasses} (last 30: ${s.totalClassesLast30})`);
  console.log(`Next class   : ${s.nextClassDateTime ?? '(none)'}`);
  console.log(`Last class   : ${s.lastClassDateTime ?? '(none)'}`);
  console.log(`Home studio  : ${s.homeStudio.Nickname} (${s.homeStudio.ClientID}-${s.homeStudio.LocationID}, ${s.homeStudio.TimeZone})`);
  console.log(`Packages     :`);
  for (const p of s.ActivePackages) {
    console.log(`  - ${p.pricingOptionName}: ${p.totalRemaining} remaining, expires ${p.expDate}`);
  }
}

async function cmdUpcoming() {
  const limit = Number(flag('limit') ?? 20);
  const classes = await client.userClasses({ futureOnly: true });
  if (classes.length === 0) {
    console.log('(no upcoming classes)');
    return;
  }
  for (const c of classes.slice(0, limit)) {
    const coach = c.Coach.Nickname || `${c.Coach.FirstName} ${c.Coach.LastName}`;
    const cancelable = c.isCancellable ? '' : c.IsLateCancel ? ' [late-cancel only]' : ' [not cancelable]';
    console.log(`${c.StartDateTime} → ${c.EndDateTime}  ${c.Name}  with ${coach}  @ ${c.Location.Nickname}  (Visit ${c.VisitRefNo})${cancelable}`);
  }
}

async function cmdSlots(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Usage: ds slots <YYYY-MM-DD>');
  const sessionName = flag('session') ?? DEFAULT_SESSION;
  const location = parseLocation(flag('location'));
  const t = await client.availableTimes({ date, locations: location, sessionName });
  let any = false;
  for (const block of availableBlocks(t)) {
    if (block.SessionTimes.length === 0) continue;
    any = true;
    const coach = coachName(t.Coaches, block.CoachID);
    for (const slot of block.SessionTimes) {
      console.log(`${slot.Start}  →  ${slot.End}   coach=${coach} (${block.CoachID})  sessionTypeId=${block.SessionTypeID}`);
    }
  }
  if (!any) console.log(`(no ${sessionName} slots on ${date} at ${location.ClientID}-${location.LocationID})`);
}

async function cmdPrebook() {
  const start = flag('start');
  if (!start) fail('Usage: ds prebook --start "YYYY-MM-DD HH:MM:SS"');
  const sessionName = flag('session') ?? DEFAULT_SESSION;
  const location = parseLocation(flag('location'));
  const date = start.slice(0, 10);
  const block = await findBlock({ date, start, sessionName, location });
  if (!block) fail(`No ${sessionName} slot at ${start} for ${location.ClientID}-${location.LocationID}`);
  const pre = await client.prebook({
    clientId: location.ClientID,
    locationId: location.LocationID,
    sessionTypeId: block.sessionTypeId,
    startDateTime: start,
  });
  console.log(`PackageCount: ${pre.PackageCount}  AllowUnpaid: ${pre.AllowUnpaid}`);
  for (const p of pre.Packages) {
    console.log(`  ${p.Name}  remaining=${p.Remaining}  expires=${p.Expires}`);
  }
}

async function cmdBook() {
  const start = flag('start');
  if (!start) fail('Usage: ds book --start "YYYY-MM-DD HH:MM:SS" [--coach <id>] [--session "Group Training"]');
  const sessionName = flag('session') ?? DEFAULT_SESSION;
  const location = parseLocation(flag('location'));
  const wantCoach = flag('coach');
  const date = start.slice(0, 10);

  // Find the slot.
  const times = await client.availableTimes({ date, locations: location, sessionName });
  let chosen = null;
  for (const block of availableBlocks(times)) {
    if (wantCoach && String(block.CoachID) !== String(wantCoach)) continue;
    for (const slot of block.SessionTimes) {
      if (slot.Start === start) {
        chosen = {
          coachId: String(block.CoachID),
          sessionTypeId: String(block.SessionTypeID),
          start: slot.Start,
          end: slot.End,
        };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) fail(`No ${sessionName} slot at ${start}${wantCoach ? ` with coach ${wantCoach}` : ''}`);

  const coach = coachName(times.Coaches, chosen.coachId);

  // Prebook to confirm package.
  const pre = await client.prebook({
    clientId: location.ClientID,
    locationId: location.LocationID,
    sessionTypeId: chosen.sessionTypeId,
    startDateTime: chosen.start,
  });
  const pkg = pre.Packages[0];
  console.log(`Booking ${chosen.start} → ${chosen.end} with ${coach}`);
  if (pkg) console.log(`  via "${pkg.Name}" (${pkg.Remaining} remaining before this booking)`);

  // Book.
  const result = await client.book({
    clientId: location.ClientID,
    locationId: location.LocationID,
    sessionTypeId: chosen.sessionTypeId,
    coachId: chosen.coachId,
    startDateTime: chosen.start,
    endDateTime: chosen.end,
    appointmentDescription: sessionName,
  });
  console.log(`OK — AppointmentID=${result.AppointmentID} status=${result.Status}`);
}

async function cmdCancel() {
  const appointmentId = flag('appointment');
  if (!appointmentId) fail('Usage: ds cancel --appointment <AppointmentID> [--client <ClientID>]');
  const clientId = flag('client') ?? USER.ClientID;
  const res = await client.cancelAppointment({ appointmentId, clientId });
  if (res.code === 200) {
    console.log(`OK — appointment ${appointmentId} cancelled (${res.message})`);
  } else {
    fail(`Cancel failed: code=${res.code} message=${res.message}`);
  }
}

// ---------- dispatch ----------

try {
  switch (cmd) {
    case 'status':   await cmdStatus(); break;
    case 'upcoming': await cmdUpcoming(); break;
    case 'slots':    await cmdSlots(argv[1]); break;
    case 'prebook':  await cmdPrebook(); break;
    case 'book':     await cmdBook(); break;
    case 'cancel':   await cmdCancel(); break;
    default:
      console.error('Usage: ds <status|upcoming|slots|prebook|book|cancel> [...]');
      process.exit(1);
  }
} catch (err) {
  if (err instanceof DiscoverStrengthApiError) {
    fail(`HTTP ${err.status} from ${err.url}`, err.body);
  }
  fail(err.message ?? String(err));
}

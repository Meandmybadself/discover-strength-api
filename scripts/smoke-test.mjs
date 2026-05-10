// Read-only smoke test against the live API.
// Run: node --env-file=.env scripts/smoke-test.mjs
//
// Each call is wrapped so one failure doesn't abort the rest; the script
// prints a one-line summary per endpoint, then HTTP status / error body
// when something goes wrong.

import { DiscoverStrengthClient, DiscoverStrengthApiError } from '../dist/index.js';

const sessionId = process.env.PHPSESSID;
if (!sessionId) {
  console.error('PHPSESSID not set. Run with: node --env-file=.env scripts/smoke-test.mjs');
  process.exit(1);
}

// User from the HAR capture (Wayzata).
const user = { ClientID: '100946', PersonID: '100002485' };
const homeLocation = { ClientID: '100946', LocationID: '1' };

const client = new DiscoverStrengthClient({
  sessionId,
  user,
  onSessionRotated: (next, prev) => {
    console.log(`  ↻ session rotated: ${prev?.slice(0, 8)}… → ${next.slice(0, 8)}…`);
  },
});

// Pick a date a week from today (local).
const future = new Date();
future.setDate(future.getDate() + 7);
const futureDate = future.toISOString().slice(0, 10);

let pass = 0;
let fail = 0;

async function run(label, fn) {
  process.stdout.write(`• ${label.padEnd(32)}`);
  try {
    const out = await fn();
    pass++;
    console.log(`  OK   ${out ?? ''}`);
  } catch (err) {
    fail++;
    if (err instanceof DiscoverStrengthApiError) {
      console.log(`  FAIL  HTTP ${err.status}`);
      console.log(`         body: ${err.body.slice(0, 300)}`);
    } else {
      console.log(`  FAIL  ${err.message}`);
    }
  }
}

console.log(`Testing as ClientID=${user.ClientID} PersonID=${user.PersonID}`);
console.log(`Using PHPSESSID=${sessionId.slice(0, 8)}…\n`);

await run('studios()', async () => {
  const s = await client.studios();
  return `${s.length} studios — first: ${s[0]?.Nickname} (${s[0]?.City}, ${s[0]?.State})`;
});

await run('classFilters()', async () => {
  const r = await client.classFilters();
  return `${r.Locations.length} locations`;
});

await run('userStatus()', async () => {
  const s = await client.userStatus({ appVersion: '1.4.4' });
  return `streak=${s.weekStreak}wk total=${s.totalClasses} next=${s.nextClassDateTime ?? 'none'} home=${s.homeStudio?.Nickname}`;
});

await run('userClasses(future)', async () => {
  const c = await client.userClasses({ futureOnly: true });
  return `${c.length} upcoming`;
});

await run('userFamilyMembers()', async () => {
  const m = await client.userFamilyMembers();
  return `${m.length} family members`;
});

await run('userFamilyClasses()', async () => {
  const c = await client.userFamilyClasses({ futureOnly: true });
  return `${c.length} family bookings`;
});

await run('contentGet("banners")', async () => {
  const c = await client.contentGet('banners');
  return `code=${c.code}`;
});

await run('appointmentFilters(home)', async () => {
  const f = await client.appointmentFilters(homeLocation);
  const types = f.SessionCategories.flatMap(c => c.SessionTypes).length;
  return `${f.SessionCategories.length} categories / ${types} session types`;
});

await run(`availableTimes(${futureDate})`, async () => {
  const t = await client.availableTimes({
    date: futureDate,
    locations: homeLocation,
    sessionName: 'Group',
  });
  const slots = t.AvailableTimes.reduce((n, b) => n + b.SessionTimes.length, 0);
  return `${slots} slots across ${t.AvailableTimes.length} coaches`;
});

console.log(`\n${pass} passed, ${fail} failed. Final session: ${client.getSessionId()?.slice(0, 8)}…`);
process.exit(fail === 0 ? 0 : 1);

// Prebook smoke test — finds a real available Group slot via
// availableTimes(), then calls prebook() against it. Prebook returns the
// package that *would* be used; it does NOT create a booking.
//
// Run: node --env-file=.env scripts/prebook-test.mjs

import { DiscoverStrengthClient, DiscoverStrengthApiError } from '../dist/index.js';

const sessionId = process.env.PHPSESSID;
if (!sessionId) {
  console.error('PHPSESSID not set');
  process.exit(1);
}

const user = { ClientID: '100946', PersonID: '100002485' };
const homeLocation = { ClientID: '100946', LocationID: '1' };

const client = new DiscoverStrengthClient({ sessionId, user });

// Find Group SessionTypeID dynamically rather than hardcoding "49".
const filters = await client.appointmentFilters(homeLocation);
const groupType = filters.SessionCategories
  .flatMap(c => c.SessionTypes)
  .find(t => t.SessionName === 'Group');
if (!groupType) throw new Error('No Group session type found');
console.log(`Group SessionTypeID = ${groupType.SessionTypeID}`);

// Search forward day by day until we find an open slot.
let slot = null;
let day = new Date();
for (let i = 1; i <= 14 && !slot; i++) {
  day.setDate(day.getDate() + 1);
  const date = day.toISOString().slice(0, 10);
  const times = await client.availableTimes({
    date,
    locations: homeLocation,
    sessionName: 'Group',
  });
  for (const block of times.AvailableTimes) {
    if (block.SessionTimes.length > 0) {
      slot = {
        date,
        coachId: String(block.CoachID),
        sessionTypeId: String(block.SessionTypeID),
        start: block.SessionTimes[0].Start,
        end: block.SessionTimes[0].End,
      };
      break;
    }
  }
}
if (!slot) {
  console.error('No open Group slots in the next 14 days');
  process.exit(1);
}

console.log(`\nFound slot: ${slot.start} → ${slot.end} (CoachID ${slot.coachId}, SessionTypeID ${slot.sessionTypeId})`);

console.log('\nCalling prebook()...');
try {
  const pre = await client.prebook({
    clientId: user.ClientID,
    locationId: homeLocation.LocationID,
    sessionTypeId: slot.sessionTypeId,
    startDateTime: slot.start,
  });
  console.log('  PackageCount:', pre.PackageCount);
  console.log('  AllowUnpaid :', pre.AllowUnpaid);
  console.log('  AllowAddons :', pre.AllowAddons);
  console.log('  Packages    :');
  for (const p of pre.Packages) {
    console.log(`    - ${p.Name}  id=${p.ID}  remaining=${p.Remaining}  expires=${p.Expires}`);
  }
  console.log('\nOK — prebook succeeded. (No booking was created.)');
} catch (err) {
  if (err instanceof DiscoverStrengthApiError) {
    console.error(`\nFAIL  HTTP ${err.status}\n  body: ${err.body.slice(0, 500)}`);
  } else {
    console.error('\nFAIL  ', err);
  }
  process.exit(1);
}

# LifeLink user guide

LifeLink is crash detection and emergency response for a vehicle fleet. This
guide is for the people who drive the vehicles, the people who answer the
alerts, and the administrators who keep the trackers and accounts working.

The console has English and Tagalog text. This guide uses the English labels.

This guide is checked against the code in this repository. The tracker's
physical behaviour is described from the firmware and its host tests. The bench
run on a real unit is still pending, so section 2 says what is designed and
what has not been proven on hardware. Where a hardware claim has not been
bench-verified, the guide says so.

## 1. What LifeLink does

LifeLink has two layers:

- a tracker in the vehicle, built on an ESP32;
- a web console that responders and administrators use in a browser.

The tracker detects a crash and starts a local countdown. If the driver does
not cancel, the tracker sends an SMS to the configured phones and an HTTPS
incident report to the console. The console records the incident and shows it
to responders. A responder can send commands back to the tracker through the
console.

### The tracker

The tracker is a separate device. It keeps detecting and alarming when the
console is unavailable. It can send the SMS when it has power, a usable SIM and
mobile coverage.

| Part | Purpose |
| --- | --- |
| ESP32 DevKit V1 | Controller |
| MPU-6050 | Acceleration and tilt |
| SW-420 | Vibration confirmation |
| NEO-6M | GPS position |
| A7670E | 4G HTTPS and SMS |
| Buzzer | Countdown and alert |
| Cancel button | Driver stop during the countdown |
| SSD1306 panel (optional) | Setup and bench status, not a safety display |

The tracker sends a heartbeat every 30 seconds by default. A heartbeat carries
its last position, battery voltage when the sense divider is fitted, signal
strength, firmware version and the configuration revision it has applied.

Crash detection is always on while the tracker is powered. There is no arm or
disarm control.

An impact or a tilt starts a short confirmation step. The tracker then starts
the countdown and sends a `SUSPECTED` report to the console. If the countdown
expires, the tracker sends the SOS SMS and a `CONFIRMED` report, then retries
both on the configured interval until the alarm is acknowledged or stood down.

The GPS is not a condition for the SOS. If the tracker has no current fix, it
sends the last known position with the age of that fix.

The firmware runs a 120-second task watchdog with panic enabled. A loop or boot
phase that stops progressing resets the board. A watchdog reset is a full
reboot, so it ends a latched alarm the same way a power loss does: the unit
boots idle and the console must resolve the incident. The reset path is in the
firmware; the physical `TEST_WDT` bench step has not been run.

### The console

The console is the browser application in `apps/web`. It shows:

- the fleet dashboard and a schematic live map;
- the incident list, incident detail, evidence and timeline;
- vehicles and their assigned trackers;
- the alert log, delivery targets and emergency contacts;
- trackers, configuration, members, settings, audit and health for admins.

The console has three tenant roles:

| Role | Scope |
| --- | --- |
| Vehicle owner | Their own vehicles and incidents; can add, edit and archive their own vehicles and emergency contacts |
| CDRRMO / Pulis | The whole organisation fleet and every incident |
| Admin | The whole organisation, plus vehicles, contacts, trackers, members and settings |

A platform administrator has a separate console for organisation suspension.
On its own, that role is not a tenant role and does not grant access to fleet or
incident data.

### Two alert paths

The tracker sends two independent signals:

```text
Tracker ──── SMS ─────────────────────▶ vehicle contacts, then Settings fallback
   │
   └──── HTTPS incident report ───────▶ console ──── browser push ───▶ responders
             ▲                              │
             └──────── commands ────────────┘
```

The SMS path does not depend on the console. The HTTPS path does not depend on
the SMS. Either can arrive when the other fails.

The SMS goes only to the phone numbers configured for the tracker. The tracker
uses the vehicle's active emergency contacts first, up to two. If the vehicle
has no active contacts, it uses the first two organisation numbers from
Settings. It does not go to emergency services unless one of those numbers is
an emergency service. The console never sends the SOS SMS. The tracker sends it
from its own SIM.

### What is automatic

| Step | Automatic? | Notes |
| --- | --- | --- |
| Impact and tilt detection | Yes | The device filters potholes, door slams and hard braking |
| Countdown and buzzer | Yes | Starts when an impact is confirmed |
| SOS SMS | Yes, after the countdown | Sent by the tracker, not the server |
| HTTPS incident report | Yes, after the countdown | Retried until acknowledged or stood down |
| Incident record and timeline | Yes | Created when the report reaches the console |
| Alert rows | Yes | One row per routed phone and email target |
| Browser push | Yes, if configured | Only for confirmed incidents |
| Tracker command pickup | Yes | The tracker polls for commands |
| Retention deletion | Yes, daily | Telemetry and incidents older than the organisation periods are removed when the cron secret is configured |
| Call to emergency services | No | A person must make the call |
| Server-side SMS or email | No | No sender runs in this build |
| Acknowledge and resolve | No | A responder or admin decides |

### What is not automatic

- LifeLink does not call the police, the fire service, an ambulance or CDRRMO.
  A person must call local emergency services.
- The console does not dispatch a vehicle or an ambulance. It records the
  incident and shows it to the people who respond.
- The console does not send SMS or email. The tracker sends the SMS. Email
  addresses create alert rows, but no email sender is implemented.
- The console does not resolve an incident by itself. A responder acknowledges
  and resolves it.
- The console does not decide that an incident is a false alarm. The tracker
  must confirm a stand-down before the incident closes as a false alarm.
- Retention cleanup is a daily scheduled job, not an immediate delete when a
  record passes its cutoff.

### Known limits in this build

| Limit | Effect |
| --- | --- |
| No server SMS or email sender | New alert rows stay `Queued`. The tracker's own SMS is the SMS that reaches phones. |
| No battery-backed RTC | Device timestamps use GPS UTC. Without a fix, the console may fall back to receipt time and the send-time measurement is omitted. The RTC choice is still open (issue #106). |
| Watchdog reset not bench-verified | The 120-second task watchdog is in the firmware. The `TEST_WDT` reset has not been run on hardware. |
| Pin map and physical bench pending | The pin map, wiring, sensors, SMS delivery, power path and cancel behaviour are not proven for a particular unit until the bench checklist passes. |

### Bench status

The pure logic has host tests: false-positive filtering, the countdown, cancel,
retry, acknowledgement latch, faults, GPS quality, power bands and the SMS body.
The server and firmware configuration contract, the retention job, the vehicle
and contact flows, and the installable cache policy also have automated tests.

The following remain human bench work. The repository does not claim a result
for them:

- **Pin map and wiring:** the canonical map is in `pins.h` and
  [`wiring.md`](wiring.md). Power, continuity and sensor bring-up are checked on
  the physical unit.
- **Physical tracker run:** a synthetic impact, the countdown, the cancel
  button, SMS delivery, the acknowledgement silence and a power cut.
- **Watchdog reset:** build `env:esp32dev-bench` and follow the `TEST_WDT` step
  in [`hardware.md`](hardware.md). The default build refuses the test command.
- **RTC:** there is no battery-backed real-time clock yet. The module decision
  is issue #106. Until it is fitted, device times depend on GPS UTC.

Do not treat a tracker as commissioned until the checklist in
[`hardware.md`](hardware.md) passes.

## 2. Driver quick card

**If this is a real crash, call local emergency services first.** LifeLink is an
alerting aid. It does not replace that call.

### The countdown

After a confirmed impact, the tracker starts a countdown. The default is 15
seconds. The organisation can set it between 5 and 60 seconds. The buzzer
starts at confirmation, before any SMS.

There is no numeric countdown on a driver display. The beeps are the countdown.
The tracker also sends a `SUSPECTED` report to the console at the start, so a
responder may see the incident while the countdown is still running.

If the countdown expires, the tracker sends the SOS SMS and the HTTPS incident
report, then starts retrying.

### The buzzer and light

The patterns below are the firmware's patterns. The status LED is optional.

| Signal | Meaning |
| --- | --- |
| Short beep about once a second, LED blinking | Countdown is running |
| Long beep, 2 seconds on and 1 second off, LED solid | Alert sent, alarm latched |
| Slower beep, 1 second on and 5 seconds off, LED solid | More than 10 minutes in alert, still latched |
| Short confirmation beep, then quiet | Cancel accepted |

The alarm never goes silent on a timer. After ten minutes the beep slows down
to a reminder, but the alarm is still latched.

### The cancel button

- Press and release the cancel button once during the countdown. A normal firm
  press is enough. The tracker ignores a contact shorter than 50 milliseconds.
- Cancel works only during the countdown. A press after the alert starts does
  not stop the SMS.
- Press it immediately if it is a false alarm. The tracker reads the button
  between modem operations, so a slow mobile network can use up part of the
  countdown while the tracker is busy. Do not wait for the last seconds.
- The console shows the incident as `Cancelled` when the cancel report reaches
  it inside the server's cancel window. If the report arrives late, the console
  keeps the incident open and records a rejected cancel.
- Do not press cancel to silence a real crash. It is the false-alarm control,
  not a comfort control.

### After a real crash

1. Call local emergency services. LifeLink does not make that call.
2. If you are able and it is safe, stay with the vehicle and make yourself
   visible to traffic.
3. The tracker sends the SOS SMS to the configured phones after the countdown.
   It repeats the SMS and the HTTPS report every 60 seconds by default until
   someone at the console stops the alarm.
4. The console shows the incident. A responder can acknowledge it or stand it
   down, and either action can stop the tracker alarm once the tracker confirms.
5. Do not press cancel after the alert has started. The button does nothing
   then, and the console can still handle a false alarm.
6. If nobody comes, call your emergency contacts directly. The SMS includes a
   callback number, which is the first phone configured for the tracker.

### Limits

- LifeLink is not a substitute for emergency services.
- The SOS SMS needs an active SIM, SMS service and mobile coverage. The HTTPS
  report needs a data connection.
- The GPS may be stale or unavailable. The SMS then carries the last known
  position and the age of the fix.
- The alarm latches until someone at the console stops it or the unit loses
  power. There is no timed silence.
- A reboot, a watchdog reset or power loss ends the latch. The unit boots idle
  and does not resume the alarm. The console must resolve the incident manually.
- There is no persistent event queue. A failed alert is retried while the unit
  is alerting, but it is not replayed after a reboot.
- The buzzer and the SMS are only proven on a unit that has passed the bench
  checklist. Treat an unbenched unit as unverified.

## 3. Responder guide

This section is for the CDRRMO / Pulis responder role. An administrator creates
your account with an invitation link.

### Sign in

1. Open the console link your organisation gave you.
2. Enter your email and password, then select **Sign in**.
3. The header shows the organisation, your email and your role. Use the language
   switch for English or Tagalog.

The console rate-limits sign-in to five attempts per email and IP address in ten
minutes. If you see the rate-limit message, wait a few minutes. The session
lasts up to seven days unless you sign out. Sign out on a shared phone.

If the organisation is suspended, the login page says so. Only a platform
administrator can reinstate the organisation.

### Dashboard

The dashboard is the fleet overview. It shows:

- **Open incidents**: suspected, confirmed or acknowledged incidents.
- **Awaiting acknowledgement**: suspected and confirmed incidents, with the
  oldest wait.
- **Online trackers**: approved trackers seen recently.
- **Low battery**: approved trackers below 11.5 V.
- **Alerts, last 24 hours**: alert rows recorded in the last day, not proof of
  delivery.
- **Average time to acknowledge**: acknowledgements from the last 30 days.

The live positions panel is a schematic map, not a street map. It plots the last
fix of each vehicle relative to the others. Marker states are online, weak
signal, offline, stale fix and open incident.

The **Needs attention** queue lists suspected and confirmed incidents, oldest
first. An **Acknowledge** button appears only for a confirmed incident when you
have the acknowledgement permission. **Open incident** always opens the detail
page.

Below the queue are the fleet status list, recent activity and a 14-day incident
trend. The trend includes false alarms and cancelled incidents.

### Live map

The **Live map** page shows vehicle positions, tracker state and any open
incident.

- Search by plate, driver, model or tracker.
- Filter by all, online, offline, low battery or open incident.
- Select a vehicle to open its side panel and see the driver, tracker, battery,
  signal, speed, coordinates and fix time.
- **Fit all** returns the schematic view to the whole filtered fleet.

The positions are schematic. Use the vehicle's **Open map** link or the
incident's **Open in Maps** link when you need a street map. Those links open
OpenStreetMap in a new tab.

### Incidents list and filters

Open **Incidents** from the navigation. The list has status chips for suspected,
confirmed, acknowledged, resolved, cancelled and false alarm. Each chip shows a
count for the current search, severity and date filters.

You can filter by:

- search text: plate, driver, incident ID, or coordinates and a `lat, lng` pair;
- severity: critical, high, moderate or low;
- date range: all time, last 7, 14 or 30 days;
- status: the chips above.

Select **Apply** after changing the search, severity or date range. Select
**Clear filters** to reset the list. The list shows 25 incidents per page. On a
phone it switches to cards. Use the detected-time column or the mobile sort
control to switch between newest first and oldest first.

The **Alerts** column counts alert rows marked sent or acknowledged. It is not a
record of the tracker's own SMS. In this build no server sender runs, so a new
incident usually shows `0 / N` even when the tracker sent its SMS.

### Incident detail

Open an incident from the dashboard, the incident list, a vehicle, a
notification or a push alert. The detail page shows:

- the plate and current status, the detected time, the driver name, a **Call
  driver** link when a phone number is on record, and **Open in Maps** when a
  GPS fix is present;
- status and severity badges, with links to the vehicle and tracker;
- **Evidence**: an acceleration and tilt chart when the payload contains
  samples, plus peak acceleration, tilt, vibration count, speed and GPS age;
- the last position and its fix age, or a note that the payload had no GPS fix;
- **Timeline**: detection, the cancel-window close, cancellation, audit actions,
  device events, and the tracker send time when it is available;
- **Alert targets**: one row per routed phone and email, with channel, target,
  status and attempt count;
- **Actions**: acknowledge, resolve, false alarm and cancel controls, depending
  on the incident state and your permissions.

If the tracker supplied a send time, the timeline also shows **Tracker sent at**
the tracker clock time and **Console received** the delay in seconds. The send
time is captured when the countdown expires and is repeated unchanged on every
retry. It is GPS UTC, not network time, and it is absent without a GPS fix, so
no delay is shown then. The console hides the delay when the gap is negative or
longer than one hour because that points to a clock error, not a slow link.

The measured interval runs from the start of the alert to the receipt of the
first `CONFIRMED` report. It includes the SMS attempts that run before the
incident HTTP post. The send time is not the impact time; the detected time is
separate. A transmission-time test needs a GPS fix at dispatch.

The incident page does not embed a street map. It shows the coordinates and an
**Open in Maps** link. The **Live map** page is the schematic fleet view.

Severity is a display aid. It does not choose alert targets or escalation.
Critical is at least 4 g or 75 degrees, high is at least 3 g or 60 degrees,
moderate is at least 2.5 g or 45 degrees, and low is below those values.

#### Incident states

| State | Meaning |
| --- | --- |
| Suspected | The tracker reported the impact at the start of its countdown |
| Confirmed | The countdown expired and the alert was dispatched |
| Acknowledged by bureau | The tracker confirmed that the alarm stopped |
| Resolved | The response is finished and the incident is closed |
| Cancelled | The driver cancelled during the countdown |
| False alarm | The tracker confirmed a stand-down after dispatch, or an operator closed a driver-cancelled incident as a false alarm |

A suspected incident can stay suspected if the post-countdown report never
reaches the server. The SMS may still have gone out. Do not treat suspected as
harmless.

### Acknowledge and the tracker latch

Acknowledge tells the tracker that the bureau has taken over and asks it to
stop the latched alarm. It is not a read receipt.

1. Open a confirmed incident.
2. Select **Acknowledge**.
3. The console sends an `ACK_INCIDENT` command to the tracker and records the
   request. The command is valid for ten minutes.
4. The incident does not change to acknowledged yet. The page shows **Alarm
   latched, waiting for tracker**, and says the alarm keeps sounding until the
   tracker confirms.
5. While the acknowledgement is waiting, false alarm and cancel are
   unavailable. This prevents two contradictory commands from being in flight.
6. The tracker polls for commands every few seconds. If it is alerting and the
   command carries its own incident ID, it stops the buzzer, returns to idle and
   answers `acknowledged`. The console then changes the incident to
   **Acknowledged by bureau**.

If the tracker cannot confirm, the incident stays confirmed and the page says
**Tracker did not confirm**. The reason can be:

- `unknown_incident`: the tracker does not know this incident. This includes a
  tracker that rebooted or lost power and booted idle.
- expired: the tracker never collected the command within ten minutes.
- failed or unconfirmed: the tracker answered without confirming that the alarm
  stopped.

Use **Retry acknowledgement** after a failed or expired command. An admin may
use **Resolve without tracker** when the recovery conditions below are met.

The acknowledgement permission is on for responders and admins and off for
vehicle owners by default. A vehicle owner can work their own incident but does
not have the bureau acknowledgement permission.

The tracker alarm is latched. It has no timed exit. After ten minutes the buzzer
slows to a reminder, but it does not go silent. The retry ladder keeps sending
SMS and HTTPS reports until an acknowledgement or a confirmed stand-down
arrives.

### Resolve

Resolve closes an incident after the response is finished.

1. Open the incident after it is **Acknowledged by bureau**.
2. Enter an optional resolution note.
3. Select **Resolve**.

The incident becomes **Resolved** and the action is written to the audit log.

A confirmed device incident cannot be resolved before acknowledgement. The page
shows **Acknowledge before resolving**. Acknowledge first, then resolve.

#### Resolve without tracker confirmation

This is an admin recovery path for a tracker that cannot confirm the
acknowledgement. It appears only when all of these are true:

- the incident is device-backed and confirmed;
- the acknowledgement failed or expired, or the tracker answered
  `unknown_incident` or `unconfirmed`;
- no fresh acknowledgement command is still waiting for the tracker.

The form asks you to type `RESOLVE` and allows an optional note. Select
**Resolve without tracker** to close the incident. The action is audited as
`incident.resolved_unconfirmed` with the acknowledgement state and the last
command state.

This recovery does **not** stop the device. The tracker alarm may keep sounding
until the unit is powered off or acknowledges. That includes a tracker that
rebooted or lost power, booted idle and no longer knows the incident. Use this
path only when the tracker cannot be reached.

### Mark false alarm or cancel the incident

Both controls ask the tracker to stand down. They send the same `CANCEL_ALERT`
command, with a ten-minute lifetime. The difference is the intent recorded in
the audit log.

- Use **Mark false alarm** when you know the event was not a crash.
- Use **Cancel incident** when the immediate need is to stop the alarm.

The incident does not close immediately. It stays open while the command waits
for the tracker. The page shows **Cancel requested** or **False alarm
requested; waiting for tracker**. Acknowledge is unavailable until the tracker
answers this stand-down.

If the tracker answers `cancelled`, the command stops the alarm, the tracker
sends an all-clear SMS to its configured phones, and the console closes the
incident as **False alarm**. The resolution reads "False alarm confirmed by
tracker".

If the tracker answers `too_late`, `unknown_incident`, `failed`, an unconfirmed
reply, or nothing before the command expires, the incident stays open and the
page explains why. Check the tracker before treating the alarm as stopped.

A driver-cancelled incident can be marked as a false alarm locally. That path
does not send a command because the tracker already stopped itself.

On an incident that is already acknowledged, the tracker has stopped. A
stand-down may answer `too_late`, and the incident then stays acknowledged. Use
**Resolve** with a note to close it.

Only one command can wait for a tracker at a time. If an acknowledgement or
another stand-down is already pending, the console refuses a second command and
asks you to wait for the tracker to answer.

### Notifications and browser push

There are two different notification surfaces.

**The bell in the header** is the incident queue. It counts suspected and
confirmed incidents that are waiting for acknowledgement, oldest first, and
shows the five oldest. Select an incident to open it, or **View all incidents**
to open the list.

**The Notifications page** in the navigation is the delivery record and the
contact list. It is available to responders and admins. It shows the alert
policy, the organisation phone and email fallback, the alert log, and a
read-only list of the organisation's emergency contacts. Contacts are edited on
the vehicle's Settings tab. The alert log rows include the vehicle contacts that
were routed for each incident, plus the organisation fallback.

The Notifications page also states **Sender not connected**. No SMS, email or
HTTP sender runs in this build, so new alert rows stay `Queued`. Call emergency
services directly. The tracker's own SMS is separate from these rows.

#### Browser alerts

1. Open the bell in the header.
2. Under **Browser alerts**, select **Enable alerts**.
3. Allow notifications when the browser asks.
4. The panel says browser alerts are on for this device.

If the server has no push keys, the panel says **Push is not configured on this
server**. A deployment operator must add the VAPID keys.

Browser push is sent only for confirmed incidents. It goes to subscribed admins
and responders, plus the vehicle owner if they subscribed. The notification
carries the plate and a short sentence. It does not carry coordinates, the
driver's name, a phone number or evidence.

Select the notification to open the incident. On Android the notification also
has a **Cancel alert** action. That action does not cancel by itself. It opens
the incident with the **Cancel incident** control focused. On iPhone and iPad,
tap the notification to open the incident.

Select **Turn off** under Browser alerts to stop alerts on that browser. Signing
out also removes this browser's subscription. A revoked membership removes the
member's subscriptions.

### If you are a vehicle owner

A vehicle owner account sees **My vehicles** and only the incidents for those
vehicles. The owner can add, edit and archive their own vehicles and emergency
contacts. They can open incidents and resolve one after the bureau has
acknowledged it, but do not have the bureau acknowledgement permission by
default. The Trackers page, the organisation Settings page and the Notifications
page are not available to this role. The vehicle's own Settings tab is.

If you need to acknowledge alarms, use an account that has the acknowledgement
permission, normally a responder or admin.

## 4. Administrator guide

Administrators see the whole organisation. Only admins can open **Trackers**,
**Settings**, and the member, audit and health sections. A platform
administrator is separate and cannot use these pages without an organisation
membership.

### Trackers

Open **Trackers** in the navigation. The summary counts approved, pending,
offline, never seen and low-battery units.

#### Register a tracker

1. Select **Register tracker**.
2. Enter a label, the MAC address and, optionally, a vehicle.
3. Select **Register tracker** to submit.
4. Copy the device token from the result. It is shown once and cannot be shown
   again.
5. Enter that token on the tracker's setup page.

The MAC address accepts colons, hyphens, dotted groups or twelve hex digits and
is stored as six upper-case pairs separated by colons. A duplicate MAC is
refused.

A tracker registered from this console is approved immediately. Assign it to a
vehicle before you rely on it: an unassigned tracker can send heartbeats, but
its incident report is refused. The tracker detail page shows whether a vehicle
is assigned and lets you change it with **Edit tracker**.

#### Approve or reject a pending tracker

If a tracker is listed as **Pending approval**, it cannot send data until an
admin approves it.

- Select **Review** in the pending callout, or open the tracker.
- Select **Approve** or **Reject** on the detail page.
- On the list, select pending trackers and use **Approve selected** for a bulk
  approval. Only pending trackers on the current page are approved; the rest
  are reported as skipped.

Rejecting stops the unit from sending data until it is approved again.

#### Rotate a token

1. Open the tracker.
2. Under **WiFi setup**, select **Rotate token** and confirm.
3. Copy the new token. It is shown once.
4. Update the token on the tracker's setup page before the tracker needs to
   poll again.

The old token stops working immediately. The tracker still holds the old token
until you enter the new one, so it cannot authenticate in the meantime. Token
rotation is rate-limited to five rotations per admin per tracker in ten minutes.

#### WiFi setup

WiFi is for setup only. The A7670E remains the uplink for heartbeats, commands
and SOS. WiFi does not carry telemetry or alerts.

The **WiFi setup** panel shows:

- the setup network name, `LifeLink-` plus the last four hex digits of the
  tracker MAC;
- the Device ID, which is the tracker MAC;
- the setup address, `http://192.168.4.1`.

Setup steps:

1. Power on the tracker without holding either reset button. A tracker with no
   saved network opens the setup network by itself.
2. On the phone, join the `LifeLink-XXXX` network. It is open and has no
   password.
3. Open `http://192.168.4.1` in the phone browser. A captive-portal prompt may
   open it for you.
4. Pick a 2.4 GHz network or type its name. Enter the WiFi password, confirm the
   Device ID, and enter the device token.
5. Select **Connect and save**. The tracker tests the network and saves only
   after it joins. The setup network closes on its own.

The network test takes up to 20 seconds. A wrong password leaves the stored
credentials alone and keeps the page open with the reason. The setup network is
open, so anyone in radio range can load it while it is open. Do setup in a
controlled place. The portal closes after a verified save or after ten minutes.

The **Configured** or **Needs setup** badge comes from the last heartbeat, not a
live WiFi check. A tracker seen in the last five minutes is shown as configured.

#### Reset buttons

The reset buttons work only in the first 60 seconds after power-on. Power on
with the button released, wait five seconds, then press and hold.

| Control | Action |
| --- | --- |
| WiFi reset, GPIO 13 | Hold 5 seconds, then release. Clears the saved WiFi and restarts. The device ID and token are kept. |
| Factory reset, GPIO 14 | Hold 10 seconds. Clears WiFi, device ID, token and the provisioned marker, then restarts. |

The cancel button on GPIO 33 stays with the alert and never resets the tracker.
A button held from power-on does not arm the reset. The reset is disabled for
the rest of the boot once the alert state leaves idle.

#### Tracker commands

The tracker detail page has two command buttons. Each command is queued and
valid for ten minutes. The tracker picks it up on its next poll.

| Command | What it does |
| --- | --- |
| Locate now | Asks the tracker to send a heartbeat and position update |
| Test alert | Sounds the buzzer for about three seconds. It does not send an SMS or create an incident. |

Crash detection is always on. There is no Arm or Disarm control, and a direct
request for either command is refused. A watchdog reset ends a latched alarm
the same way a power loss does: the tracker reboots idle and the console must
resolve the incident.

#### Per-tracker configuration

The tracker detail page shows the effective six configuration fields and
whether each one comes from the organisation default or a per-tracker override.
The **Per-tracker configuration** form lets you override any field or return it
to the organisation default.

Select **Save and push** to record a configuration push. The page then shows
whether the tracker has confirmed the new revision:

- **No configuration pushed from this page**: no push from this page yet.
- **Pending device confirmation**: saved on the server, waiting for the tracker
  to echo the new revision.
- **Confirmed by the tracker**: the tracker reports the same revision.

The tracker applies a new configuration on a poll while it is idle. A value
outside the firmware range, or a fraction in a whole-number field, is rejected.
The whole object is rejected, never half-applied.

#### Event log and deletion

The tracker detail page has a **Connectivity** card, a **Firmware** card, a
command history and an **Event log**. Battery and ignition values are blank
until the voltage dividers are fitted and `kHasPowerSense` is enabled in the
firmware.

**Danger zone** deletes the tracker and its trips, samples and incidents. The
confirmation requires typing the tracker MAC. This cannot be undone.

### Vehicles and emergency contacts

The **Vehicles** page lists every vehicle, its driver, its tracker, the last
seen time and the vehicle status. A vehicle owner sees their own vehicles. An
admin sees the whole organisation.

#### Add a vehicle

Open **Add vehicle** on the Vehicles page. The form has:

- plate, make and model, which are required;
- year, VIN, driver name and driver phone, which are optional;
- an owner, for an admin only. The admin can leave it **Unassigned** or choose
  an active member of the organisation.

A vehicle owner does not see the owner field. A vehicle they add belongs to
them. A duplicate plate in the organisation is refused. Select **Add vehicle**
to save.

#### Edit a vehicle

Open the vehicle, select **Settings**, and use **Vehicle details**. An owner can
change the plate, make, model, year, VIN, driver name and driver phone on their
own vehicle. An admin can also reassign the owner to an active member or leave
the vehicle unassigned. Select **Save vehicle**. Every change is audited.

#### Emergency contacts

The vehicle **Settings** tab also has **Emergency contacts**. Select **Add
emergency contact** and enter a name, phone number, optional email and an
**Active** checkbox. A phone number must have 10 to 15 digits. The form rejects
a phone value already used by another contact in the organisation, and the alert
routing also removes local and international spellings of the same number.

- **Edit contact** changes the name, number, email or active state. Select
  **Save contact**.
- **Archive contact** keeps the row in the record and audit trail but stops it
  from receiving alerts.
- Only active contacts receive alerts. Re-open an archived contact and check
  **Active** to put it back on the list.
- Every contact change is audited.

The Notifications page has a read-only list of the organisation's contacts.
Edit them on the vehicle.

#### Alert routing order

The vehicle's active contacts are alerted first:

- The web alert queue creates a target row for each active vehicle contact,
  then for the organisation phone and email lists. Duplicates are removed and
  each channel is capped at 10 targets.
- The tracker's own SOS SMS uses the active vehicle contacts, at most two
  because the firmware keeps two slots. If the vehicle has no active contacts,
  it falls back to the organisation phone list. When vehicle contacts exist,
  the organisation numbers are not used for the tracker SMS.
- The first number in the tracker's list is the callback number in the SMS.

The organisation phone and email lists in Settings remain the fallback for
vehicles without contacts, and the web queue still includes them after the
vehicle contacts.

#### Maintenance and archive

**Maintenance mode** is a fleet marker. It does not stop crash detection or
alert delivery. The tracker and the alert path keep working while a vehicle is
in the workshop. Only an admin can change maintenance mode, and the change is
audited. A retired vehicle cannot be put in maintenance.

**Archive vehicle** moves the vehicle to `RETIRED`. It keeps the vehicle, its
incidents, trips and tracker history. It never hard-deletes a vehicle. The
archive action is available to the vehicle owner and to an admin, and it is
audited. A retired vehicle no longer offers the archive action.

To assign a tracker, open the tracker and use **Edit tracker**. The vehicle page
does not assign trackers.

### Members and invitations

Open **Settings**, then **Users and roles**.

#### Invite a member

1. Enter the email address and choose a role: Vehicle owner, CDRRMO / Pulis or
   Admin.
2. Select **Create invite link**.
3. Copy the link and send it to the person yourself. Email delivery is not
   configured.

The link is shown once, expires after seven days and works once. A newer link
for the same email replaces an older unused link.

The invitee opens the link and enters their name, a password and the password
confirmation. The password needs at least eight characters, including a letter
and a number. If the person already has a LifeLink account, they enter that
account's current password.

#### Revoke and re-invite

- **Revoke** soft-revokes the membership. The person stays on record, but their
  access stops on the next request. Their push subscriptions are removed.
- You cannot revoke your own membership.
- You cannot revoke the last active admin.
- **Re-invite** a revoked member with a new role. The new link resets the member
  to that role and clears old permission overrides.

The role permissions table on the page shows the role defaults. It is coarse: a
vehicle owner can work their own incidents but does not have the bureau
acknowledgement permission. Responders and admins have that permission by
default.

### Settings

Open **Settings** in the navigation. The tabs are Organization, Crash
thresholds, Data retention, Users and roles, Audit log and System health. The
Organization, Crash thresholds and Data retention tabs share one **Save
settings** button. Select it after a change.

#### Organization

- **Organization name**: shown in the console header.
- **Phone numbers**: one per line, international format. Numbers need 10 to 15
  digits after other characters are removed. Invalid lines are dropped. Up to
  20 numbers are kept. These are the organisation fallback numbers.
- **Email addresses**: one per line. Invalid addresses are dropped. Up to 20 are
  kept. Email rows are queued, but no sender is implemented.

The tracker uses the vehicle's active contacts first, up to two. It uses this
organisation list only when the vehicle has no active contacts. The first
number in the resolved list is also the callback number in the SOS SMS. Changes
reach the tracker on its next successful poll.

A number you remove can stay in the tracker's cache until a new number replaces
it or the unit is factory reset, so check the tracker after changing contacts.

#### Crash thresholds

| Field | Range | Default | What it controls |
| --- | --- | --- | --- |
| Impact threshold | 1.5 to 5.0 g | 2.5 g | Lower values are more sensitive |
| Tilt threshold | 30 to 90 degrees | 60 degrees | Tilt needed for a rollover |
| Confirm window | 100 to 2000 ms | 200 ms | Vibration and speed-drop confirmation |
| Cancel window | 5 to 60 seconds | 15 seconds | Driver countdown |
| Heartbeat interval | 10 to 300 seconds | 30 seconds | How often the tracker reports |
| SOS retry | 30 to 300 seconds | 60 seconds | How often SMS and HTTPS are retried |

The device rejects the whole configuration object if any field is outside its
range or a whole-number field contains a fraction. A bad save never half-applies.
The tracker applies the new values on a poll while it is idle. A countdown or an
active alert delays the change.

Per-tracker overrides are on the tracker detail page. A null override inherits
the organisation value.

#### Data retention

- **Telemetry retention**: default 30 days, range 1 to 3650.
- **Incident retention**: default 365 days, range 1 to 3650.

A daily cleanup enforces both periods per organisation:

- `GET /api/cron/retention` runs once a day at 18:15 UTC, which is 02:15 the
  next day in Asia/Manila. Vercel may start it within the 18:00 UTC hour, so
  treat it as a nightly window. The schedule runs on the production deployment;
  a preview deployment does not run it.
- Telemetry samples older than the telemetry period are deleted.
- Incidents older than the incident period are deleted with their alert rows.
  Device commands are kept, but their incident link is cleared.
- The job works in bounded batches of 5,000 rows, up to 20 batches per
  organisation and table per run. If the cap is reached, the response and audit
  row say `truncated: true` and the next daily run continues.
- Each run writes one `retention.cleanup` audit row per organisation with the
  cutoffs, configured days, deleted counts, batch counts, `dryRun` and
  `truncated`. It never writes personal data.

The job fails closed. `CRON_SECRET` must be set in the Vercel Production
environment and the project redeployed. A missing or blank secret returns `503`
and deletes nothing. A wrong `Authorization` header returns `401`. Vercel sends
the project's `CRON_SECRET` as the bearer token on scheduled runs.

An organisation without an `OrgSettings` row is skipped. Open Settings and save
once to create the row before relying on retention for that organisation.

##### Dry run and manual run

A dry run counts what would be deleted and deletes nothing. It writes the same
audit row with `dryRun: true`.

```bash
# Dry run: counts only.
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<production-host>/api/cron/retention?dryRun=1"

# Real cleanup.
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<production-host>/api/cron/retention"
```

The JSON response reports, per organisation, both cutoffs, the telemetry,
incident and alert-row counts, the batch counts and whether the run was
truncated. It does not return row contents, coordinates, phone numbers or the
secret.

### Audit log

Open **Settings**, then **Audit log**. Entries are newest first. Each row shows
the time, actor, action and target. The filter matches the action name, not the
actor or target, and accepts a partial value. For example, filter `settings.` to
see settings changes or `device.token` to see token rotations.

The log records operator and system actions such as:

- `incident.acknowledged`, `incident.ack_requested`, `incident.false_alarm`
- `incident.cancel_requested`, `incident.resolved`,
  `incident.resolved_unconfirmed`
- `device.created`, `device.approved`, `device.rejected`,
  `device.token_rotated`, `device.command_queued`
- `member.invited`, `member.invite_accepted`, `member.revoked`,
  `member.reinvited`
- `vehicle.created`, `vehicle.updated`, `vehicle.archived`,
  `vehicle.maintenance`
- `emergency_contact.created`, `emergency_contact.updated`,
  `emergency_contact.archived`
- `settings.updated`, `retention.cleanup`
- `platform.org_suspended`, `platform.org_reinstated`

The log is read-only. There is no delete or edit control.

### System health

Open **Settings**, then **System health**.

The page counts trackers as online, weak signal, offline or never seen. It also
shows pending device commands and queued alerts. The counts come from the
database on this request. Uptime and latency are not measured here.

Use the links to open the filtered tracker list or the incident list. Queued
alerts will not go down on their own in this build because no sender runs.

### Notifications page

The **Notifications** page is available to responders and admins. It shows:

- the sender warning, which states that no SMS, email or HTTP sender runs;
- the alert policy, including that severity is a display aid and that there is
  no escalation chain;
- the organisation phone and email fallback from Settings;
- the delivery log, filtered by status and channel;
- a read-only list of the organisation's emergency contacts. Edit contacts on
  the vehicle's Settings tab.

The log statuses are Queued, Sent, Failed and Acknowledged. Channels are SMS,
Email and HTTP. New rows stay Queued in this build. A row's target is the phone
number or email address, and its attempt count is the number of attempts
recorded on the row.

## 5. Install the console on a phone

LifeLink is installable. The installed console runs in its own window, opens
from a home-screen icon and keeps a small public offline shell. Installation
and the service worker require HTTPS, except on `localhost`.

Where the browser offers an install path, the dashboard shows a dismissible
banner. An admin also sees an install card at the top of **Settings**. Both
disappear when the console is already running as an installed app.

### Android with Chrome, Edge or Samsung Internet

1. Open the console and sign in.
2. Use **Install** on the dashboard banner, or on the Settings card if you are an
   admin.
3. If the browser does not show an install prompt, open the browser menu and
   choose **Install app** or **Add to Home screen**.
4. Confirm the prompt. Open the new icon. It opens the console in the current
   language, at the dashboard when you are signed in or at the login page.

### iPhone and iPad

1. Open the console in Safari. Safari is the only iOS browser that can add
   LifeLink to the Home Screen.
2. Safari does not show an install prompt. The dashboard banner, and the
   Settings card for admins, show **Add to Home Screen** instead.
3. Tap the Share button, scroll down and choose **Add to Home Screen**, then
   tap **Add**.
4. If you opened the site in Chrome, Firefox, Edge or an in-app browser on iOS,
   the banner, or the Settings card for admins, says **Open this site in Safari**
   because those browsers cannot install it.

Browser alerts on iPhone and iPad require the Home Screen app. Open the
installed icon, sign in, then use the bell, **Browser alerts** and **Enable
alerts**. Web push on iOS needs iOS 16.4 or later.

### Desktop

Use the install icon in the browser address bar, or the browser menu. If the
browser does not offer an install prompt, use the browser menu. An admin can also
check the Settings card for the install path.

### The install card and banner

- The dashboard banner has **Not now**, and **Install** when the browser can
  prompt. **Not now** hides it for 30 days.
- The admin Settings card has **Install** when the browser can prompt.
- Both surfaces hide when the console is running as an installed app.
- The installed icon opens `/`, which redirects to the visitor's language and
  then to the dashboard or login. It does not freeze English or Tagalog.

### Updates

When a new version is ready, the console shows **A new version is ready** with
**Reload** and **Later**. **Reload** activates the waiting service worker and
reloads the page once. **Later** dismisses the notice. The old version keeps
working until you reload.

### The offline page

Navigation is network-first. If the network request fails, the console serves
`/offline.html`. The page is branded, public, available in English and Tagalog,
and has a **Retry** link back to the console. It says that the screen contains no
live data.

The offline page is not an offline incident viewer. You cannot open, acknowledge
or resolve an incident while the phone has no connection, and the console does
not queue an action for later. Reconnect, then retry.

### Private data is never cached offline

Private console data is never cached:

- Only public static assets are cached: the Next.js build assets under
  `/_next/static/`, the icons, the manifest, the offline page and the brand
  marks.
- API responses, RSC payloads, HTML documents, authenticated pages, incident or
  vehicle data and cross-origin requests are never cached.
- The worker also refuses an allowlisted response when it is HTML, JSON, RSC,
  marked `no-store` or `private`, or is not a successful same-origin response.
- The offline page has no API call and no private data. It is the only console
  page stored on the device.
- This rule protects a shared phone after sign-out or an account switch. A
  cached incident page could show one user's data to the next person.

See [`pwa.md`](pwa.md) for the cache policy and update flow.

## 6. Privacy and data

### What is stored

LifeLink stores the data it needs to alert and to explain what happened:

- account name, email address and password hash;
- organisation membership and role;
- vehicle plate, make, model, year, VIN when present, driver name and driver
  phone;
- emergency contacts, including their name, phone, optional email and the
  vehicle they belong to;
- tracker MAC, label, approval status, token hash, firmware version and
  hardware variant;
- last position, speed, battery voltage, signal strength, satellites, ignition
  state and configuration revision;
- trips and telemetry samples;
- incidents, including peak acceleration, tilt, vibration count, speed,
  coordinates, GPS age, evidence samples, status, resolution and the tracker
  send time when supplied, plus timeline entries built from audit and device
  event rows;
- alert targets, alert delivery rows, device commands and device events;
- audit rows, invitation token hashes and push subscriptions;
- browser push endpoints and their encryption keys.

### Who can see it

Access is scoped to the organisation that owns the vehicle.

| Role | Can see |
| --- | --- |
| Vehicle owner | Their own vehicles, those vehicles' incidents, and those vehicles' emergency contacts |
| CDRRMO / Pulis | The whole organisation fleet and every incident |
| Admin | The whole organisation, plus vehicles, contacts, members, trackers, settings, audit and health |
| Platform administrator | Organisation records and suspension status. On its own, this role does not open the tenant fleet or incident pages. |

Members of other organisations cannot see your vehicles or incidents in the
console. A role change or a revoked membership takes effect on the next request.
A suspended organisation resolves to no session on the next request. The
platform administrator is not a tenant role.

### Retention

The retention values are in Settings:

- telemetry, default 30 days;
- incidents, default 365 days.

A daily cleanup enforces both periods. Telemetry samples and incidents older
than the configured period are deleted automatically. Incidents are deleted
with their alert rows, and their device commands lose the incident link. The job
is bounded and records counts in the audit log. See the retention section above
for the `CRON_SECRET` requirement and the dry run.

Incident evidence is kept for the configured period because it may be needed
for insurance or legal review.

Deleting a tracker removes its trips, samples and incidents. A vehicle is
archived as `RETIRED`, not deleted, and the console has no delete control for an
account.

### Device and invitation tokens

The server never stores a device token in plain text. It stores a SHA-256 hash
of the token. The plaintext token starts with `llk_` and is shown once when the
tracker is registered or its token is rotated. A leaked database row cannot be
used to impersonate a tracker. The old token stops working immediately when it
is rotated.

Invitation tokens are also stored as SHA-256 hashes. They are single use and
expire after seven days. The plaintext exists only in the link shown to the
admin who created it. It is not written to the audit log.

Passwords are stored as bcrypt hashes. The console uses a signed, HttpOnly
session cookie. The cookie is not readable by page scripts.

### SMS, push and location

- The SOS SMS contains the plate, the last position and its age, the speed and,
  when configured, a callback number. It goes to the vehicle's active emergency
  contacts first, or to the organisation phone fallback when the vehicle has
  none. SMS is not end-to-end encrypted, so the mobile carrier and the recipient
  can read it.
- Browser push carries the plate and a short sentence, plus the incident link.
  It does not carry coordinates, the driver's name, a phone number or evidence.
  The push service and the lock screen can see what is in the notification.
- Location and contact details are personal data. The console scopes them to the
  organisation and, for a vehicle owner, to their own vehicles and contacts.
- Audit rows record who changed an incident, a vehicle, a contact, a member, a
  tracker or a setting, and each retention cleanup.

## 7. Troubleshooting

| Symptom | What it means | What to do |
| --- | --- | --- |
| Browser alerts say push is not configured | The server has no valid VAPID keys | A deployment operator must set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, then rebuild and redeploy. The public key is inlined at build time. Generate a keypair with `pnpm vapid`. Rotating keys invalidates every existing subscription. |
| Browser alerts are blocked or never arrive | Permission is denied, the browser is unsupported, or the subscription was removed | Allow notifications for the site in browser settings, then enable alerts again. On iPhone or iPad use the Home Screen app. Signing out or revoking a member removes subscriptions. Push is sent only for confirmed incidents. |
| A tracker shows offline | The server has not received a heartbeat for about five minutes | Check power, the backup battery, the SIM and APN, and the antenna. A tracker with power, a usable SIM and coverage may still detect an impact and send an SMS on its own. The console cannot prove it is working or dead. |
| Acknowledge stays pending | The command is waiting for the tracker, or the tracker is offline | Wait for the next command poll. If the command expires after ten minutes, select **Retry acknowledgement**. If the tracker rebooted, it boots idle and answers `unknown_incident`; an admin may use **Resolve without tracker**. The alarm may still sound until the device is powered off or acknowledges. |
| Resolve is unavailable | A device-backed confirmed incident must be acknowledged first | Acknowledge the incident, wait for the tracker to confirm, then resolve. An admin recovery control appears only after the acknowledgement expired, failed, or came back unknown or unconfirmed. |
| A command expired | The tracker did not collect it within ten minutes | Open the incident or tracker and send the command again once the tracker is back. Commands are not replayed after expiry. |
| False alarm or cancel did not close the incident | The tracker answered `too_late`, `unknown_incident`, `failed`, an unconfirmed reply, or never collected the command | The incident stays open on purpose. Check the tracker. Retry after an expired command. Do not tell anyone the alarm stopped until the tracker confirms. |
| The organisation is suspended | The tenant is disabled at the organisation level | Contact the service operator. Only a platform administrator can reinstate the organisation. A tenant admin cannot. |
| You see the offline page | The phone has no connection | Reconnect and open the page again. The console does not show cached incident data and does not queue an acknowledgement or resolve action. |
| No install button appears | The browser cannot prompt, the site is on plain HTTP, or the console is already installed | Use HTTPS. On iPhone or iPad open the site in Safari and use Share, then Add to Home Screen. On desktop use the browser menu or address-bar install icon. The Settings card names the available path. |
| A new version is ready but you do not see it | A waiting service worker is serving the old page until you reload | Select **Reload** in the update prompt. If you dismissed it, reload the page and the prompt returns while the new worker is waiting. |
| No SOS SMS arrived | The tracker may have no SIM service, no coverage, no active contact, or a failed modem call | Check the tracker power and SIM. Check that the vehicle has an active emergency contact or that Settings has a valid fallback phone. The tracker uses up to two contacts first, then the organisation fallback. The console cannot send the SMS for it. |
| An emergency contact did not get an alert | The contact is archived, the phone has no service, or the vehicle has other contacts that filled the two tracker slots | Check the contact is **Active**, the number has 10 to 15 digits, and the vehicle assignment is correct. The tracker uses at most two contacts. The web alert queue also creates email rows, but no sender runs. |
| The console has no incident but someone received an SOS SMS | The SMS path worked and the HTTPS report did not | Act on the SMS. Ask for the plate, position and fix age. The console cannot show an incident that never reached the server. |
| An incident stays suspected | The tracker reported the impact at the countdown start and the post-countdown report did not arrive | Treat it as live until you know otherwise. Call the driver if a number is shown, and check the tracker. The SMS may still have gone out. |
| No tracker send time or console delay is shown | The tracker had no GPS fix at dispatch, or the gap is negative or over one hour | Treat the missing measurement as unknown, not zero. The detected time is still on the incident. A transmission-time test needs a GPS fix. |
| Retention did not delete old data | The cron is disabled, the secret is missing, the organisation has no settings row, or the run hit its batch cap | Check `CRON_SECRET` in Vercel Production and redeploy. A missing secret returns `503` and deletes nothing; a wrong header returns `401`. Save Settings once for the organisation. Check the `retention.cleanup` audit rows and the Cron Jobs log. If the response says `truncated: true`, the next daily run continues. |
| You cannot sign in | The email or password is wrong, the membership was revoked, or the login rate limit was hit | Check the credentials. Wait ten minutes after five failed attempts. A revoked membership fails like a wrong password. Ask an admin to re-invite you if the membership was revoked. |
| A tracker is approved but reports no incidents | A common cause is an unassigned tracker. Check the assignment and the last heartbeat before assuming the unit is faulty. | Open the tracker and use **Edit tracker** to assign a vehicle. The incident route refuses an unassigned tracker. |

## 8. One-page quick card

Print this section and keep a copy in the vehicle and at the response desk.

### Driver

- **Real crash:** call local emergency services first.
- **Fast beeps:** countdown, usually 15 seconds.
- **False alarm:** press the cancel button once, immediately.
- **After the alert starts:** the cancel button does not stop the SMS.
- **Long beep, solid light:** alert sent and latched. It keeps retrying.
- **After 10 minutes:** slower beep, still latched, never silent.
- **The SMS goes to the vehicle's active contacts first, then the organisation
  fallback. It does not go to emergency services.**
- **Power loss, reboot or watchdog reset:** the alarm stops, the unit boots
  idle, and the console must resolve the incident.
- **LifeLink is an aid, not a replacement for emergency services.**

### Responder

1. Open **Incidents** or the **Needs attention** queue.
2. Open the confirmed incident. Check the plate, driver, time, evidence and
   position. If shown, the tracker send time and console delay measure the link;
   no GPS fix means no measurement.
3. Call the driver if a number is shown. Call emergency services if needed.
4. Select **Acknowledge**. Wait for **Alarm latched, waiting for tracker** to
   clear. The tracker must confirm before the status changes.
5. If the tracker does not confirm, retry after the command expires. An admin
   may resolve without tracker confirmation when the alarm cannot be reached.
6. When the alarm has stopped, add a resolution note and select **Resolve**.
7. False alarm on a live alarm: select **Mark false alarm** or **Cancel
   incident**. The incident closes only when the tracker confirms the stop.
8. Browser alerts: bell, **Browser alerts**, **Enable alerts**. The notification
   opens the incident; the Android action does not cancel by itself.

### Administrator

- **Vehicles:** add or edit, add active emergency contacts, archive as
  `RETIRED`. Contacts are alerted first; the tracker uses at most two.
- **Trackers:** register, copy the token once, assign a vehicle, approve pending
  units.
- **Rotate token:** copy the new token and update the tracker immediately. The
  old token stops working at once.
- **WiFi setup:** join `LifeLink-XXXX`, open `192.168.4.1`, use a 2.4 GHz
  network. WiFi is setup only; 4G carries alerts.
- **Health:** check offline trackers, pending commands and queued alerts.
- **Detection is always on. There is no Arm or Disarm.**
- **Retention:** runs nightly. Set `CRON_SECRET` in Vercel Production, redeploy
  and dry-run with `?dryRun=1` before a real run.
- **Bench:** pin map, watchdog reset, RTC #106 and the hardware checklist are
  not verified until the physical bench passes.

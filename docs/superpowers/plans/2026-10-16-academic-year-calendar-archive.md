# DavomatOne Academic Year, Archive and Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DavomatOne’ni ko‘p yillik ishlaydigan tizimga aylantirish: sinflarni promotion sanasida avtomatik keyingi bosqichga o‘tkazish, 11-sinflarni o‘quvchi va davomat tarixini saqlagan holda arxivlash, yangi 5-sinflarni yangi oqim sifatida qo‘shish va davomat/statistika/bildirishnomalarni haqiqiy o‘qish kunlari bilan bog‘lash.

**Architecture:** Mavjud bitta `Code.gs` arxitekturasi saqlanadi. Yangi ma’lumotlar `ACADEMIC_YEARS`, `CLASS_HISTORY`, `CALENDAR` jadvallarida saqlanadi; mavjud jadvallar additive schema migratsiyasi bilan kengayadi. Barcha sana qarorlari `isSchoolDay_(dateKey)` orqali, sinf hayot sikli esa `processAcademicYearMaintenance_()` orqali markazlashtiriladi.

**Tech Stack:** Google Apps Script V8, Google Sheets, Telegram Bot API, Node.js VM-based regression tests, `LockService`, `ScriptApp` time-based triggers.

**Spec:** `docs/superpowers/specs/2026-10-15-academic-year-calendar-archive-design.md`

## Global Constraints

- `class_id`, `student_id`, Telegram user ID va mavjud `ATTENDANCE` satrlari destructive migratsiyada o‘zgarmaydi.
- `class_id` 5→11 promotion davomida barqaror qoladi; faqat `class_name` o‘zgaradi.
- 11-sinf va uning o‘quvchilari o‘chirilmaydi; arxiv/graduation maydonlari bilan inactive qilinadi.
- Yangi 5-sinf eski bitirgan `class_id`ni qayta ishlatmaydi.
- Standart o‘qish haftasi dushanba–juma; shanba/yakshanba default dam olish kuni.
- `WORKDAY` `VACATION`/`HOLIDAY`dan ustun, lekin o‘quv yili tashqarisidagi sanani dars kuniga aylantirmaydi.
- Barcha sana hisoblari `Asia/Tashkent` timezone’da bajariladi.
- Bir vaqtning o‘zida ko‘pi bilan bitta `ACTIVE` o‘quv yili bo‘ladi.
- O‘quv yili validatsiyasi: `start_date <= end_date <= promotion_date`; o‘quv yil date-range’lari kesishmaydi.
- `processAcademicYearMaintenance_()` promotion va activationni idempotent bajaradi va global `LockService` bilan himoyalanadi.
- Mavjud tez davomat (`Keldi` default, faqat kelmaganlarni belgilash) saqlanadi.
- Yangi dependency, ENV yoki tashqi API qo‘shilmaydi.
- Customer-facing bot matnlarida ichki implementation terminlari ko‘rsatilmaydi.
- Runtime repo’da dead code, eski fallback yoki yashirilgan duplicate flow qoldirilmaydi.

## Review Focus

- Qarama-qarshi `WORKDAY` + `VACATION/HOLIDAY` bir sanaga tushsa `WORKDAY` g‘olib bo‘lishi, lekin yil tashqarisida baribir `false` bo‘lishi — Task 2 testi bilan pin qilinadi.
- Promotion qisman bajarilib qayta chaqirilsa sinf ikkinchi marta oshib ketmasligi va bitiruvchilar takror arxivlanmasligi — Task 4 idempotency testi bilan pin qilinadi.
- `5-A`, bo‘sh yoki noto‘g‘ri sinf nomi boshqa sinflar promotionini to‘xtatmasligi va reportga tushishi — Task 4 invalid-name testi bilan pin qilinadi.
- Statistika intervali ikki o‘quv yilini kesib o‘tsa har sana o‘z `academic_year_id` va `CLASS_HISTORY` nomi bilan hisoblanishi — Task 5 multi-year testi bilan pin qilinadi.
- Eski `ATTENDANCE.academic_year_id` bo‘sh satrlar setupdan oldin taxminan to‘ldirilmasligi, setupdan keyin faqat mos date-range bo‘yicha backfill qilinishi — Task 3 migration testi bilan pin qilinadi.

---

### Task 1: Additive schema migration and data model

**Files:**
- Modify: `Code.gs` — `Config.gs`, `Sheets.gs`, `Setup.gs` sections
- Create: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: existing `SHEETS`, `SHEET_HEADERS`, `getSheet_()`, `getRowsAsObjects_()`, `appendObjectRow_()`, `updateObjectRow_()`.
- Produces: `mergeHeaders_(currentHeaders, expectedHeaders) -> string[]`, `ensureSheetSchema_(sheetName, expectedHeaders)`, expanded `ensureSchema_()` and the new table/column constants used by all later tasks.

- [ ] **Step 1: Write the failing schema regression tests**

In `tests/academic-year-calendar.test.js`, assert that:
- `SHEETS.ACADEMIC_YEARS`, `SHEETS.CLASS_HISTORY`, `SHEETS.CALENDAR` exist;
- expected headers exactly include the spec columns;
- `CLASSES` gains `start_year_id`, `archived_year_id`, `archived_at`;
- `STUDENTS` gains `graduated_year_id`, `graduated_at`;
- `ATTENDANCE` gains `academic_year_id`;
- `mergeHeaders_(['class_id','class_name'], ['class_id','class_name','active'])` returns `['class_id','class_name','active']` without reordering existing columns.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node tests/academic-year-calendar.test.js`

Expected: FAIL because new sheet constants/headers and `mergeHeaders_()` do not exist.

- [ ] **Step 3: Implement the schema primitives in `Code.gs`**

Add exact tables/headers from the spec and implement:
- `mergeHeaders_(currentHeaders, expectedHeaders)` — preserve existing order, append only missing headers;
- `ensureSheetSchema_(sheetName, expectedHeaders)` — create missing sheet/header row or append missing columns only;
- update `ensureSchema_()` to call `ensureSheetSchema_()` for every schema entry and never reject valid existing sheets merely because new optional columns are absent.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js`

Expected: schema tests PASS and existing JS parses under V8-compatible Node syntax.

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: add academic year schema migration"
```

### Task 2: Academic-year validation and single school-day engine

**Files:**
- Modify: `Code.gs` — new academic-year/calendar core section
- Modify: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: Task 1 schema constants and existing date formatting conventions.
- Produces: `validateAcademicYearInput_(input)`, `findAcademicYearForDateFromRows_(years, dateKey)`, `resolveSchoolDayFromRows_(years, calendarRows, dateKey) -> boolean`, `isSchoolDay_(dateKey) -> boolean`, `enumerateSchoolDays_(startDate, endDate) -> string[]`.

- [ ] **Step 1: Add failing pure tests for academic-year/date rules**

Assert:
- valid `2026-09-02 <= 2027-05-25 <= 2027-06-01` passes;
- inverted dates reject;
- overlapping year ranges reject when adding a year;
- Monday–Friday inside an academic year are `true` by default;
- Saturday/Sunday inside the year are `false` by default;
- weekday `VACATION`/`HOLIDAY` returns `false`;
- weekend `WORKDAY` returns `true`;
- same-date `WORKDAY` plus `VACATION` returns `true`;
- `WORKDAY` outside all academic years returns `false`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node tests/academic-year-calendar.test.js school-day`

Expected: FAIL with missing validation/school-day functions.

- [ ] **Step 3: Implement the pure engine and Sheet-backed wrapper**

Implement the signatures above. `resolveSchoolDayFromRows_()` must be deterministic and side-effect free; `isSchoolDay_()` loads `ACADEMIC_YEARS` and active `CALENDAR` rows then delegates to it. `enumerateSchoolDays_()` iterates inclusive date keys and uses `isSchoolDay_()`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js school-day`

Expected: all Task 2 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: add academic calendar engine"
```

### Task 3: Initial academic-year setup, history snapshots and attendance backfill

**Files:**
- Modify: `Code.gs` — academic-year setup/history helpers
- Modify: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: Task 1 schema, Task 2 date/year lookup.
- Produces: `createAcademicYear_(actor, input)`, `initializeCurrentAcademicYear_(actor, yearId)`, `ensureClassHistorySnapshot_(classRow, academicYearRow)`, `syncCurrentClassHistoryTeacher_(classId, teacherTelegramId)`, `backfillAttendanceAcademicYear_(academicYearRow)`.

- [ ] **Step 1: Add failing setup/migration tests**

Using in-memory row fixtures, assert:
- creating a duplicate `year_id` rejects;
- a second `ACTIVE` year rejects;
- before initialization, blank attendance `academic_year_id` stays blank;
- initialization sets existing active classes’ `start_year_id` only when missing;
- one snapshot per `(class_id, academic_year_id)` is created, rerun creates no duplicate;
- attendance dates inside the initialized year receive that year ID while dates outside stay blank;
- teacher claim/release sync changes only the current year history row.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/academic-year-calendar.test.js setup`

Expected: FAIL on missing setup/history functions.

- [ ] **Step 3: Implement current-year initialization and backfill**

Keep initialization idempotent. Do not infer historic years before a year is explicitly created/initialized. `ensureClassHistorySnapshot_()` must preserve `class_id`, class name, grade/section, teacher and `active_from` from the chosen year.

- [ ] **Step 4: Integrate teacher claim/release with history**

Modify existing `claimClass_()` and `releaseOwnClass_()` so a teacher change updates `CLASS_HISTORY.teacher_telegram_id` for the currently active academic year only. Preserve current permission and locking behavior.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js setup`

Expected: all setup/backfill/history tests PASS.

- [ ] **Step 6: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: initialize academic year history"
```

### Task 4: Promotion, graduation, planned-year activation and archive lifecycle

**Files:**
- Modify: `Code.gs` — lifecycle core
- Modify: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: Tasks 1–3 schema/year/history APIs and existing `resolveActor_()`, `listActiveClasses_()`, row update helpers.
- Produces: `parseClassStage_(className) -> {grade:number, section:string}|null`, `nextClassName_(className) -> string|null`, `activatePlannedAcademicYears_(todayKey)`, `promoteAcademicYear_(academicYearRow, todayKey)`, `processAcademicYearMaintenance_()`, `buildPromotionReport_(result)`.

- [ ] **Step 1: Add failing lifecycle tests**

Assert:
- `5-01 -> 6-01` and `10-03 -> 11-03`;
- `11-01` returns graduation, not a new class name;
- `5-A`/empty invalid names are skipped and listed in `invalidClasses` while valid neighbors still promote;
- promotion keeps `class_id`, teacher and student class links for grades 5–10;
- grade 11 sets `CLASSES.active=false`, archives class, marks active students inactive with graduation year/time, clears teacher-class ownership and makes that teacher resolve as `UNASSIGNED`;
- second promotion call after `promoted_at` produces zero additional changes;
- partially already-promoted row state is not promoted twice;
- a planned class with `start_year_id=<planned>` stays hidden/inactive before start date and becomes active on the year start date;
- activation creates one history snapshot and is idempotent.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/academic-year-calendar.test.js lifecycle`

Expected: FAIL on missing lifecycle functions.

- [ ] **Step 3: Implement pure class-name parsing and transition rules**

`parseClassStage_()` accepts only numeric `GRADE-SECTION` needed by the spec; `nextClassName_()` preserves section text exactly and returns `null` for grade 11.

- [ ] **Step 4: Implement activation and promotion under `LockService`**

`processAcademicYearMaintenance_()` obtains a script lock, activates due planned years/classes, promotes only a due unpromoted year, writes history status/`active_to`, archives/graduates grade 11, writes `promoted_at`, and always releases the lock in `finally`.

- [ ] **Step 5: Add admin promotion report dispatch**

Implement `notifyAdminsAcademicYearReport_(report)` to message SUPER ADMIN plus active ADMIN users once after an actual promotion. Include promoted count, graduated classes, graduated student count and invalid class names; send nothing when maintenance makes no transition.

- [ ] **Step 6: Run lifecycle tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js lifecycle`

Expected: all lifecycle/idempotency/invalid-name tests PASS.

- [ ] **Step 7: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: add class promotion and graduation lifecycle"
```

### Task 5: Make attendance, range statistics and notifications calendar-aware

**Files:**
- Modify: `Code.gs` — Attendance, Statistics, notification sections
- Modify: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: `isSchoolDay_()`, `enumerateSchoolDays_()`, academic-year lookup and `CLASS_HISTORY` from Tasks 2–4.
- Produces: calendar-aware `saveAttendance_()`, range-statistics model with historical names, calendar-aware `processNotifications_()`.

- [ ] **Step 1: Add failing integration tests**

Assert:
- new attendance saved on a school day gets matching `academic_year_id`;
- write attempt on non-school day rejects while historical read remains possible;
- range model uses every real school day even when nobody submitted attendance that day;
- a real school day with zero submissions marks every applicable class missing;
- `VACATION/HOLIDAY` days do not add missing counts;
- multi-year interval uses each date’s own year and `CLASS_HISTORY.class_name` instead of current `CLASSES.class_name`;
- archived/graduated classes remain visible in their historic year statistics;
- notification processor returns without sends and without changing `last_notification_date` on non-school days.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/academic-year-calendar.test.js integrations`

Expected: FAIL because current stats derive active dates from attendance rows and notifications do not yet use academic calendar rules.

- [ ] **Step 3: Update attendance writes**

Before new save, require `isSchoolDay_(dateKey)` and resolve the matching academic year; write `academic_year_id` on all inserted/updated attendance rows. Keep old attendance history readable regardless of current school-day status.

- [ ] **Step 4: Replace range-statistics day discovery**

Change the range model to enumerate calendar school days, map each date to the proper academic year, resolve class snapshots from `CLASS_HISTORY`, and calculate submitted/missing status per historical class/date. Do not use “dates that appear in ATTENDANCE” as the school-day source.

- [ ] **Step 5: Gate notifications with `isSchoolDay_()`**

At the start of `processNotifications_()`, return before any recipient processing when today is not a school day; do not mutate `last_notification_date` in that path.

- [ ] **Step 6: Run integration tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js integrations`

Expected: attendance/statistics/notification cases PASS including multi-year history.

- [ ] **Step 7: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: make attendance stats reminders calendar aware"
```

### Task 6: Add Telegram academic-year and archive administration

**Files:**
- Modify: `Code.gs` — UI and routing sections
- Modify: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: Tasks 3–5 academic-year/history lifecycle APIs and existing `setPendingAction_()`, `handleText_()`, `handleCallback_()`.
- Produces: `showAcademicYearMenu_(chatId, actor)`, `showCurrentAcademicYear_(...)`, `showAcademicYearArchive_(...)`, `showArchivedYear_(...)` and pending flows for year creation/promotion-date edits/initial setup.

- [ ] **Step 1: Add failing routing/UI tests**

Assert source/routing contains admin-only flows for:
- `O‘quv yili` main menu;
- current year;
- new year setup with `title`, `start_date`, `end_date`, `promotion_date` collection;
- promotion date edit only before promotion;
- class status;
- archive year selection and read-only archived details;
- SUPER ADMIN initial current-year setup flow;
- planned 5-sinf creation target selection (`ACTIVE` vs `PLANNED` year).

Also assert TEACHER/UNASSIGNED cannot invoke these admin callbacks.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/academic-year-calendar.test.js academic-ui`

Expected: FAIL on missing routes/menu helpers.

- [ ] **Step 3: Extend admin reply keyboard and academic-year inline menus**

Add `O‘quv yili` for ADMIN/SUPER ADMIN only. Keep the existing customer-facing menu simple; archive screens are read-only and must never expose implementation terminology.

- [ ] **Step 4: Implement pending-input flows and validation messages**

Use existing pending-action pattern. Reject malformed dates, overlapping years, duplicate year IDs, post-promotion date edits, and any archive mutation attempt with user-facing Uzbek messages.

- [ ] **Step 5: Extend class creation for current/planned academic year**

New active-year 5-sinf: `active=true`, new numeric `class_id`, `start_year_id=<ACTIVE>` and immediate history snapshot. Planned-year 5-sinf: `active=false`, new numeric `class_id`, `start_year_id=<PLANNED>`; it must not appear in normal class/teacher selection until activation.

- [ ] **Step 6: Run UI/routing tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js academic-ui`

Expected: role, validation, archive-read-only and planned-class visibility tests PASS.

- [ ] **Step 7: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: add academic year admin flows"
```

### Task 7: Add Telegram calendar management

**Files:**
- Modify: `Code.gs` — calendar CRUD/UI routes
- Modify: `tests/academic-year-calendar.test.js`

**Interfaces:**
- Consumes: Task 2 school-day engine and existing admin authorization/pending-action APIs.
- Produces: `addCalendarEvent_(actor, input)`, `deactivateCalendarEvent_(actor, eventId)`, `showCalendarMenu_(chatId, actor)`, `showCalendarEvents_(...)`.

- [ ] **Step 1: Add failing calendar-admin tests**

Assert:
- only ADMIN/SUPER ADMIN can create/delete events;
- event `start_date <= end_date` is required;
- supported types are exactly `VACATION`, `HOLIDAY`, `WORKDAY`;
- one-day event accepts same start/end;
- event deletion uses soft deactivate and does not alter attendance rows;
- after deactivate, `isSchoolDay_()` recalculates from remaining active events.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/academic-year-calendar.test.js calendar-ui`

Expected: FAIL because calendar admin helpers/routes do not exist.

- [ ] **Step 3: Implement calendar CRUD and `Taqvim` admin UI**

Expose `Ta’til qo‘shish`, `Dam olish/Bayram qo‘shish`, `Ish kuni qo‘shish`, `Taqvimni ko‘rish`, `O‘chirish`. Collect start date, end date, title through the existing pending-action mechanism.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tests/academic-year-calendar.test.js calendar-ui`

Expected: authorization, validation, precedence-after-delete tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "feat: add school calendar admin controls"
```

### Task 8: Triggers, compatibility entry points and full regression verification

**Files:**
- Modify: `Code.gs` — Setup/trigger helpers
- Modify: `tests/academic-year-calendar.test.js`
- Verify only: `appsscript.json`

**Interfaces:**
- Consumes: `processNotifications_()` and `processAcademicYearMaintenance_()`.
- Produces: `installDavomatTriggers()`, compatibility `installNotificationTrigger()` delegating to the unified installer or preserving existing notification-only behavior without duplicate triggers.

- [ ] **Step 1: Add failing trigger-idempotency tests**

With mocked `ScriptApp.getProjectTriggers()`, assert:
- zero existing triggers creates one 5-minute `processNotifications_` trigger and one daily `processAcademicYearMaintenance_` trigger;
- rerunning installer creates no duplicates;
- one existing trigger creates only the missing sibling;
- legacy `installNotificationTrigger()` remains callable for deployments already following the prior setup instructions.

- [ ] **Step 2: Run and confirm RED**

Run: `node tests/academic-year-calendar.test.js triggers`

Expected: FAIL until unified installer/compatibility wrapper exists.

- [ ] **Step 3: Implement idempotent trigger installation**

Implement `installDavomatTriggers()` with exact handler-name checks. Keep `processNotifications_()` on its existing 5-minute cadence and add one daily maintenance trigger in project timezone. Do not change `appsscript.json` timezone from `Asia/Tashkent`.

- [ ] **Step 4: Run the complete regression suite**

Run: `node tests/academic-year-calendar.test.js`

Expected: all schema, school-day, setup, lifecycle, integration, academic UI, calendar UI and trigger tests PASS with exit code 0.

- [ ] **Step 5: Run syntax and repository hygiene checks**

Run:

```bash
cp Code.gs /tmp/Code.js
node --check /tmp/Code.js
find . -maxdepth 2 -type f | sort
```

Expected: syntax exit code 0; no temporary implementation scripts, backup copies, stale workflow files or generated junk are committed.

- [ ] **Step 6: Verify acceptance criteria against the spec**

Manually check the implemented paths cover: admin year setup, promotion date, automatic 5–10 promotion, 11 graduation/archive, planned new 5-sinf activation, historical class names, Monday–Friday default, calendar overrides, calendar-aware stats, calendar-aware notifications, idempotent migration/trigger behavior and preservation of existing IDs/history.

- [ ] **Step 7: Commit final integration**

```bash
git add Code.gs tests/academic-year-calendar.test.js
git commit -m "test: verify multi year attendance lifecycle"
```

- [ ] **Step 8: Deployment smoke checklist (after Apps Script copy/deploy)**

In Apps Script: run `setupDavomatOne()` once, create/initialize the current academic year through SUPER ADMIN flow, run `installDavomatTriggers()` once, deploy a new web-app version, then smoke-test one admin calendar event, one statistics range and one teacher attendance flow. Do not run promotion manually against production data unless using a deliberately configured due test year.

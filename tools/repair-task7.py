from pathlib import Path
p = Path('Code.gs')
s = p.read_text(encoding='utf-8')
bad = """      else if (pending.type === 'ADD_CALENDAR_EVENT') {
        addCalendarEvent_(actor,parseCalendarEventMessage_(text,pending.calendarType));
      else if (pending.type === 'ADD_ADMIN') {"""
good = """      else if (pending.type === 'ADD_CALENDAR_EVENT') {
        addCalendarEvent_(actor,parseCalendarEventMessage_(text,pending.calendarType));
      } else if (pending.type === 'ADD_ADMIN') {"""
if bad not in s:
    raise SystemExit('task7 malformed branch not found')
p.write_text(s.replace(bad, good, 1), encoding='utf-8')
print('task7 branch repaired')

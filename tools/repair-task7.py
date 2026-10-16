from pathlib import Path
p = Path('Code.gs')
s = p.read_text(encoding='utf-8')
if "pending.type === 'ADD_CALENDAR_EVENT'" not in s[s.find('function handleText_('):]:
    anchor = """      } else if (pending.type === 'ADD_ADMIN') {"""
    insert = """      } else if (pending.type === 'ADD_CALENDAR_EVENT') {
        addCalendarEvent_(actor,parseCalendarEventMessage_(text,pending.calendarType));
      } else if (pending.type === 'ADD_ADMIN') {"""
    if anchor not in s:
        raise SystemExit('current ADD_ADMIN branch not found')
    s = s.replace(anchor, insert, 1)
p.write_text(s, encoding='utf-8')
print('task7 pending route repaired')

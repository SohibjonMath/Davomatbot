from pathlib import Path
p = Path('Code.gs')
s = p.read_text(encoding='utf-8')
bad = """      } else if (pending.type === 'ADD_FIVE_CLASS') {
        createClassForAcademicYear_(actor,pending.yearId,text);
      else if (pending.type === 'ADD_ADMIN') {"""
good = """      } else if (pending.type === 'ADD_FIVE_CLASS') {
        createClassForAcademicYear_(actor,pending.yearId,text);
      } else if (pending.type === 'ADD_ADMIN') {"""
if bad not in s:
    raise SystemExit('task6 malformed branch not found')
p.write_text(s.replace(bad, good, 1), encoding='utf-8')
print('task6 branch repaired')

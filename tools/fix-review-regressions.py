from pathlib import Path
p = Path('Code.gs')
s = p.read_text(encoding='utf-8')

# 1) Existing data can contain 05-01; accept a leading zero for grades 5-9.
old = "const m = /^([5-9]|10|11)-(\\d+)$/.exec(String(className || '').trim());"
new = "const m = /^(0?[5-9]|10|11)-(\\d+)$/.exec(String(className || '').trim());"
if old not in s:
    raise SystemExit('parseClassStage pattern not found')
s = s.replace(old, new, 1)

# 2) Planned next-year 5-01 may coexist with this year's active 5-01 cohort.
old = "const duplicate=getRowsAsObjects_(SHEETS.CLASSES).some(c=>String(c.class_name).toLowerCase()===name.toLowerCase() && !String(c.archived_at||''));"
new = """const yearStatus=String(year.status).toUpperCase();
  const duplicate=getRowsAsObjects_(SHEETS.CLASSES).some(c=>{
    if(String(c.class_name).toLowerCase()!==name.toLowerCase() || String(c.archived_at||'')) return false;
    if(yearStatus==='PLANNED') return String(c.start_year_id||'')===String(yearId);
    return isActiveFlag_(c.active);
  });"""
if old not in s:
    raise SystemExit('planned class duplicate rule not found')
s = s.replace(old, new, 1)

# 3) Each historical class row needs its own applicable school-day denominator.
legacy = "totalStudents:classStudents.length,submittedDays:submitted.length,missingDays:Math.max(0,activeDates.length-submitted.length)"
legacy_new = "totalStudents:classStudents.length,schoolDays:activeDates.length,submittedDays:submitted.length,missingDays:Math.max(0,activeDates.length-submitted.length)"
if legacy not in s:
    raise SystemExit('legacy stats denominator return not found')
s = s.replace(legacy, legacy_new, 1)
current = "totalStudents:classStudents.length,submittedDays:submitted.length,missingDays:Math.max(0,dateSet.length-submitted.length)"
current_new = "totalStudents:classStudents.length,schoolDays:dateSet.length,submittedDays:submitted.length,missingDays:Math.max(0,dateSet.length-submitted.length)"
if current not in s:
    raise SystemExit('historic stats denominator return not found')
s = s.replace(current, current_new, 1)
old_ui = "'\\nDavomat: ' + item.submittedDays + '/' + model.schoolDays + ' kun | Keldi '"
new_ui = "'\\nDavomat: ' + item.submittedDays + '/' + (item.schoolDays || model.schoolDays) + ' kun | Keldi '"
if old_ui not in s:
    raise SystemExit('range class UI denominator not found')
s = s.replace(old_ui, new_ui, 1)

# 4) On today's holiday/weekend, stop before rendering an editable attendance form.
start = s.find('function showAttendanceForClass_(')
end = s.find('\nfunction showClasses_(', start)
if start < 0 or end < 0:
    raise SystemExit('showAttendanceForClass_ boundaries not found')
replacement = r'''function showAttendanceForClass_(chatId, messageId, actor, classId, date, edit) {
  const dateKey = normalizeDateKey_(date || todayKey_());
  if (dateKey === todayKey_() && !isSchoolDay_(dateKey)) {
    sendMessage_(chatId, 'Bugun o‘qish kuni emas.');
    return;
  }
  const view = buildAttendanceView_(actor, classId, dateKey);
  if (edit && messageId) editMessage_(chatId, messageId, view.text, view.replyMarkup);
  else sendMessage_(chatId, view.text, view.replyMarkup);
}
'''
s = s[:start] + replacement + s[end:]

p.write_text(s, encoding='utf-8')
print('review regressions fixed')

from pathlib import Path
p = Path('Code.gs')
s = p.read_text(encoding='utf-8')
start = s.find('function activatePlannedAcademicYears_(')
if start < 0:
    raise SystemExit('activatePlannedAcademicYears_ not found')
end = s.find('\nfunction promoteAcademicYear_(', start)
if end < 0:
    raise SystemExit('promoteAcademicYear_ boundary not found')
replacement = r'''function activatePlannedAcademicYears_(today) {
  const key = String(today || todayKey_()).slice(0,10);
  const activated = [];
  const activeNow = getActiveAcademicYear_();
  getRowsAsObjects_(SHEETS.ACADEMIC_YEARS).forEach(year => {
    if (String(year.status).toUpperCase() !== 'PLANNED') return;
    if (key < String(year.start_date) || key > String(year.end_date)) return;
    if (activeNow && String(activeNow.year_id) !== String(year.year_id)) return;
    updateObjectRow_(SHEETS.ACADEMIC_YEARS, year._row, {status:'ACTIVE', activated_at:new Date().toISOString()});
    const freshYear = findRowByValue_(SHEETS.ACADEMIC_YEARS, 'year_id', year.year_id);

    getRowsAsObjects_(SHEETS.CLASSES).forEach(classRow => {
      if (String(classRow.start_year_id || '') !== String(year.year_id) || isActiveFlag_(classRow.active)) return;
      updateObjectRow_(SHEETS.CLASSES, classRow._row, {active:true});
    });

    listActiveRows_(SHEETS.CLASSES).forEach(classRow => {
      ensureClassHistorySnapshot_(classRow, freshYear);
    });
    activated.push(String(year.year_id));
  });
  return activated;
}
'''
p.write_text(s[:start] + replacement + s[end:], encoding='utf-8')
print('activation history fixed')

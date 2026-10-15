function listActiveStudentsByClass_(classId) {
  return listActiveRows_(SHEETS.STUDENTS)
    .filter(row => Number(row.class_id) === Number(classId))
    .sort((a,b) => String(a.full_name).localeCompare(String(b.full_name)));
}

function addStudent_(actor, classId, fullName) {
  if (!canManageStudentsInClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const name = normalizeName_(fullName);
  const studentId = nextNumericId_(SHEETS.STUDENTS, 'student_id');
  appendObjectRow_(SHEETS.STUDENTS, { student_id:studentId, full_name:name, class_id:Number(classId), active:true });
  return { studentId, fullName:name, classId:Number(classId) };
}

function deactivateStudent_(actor, studentId) {
  const row = findRowByValue_(SHEETS.STUDENTS, 'student_id', studentId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Öquvçi topilmadi.');
  if (!canManageStudentsInClass_(actor, row.class_id)) throw new Error('Ruxsat yo‘q.');
  setRowActive_(SHEETS.STUDENTS, 'student_id', studentId, false);
  return true;
}

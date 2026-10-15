function normalizeName_(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Nom bo‘sh bo‘lishi mumkin emas.');
  return name;
}

function listActiveClasses_() {
  return listActiveRows_(SHEETS.CLASSES).sort((a,b) => String(a.class_name).localeCompare(String(b.class_name)));
}

function listAvailableClasses_() {
  return listActiveClasses_().filter(row => !String(row.teacher_telegram_id || '').trim());
}

function addClass_(actor, className) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const name = normalizeName_(className);
  const duplicate = listActiveClasses_().some(row => String(row.class_name).toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error('Bunday sinf allaqachon mavjud.');
  const classId = nextNumericId_(SHEETS.CLASSES, 'class_id');
  appendObjectRow_(SHEETS.CLASSES, { class_id:classId, class_name:name, teacher_telegram_id:'', active:true });
  return { classId, className:name };
}

function renameClass_(actor, classId, className) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const row = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const name = normalizeName_(className);
  const duplicate = listActiveClasses_().some(item => Number(item.class_id) !== Number(classId) && String(item.class_name).toLowerCase() === name.toLowerCase());
  if (duplicate) throw new Error('Bunday sinf allaqachon mavjud.');
  updateObjectRow_(SHEETS.CLASSES, row._row, { class_name:name });
  return { classId:Number(classId), className:name };
}

function deactivateClass_(actor, classId) {
  if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
  const row = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!row || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
  const teacherId = String(row.teacher_telegram_id || '').trim();
  if (teacherId) {
    const teacher = findRowByValue_(SHEETS.USERS, 'telegram_id', teacherId);
    if (teacher && teacher.role === ROLES.TEACHER && Number(teacher.class_id) === Number(classId)) {
      updateObjectRow_(SHEETS.USERS, teacher._row, { active:false, class_id:'' });
    }
    updateObjectRow_(SHEETS.CLASSES, row._row, { teacher_telegram_id:'' });
  }
  setRowActive_(SHEETS.CLASSES, 'class_id', classId, false);
  return true;
}

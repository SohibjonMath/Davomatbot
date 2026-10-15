function assertEditableUserId_(telegramId) {
  const id = String(telegramId || '').trim();
  if (!/^\d+$/.test(id)) throw new Error('Telegram ID noto‘g‘ri.');
  if (id === String(getSuperAdminId_())) throw new Error('SUPER ADMIN oddiy foydalanuvçi sifatida o‘zgartirilmaydi.');
  return id;
}

function upsertUser_(telegramId, fullName, role, classId, active) {
  const row = findRowByValue_(SHEETS.USERS, 'telegram_id', telegramId);
  const data = {
    full_name: normalizeName_(fullName),
    role: role,
    class_id: classId === null || classId === undefined ? '' : Number(classId),
    active: Boolean(active)
  };
  if (row) {
    updateObjectRow_(SHEETS.USERS, row._row, data);
  } else {
    appendObjectRow_(SHEETS.USERS, {
      telegram_id: String(telegramId),
      full_name: data.full_name,
      role: data.role,
      class_id: data.class_id,
      active: data.active
    });
  }
  return findRowByValue_(SHEETS.USERS, 'telegram_id', telegramId);
}

function assignTeacher_(actor, classId, telegramId, fullName) {
  if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
  const id = assertEditableUserId_(telegramId);
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');

  const existingSameUser = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
  if (existingSameUser && existingSameUser.role === ROLES.TEACHER && existingSameUser.class_id !== '' && Number(existingSameUser.class_id) !== Number(classId)) {
    const previousClass = findRowByValue_(SHEETS.CLASSES, 'class_id', existingSameUser.class_id);
    if (previousClass && String(previousClass.teacher_telegram_id || '') === id) {
      updateObjectRow_(SHEETS.CLASSES, previousClass._row, { teacher_telegram_id:'' });
    }
  }

  const oldId = String(classRow.teacher_telegram_id || '').trim();
  if (oldId && oldId !== id) {
    const oldUser = findRowByValue_(SHEETS.USERS, 'telegram_id', oldId);
    if (oldUser && oldUser.role === ROLES.TEACHER && Number(oldUser.class_id) === Number(classId)) {
      updateObjectRow_(SHEETS.USERS, oldUser._row, { active:false, class_id:'' });
    }
  }

  upsertUser_(id, fullName, ROLES.TEACHER, classId, true);
  updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:id });
  return { classId:Number(classId), telegramId:id, fullName:normalizeName_(fullName) };
}

function removeTeacher_(actor, classId) {
  if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
  const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
  if (!classRow) throw new Error('Sinf topilmadi.');
  const oldId = String(classRow.teacher_telegram_id || '').trim();
  if (oldId) {
    const oldUser = findRowByValue_(SHEETS.USERS, 'telegram_id', oldId);
    if (oldUser && oldUser.role === ROLES.TEACHER && Number(oldUser.class_id) === Number(classId)) {
      updateObjectRow_(SHEETS.USERS, oldUser._row, { active:false, class_id:'' });
    }
  }
  updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:'' });
  return true;
}

function addAdmin_(actor, telegramId, fullName) {
  if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
  const id = assertEditableUserId_(telegramId);
  const existing = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
  if (existing && existing.role === ROLES.TEACHER && existing.class_id !== '') {
    const previousClass = findRowByValue_(SHEETS.CLASSES, 'class_id', existing.class_id);
    if (previousClass && String(previousClass.teacher_telegram_id || '') === id) {
      updateObjectRow_(SHEETS.CLASSES, previousClass._row, { teacher_telegram_id:'' });
    }
  }
  upsertUser_(id, fullName, ROLES.ADMIN, null, true);
  return { telegramId:id, fullName:normalizeName_(fullName) };
}

function removeAdmin_(actor, telegramId) {
  if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
  const id = assertEditableUserId_(telegramId);
  const row = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
  if (!row || row.role !== ROLES.ADMIN || !(row.active === true || String(row.active).toLowerCase() === 'true')) throw new Error('Admin topilmadi.');
  updateObjectRow_(SHEETS.USERS, row._row, { active:false, class_id:'' });
  return true;
}

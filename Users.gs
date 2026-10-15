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

function claimClass_(telegramId, fullName, classId) {
  const id = assertEditableUserId_(telegramId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const existing = findRowByValue_(SHEETS.USERS, 'telegram_id', id);
    if (existing && (existing.active === true || String(existing.active).toLowerCase() === 'true')) {
      if (existing.role === ROLES.ADMIN) throw new Error('Admin sinf rahbari sifatida sinf tanlay olmaydi.');
      if (existing.role === ROLES.TEACHER && existing.class_id !== '') {
        if (Number(existing.class_id) === Number(classId)) {
          const sameClass = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
          return { classId:Number(classId), className:sameClass ? String(sameClass.class_name) : '', telegramId:id };
        }
        throw new Error('Siz allaqachon boshqa sinfni olgansiz.');
      }
    }

    const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', classId);
    if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase() === 'true')) throw new Error('Sinf topilmadi.');
    if (String(classRow.teacher_telegram_id || '').trim()) throw new Error('Bu sinf band.');

    upsertUser_(id, fullName, ROLES.TEACHER, classId, true);
    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:id });
    return { classId:Number(classId), className:String(classRow.class_name), telegramId:id };
  } finally {
    lock.releaseLock();
  }
}

function releaseOwnClass_(actor) {
  if (!actor || actor.role !== ROLES.TEACHER || actor.classId === null || actor.classId === undefined) throw new Error('Sinf rahbari topilmadi.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const classRow = findRowByValue_(SHEETS.CLASSES, 'class_id', actor.classId);
    if (!classRow) throw new Error('Sinf topilmadi.');
    if (String(classRow.teacher_telegram_id || '') !== String(actor.telegramId)) throw new Error('Bu sinf sizga tegishli emas.');
    updateObjectRow_(SHEETS.CLASSES, classRow._row, { teacher_telegram_id:'' });
    const userRow = findRowByValue_(SHEETS.USERS, 'telegram_id', actor.telegramId);
    if (userRow) updateObjectRow_(SHEETS.USERS, userRow._row, { active:false, class_id:'' });
    return { classId:Number(actor.classId), className:String(classRow.class_name) };
  } finally {
    lock.releaseLock();
  }
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

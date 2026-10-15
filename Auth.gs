function getSuperAdminId_() {
  const value = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.SUPER_ADMIN_ID);
  return value ? String(value) : null;
}

function resolveActor_(telegramId) {
  const id = String(telegramId);
  const superId = getSuperAdminId_();
  if (superId && id === superId) {
    return { telegramId: id, role: ROLES.SUPER_ADMIN, classId: null, active: true };
  }
  const user = getRowsAsObjects_(SHEETS.USERS).find(row =>
    String(row.telegram_id) === id && (row.active === true || String(row.active).toLowerCase() === 'true')
  );
  if (!user) return null;
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.TEACHER) return null;
  return {
    telegramId: id,
    role: user.role,
    classId: user.role === ROLES.TEACHER && user.class_id !== '' ? Number(user.class_id) : null,
    active: true
  };
}

function canManageClasses_(actor) {
  return Boolean(actor && (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN));
}

function canManageStudents_(actor) {
  return Boolean(actor && (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN));
}

function canManageUsers_(actor) {
  return Boolean(actor && actor.role === ROLES.SUPER_ADMIN);
}

function canAccessClass_(actor, classId) {
  if (!actor) return false;
  if (actor.role === ROLES.SUPER_ADMIN || actor.role === ROLES.ADMIN) return true;
  return actor.role === ROLES.TEACHER && Number(actor.classId) === Number(classId);
}

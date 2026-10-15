function buildMainMenu_(actor) {
  let keyboard = [];
  if (actor.role === ROLES.SUPER_ADMIN) {
    keyboard = [['Davomat','Sinflar'],['Öquvçilar','Sinf rahbarlari'],['Adminlar']];
  } else if (actor.role === ROLES.ADMIN) {
    keyboard = [['Davomat','Sinflar'],['Öquvçilar']];
  } else if (actor.role === ROLES.TEACHER) {
    keyboard = [['Bugungi davomat'],['Oldingi davomatlar']];
  }
  return { keyboard: keyboard, resize_keyboard: true, is_persistent: true };
}

function buildInlineKeyboard_(rows) {
  return { inline_keyboard: rows };
}

function statusLabel_(status) {
  if (status === ATTENDANCE_STATUS.SABABLI) return 'Sababli';
  if (status === ATTENDANCE_STATUS.SABABSIZ) return 'Sababsiz';
  return 'Keldi';
}

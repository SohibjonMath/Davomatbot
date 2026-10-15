function todayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function safeOutput_() {
  return ContentService.createTextOutput(JSON.stringify({ ok:true })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const update = JSON.parse(raw);
    routeUpdate_(update);
  } catch (error) {
    console.error('DavomatOne webhook error:', error && error.message ? error.message : error);
  }
  return safeOutput_();
}

function routeUpdate_(update) {
  if (!update || typeof update !== 'object') return;
  if (update.message && update.message.from && update.message.chat) {
    const actor = resolveActor_(update.message.from.id);
    if (!actor) {
      sendMessage_(update.message.chat.id, 'Ruxsat yo‘q.');
      return;
    }
    const text = String(update.message.text || '').trim();
    if (text.charAt(0) === '/') handleCommand_(update.message, actor);
    else handleText_(update.message, actor);
    return;
  }
  if (update.callback_query && update.callback_query.from) {
    const actor = resolveActor_(update.callback_query.from.id);
    if (!actor) {
      answerCallback_(update.callback_query.id, 'Ruxsat yo‘q.');
      return;
    }
    handleCallback_(update.callback_query, actor);
  }
}

function handleCommand_(message, actor) {
  const command = String(message.text || '').split(/\s+/)[0].toLowerCase();
  if (command === '/start') {
    clearPendingAction_(actor.telegramId);
    sendMessage_(message.chat.id, 'DavomatOne tayyor.', buildMainMenu_(actor));
    return;
  }
  sendMessage_(message.chat.id, 'Menyudan tanlang.', buildMainMenu_(actor));
}

function classChoiceKeyboard_(prefix, includeHistory) {
  const rows = listActiveClasses_().map(row => {
    const classId = Number(row.class_id);
    if (includeHistory) {
      return [
        { text:String(row.class_name), callback_data:prefix + ':' + classId },
        { text:'Oldingi', callback_data:'hist:class:' + classId }
      ];
    }
    return [{ text:String(row.class_name), callback_data:prefix + ':' + classId }];
  });
  return buildInlineKeyboard_(rows);
}

function showAttendanceForClass_(chatId, messageId, actor, classId, date, edit) {
  const view = buildAttendanceView_(actor, classId, date || todayKey_());
  if (edit && messageId) editMessage_(chatId, messageId, view.text, view.replyMarkup);
  else sendMessage_(chatId, view.text, view.replyMarkup);
}

function showClasses_(chatId) {
  const rows = listActiveClasses_().map(row => [{ text:String(row.class_name), callback_data:'cls:open:' + row.class_id }]);
  rows.push([{ text:'Sinf qo‘şish', callback_data:'cls:add' }]);
  sendMessage_(chatId, 'Sinflar', buildInlineKeyboard_(rows));
}

function showStudentsClassChoice_(chatId) {
  sendMessage_(chatId, 'Sinfni tanlang.', classChoiceKeyboard_('stu:class', false));
}

function showTeacherClassChoice_(chatId) {
  sendMessage_(chatId, 'Sinfni tanlang.', classChoiceKeyboard_('teacher:class', false));
}

function showAdmins_(chatId) {
  const admins = listActiveRows_(SHEETS.USERS).filter(row => row.role === ROLES.ADMIN);
  const rows = admins.map(row => [{ text:String(row.full_name), callback_data:'admin:remove:' + row.telegram_id }]);
  rows.push([{ text:'Admin qo‘şish', callback_data:'admin:add' }]);
  sendMessage_(chatId, 'Adminlar', buildInlineKeyboard_(rows));
}

function showHistory_(chatId, actor, classId) {
  if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
  const dates = [];
  getRowsAsObjects_(SHEETS.ATTENDANCE)
    .filter(row => Number(row.class_id) === Number(classId))
    .forEach(row => { const d = String(row.date); if (dates.indexOf(d) < 0) dates.push(d); });
  dates.sort().reverse();
  if (!dates.length) {
    sendMessage_(chatId, 'Oldingi davomat yo‘q.');
    return;
  }
  const rows = dates.slice(0, 30).map(date => [{ text:date, callback_data:'hist:open:' + classId + ':' + date }]);
  sendMessage_(chatId, 'Sanani tanlang.', buildInlineKeyboard_(rows));
}

function handleText_(message, actor) {
  const chatId = message.chat.id;
  const text = String(message.text || '').trim();
  const pending = getPendingAction_(actor.telegramId);
  if (pending) {
    try {
      if (pending.type === 'ADD_CLASS') addClass_(actor, text);
      else if (pending.type === 'RENAME_CLASS') renameClass_(actor, pending.classId, text);
      else if (pending.type === 'ADD_STUDENT') addStudent_(actor, pending.classId, text);
      else if (pending.type === 'ADD_ADMIN') {
        const parsed = parseTelegramPerson_(text);
        addAdmin_(actor, parsed.telegramId, parsed.fullName);
      } else if (pending.type === 'ASSIGN_TEACHER') {
        const parsed = parseTelegramPerson_(text);
        assignTeacher_(actor, pending.classId, parsed.telegramId, parsed.fullName);
      } else throw new Error('Amal topilmadi.');
      clearPendingAction_(actor.telegramId);
      sendMessage_(chatId, 'Saqlandi.', buildMainMenu_(actor));
    } catch (error) {
      sendMessage_(chatId, error && error.message ? error.message : 'SaqLab bo‘lmadi.');
    }
    return;
  }

  if (text === 'Davomat') {
    if (actor.role === ROLES.TEACHER) showAttendanceForClass_(chatId, null, actor, actor.classId, todayKey_(), false);
    else sendMessage_(chatId, 'Sinfni tanlang.', classChoiceKeyboard_('att:class', true));
    return;
  }
  if (text === 'Bugungi davomat') {
    showAttendanceForClass_(chatId, null, actor, actor.classId, todayKey_(), false);
    return;
  }
  if (text === 'Oldingi davomatlar') {
    showHistory_(chatId, actor, actor.classId);
    return;
  }
  if (text === 'Sinflar') { if (!canManageClasses_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.'); showClasses_(chatId); return; }
  if (text === 'Öquvçilar') { if (!canManageStudents_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.'); showStudentsClassChoice_(chatId); return; }
  if (text === 'Sinf rahbarlari') { if (!canManageUsers_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.'); showTeacherClassChoice_(chatId); return; }
  if (text === 'Adminlar') { if (!canManageUsers_(actor)) return sendMessage_(chatId,'Ruxsat yo‘q.'); showAdmins_(chatId); return; }
  sendMessage_(chatId, 'Menyudan tanlang.', buildMainMenu_(actor));
}

function parseTelegramPerson_(text) {
  const parts = String(text || '').split('|');
  if (parts.length < 2) throw new Error('Format: TelegramID | Ism Familiya');
  const telegramId = parts.shift().trim();
  const fullName = parts.join('|').trim();
  if (!/^\d+$/.test(telegramId) || !fullName) throw new Error('Format: TelegramID | Ism Familiya');
  return { telegramId, fullName };
}

function handleCallback_(callbackQuery, actor) {
  const data = String(callbackQuery.data || '');
  const chatId = callbackQuery.message && callbackQuery.message.chat ? callbackQuery.message.chat.id : actor.telegramId;
  const messageId = callbackQuery.message ? callbackQuery.message.message_id : null;
  try {
    const p = data.split(':');
    if (p[0] === 'att' && p[1] === 'class') {
      const classId = Number(p[2]);
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      showAttendanceForClass_(chatId, messageId, actor, classId, p[3] || todayKey_(), Boolean(messageId));
    } else if (p[0] === 'att' && p[1] === 'cycle') {
      const classId = Number(p[2]), studentId = Number(p[3]), date = p[4];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      cycleAttendanceDraft_(actor, classId, studentId, date);
      showAttendanceForClass_(chatId, messageId, actor, classId, date, true);
    } else if (p[0] === 'att' && p[1] === 'save') {
      const classId = Number(p[2]), date = p[3];
      if (!canAccessClass_(actor, classId)) throw new Error('Ruxsat yo‘q.');
      const entries = getAttendanceDraft_(actor, classId, date);
      const saved = saveAttendance_(actor, classId, date, entries);
      clearAttendanceDraft_(actor, classId, date);
      const s = attendanceSummary_(saved);
      const classRow = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      const text = String(classRow.class_name) + ' — ' + date + '\n\nKeldi: ' + s.KELDI + '\nSababli: ' + s.SABABLI + '\nSababsiz: ' + s.SABABSIZ;
      editMessage_(chatId, messageId, text, buildInlineKeyboard_([[{text:'Tahrirlash',callback_data:'att:class:'+classId+':'+date}]]));
    } else if (p[0] === 'hist' && p[1] === 'class') {
      showHistory_(chatId, actor, Number(p[2]));
    } else if (p[0] === 'hist' && p[1] === 'open') {
      const classId = Number(p[2]);
      if (!canAccessClass_(actor,classId)) throw new Error('Ruxsat yo‘q.');
      showAttendanceForClass_(chatId, messageId, actor, classId, p[3], Boolean(messageId));
    } else if (data === 'cls:add') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_CLASS'});
      sendMessage_(chatId,'Sinf nomini yuboring.');
    } else if (p[0] === 'cls' && p[1] === 'open') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      const classId = Number(p[2]);
      const row = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      if (!row || !(row.active === true || String(row.active).toLowerCase()==='true')) throw new Error('Sinf topilmadi.');
      sendMessage_(chatId,String(row.class_name),buildInlineKeyboard_([
        [{text:'Nomini özgartirish',callback_data:'cls:rename:'+classId}],
        [{text:'Sinfni öçirish',callback_data:'cls:remove:'+classId}]
      ]));
    } else if (p[0] === 'cls' && p[1] === 'rename') {
      if (!canManageClasses_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'RENAME_CLASS',classId:Number(p[2])});
      sendMessage_(chatId,'Yangi sinf nomini yuboring.');
    } else if (p[0] === 'cls' && p[1] === 'remove') {
      deactivateClass_(actor,Number(p[2]));
      sendMessage_(chatId,'Sinf öçirildi.');
    } else if (p[0] === 'stu' && p[1] === 'class') {
      if (!canManageStudents_(actor)) throw new Error('Ruxsat yo‘q.');
      const classId = Number(p[2]);
      const classRow = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      if (!classRow || !(classRow.active === true || String(classRow.active).toLowerCase()==='true')) throw new Error('Sinf topilmadi.');
      const rows = listActiveStudentsByClass_(classId).map(st => [{text:String(st.full_name),callback_data:'stu:remove:'+st.student_id}]);
      rows.push([{text:'Öquvçi qo‘şish',callback_data:'stu:add:'+classId}]);
      sendMessage_(chatId,String(classRow.class_name)+' öquvçilari',buildInlineKeyboard_(rows));
    } else if (p[0] === 'stu' && p[1] === 'add') {
      if (!canManageStudents_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_STUDENT',classId:Number(p[2])});
      sendMessage_(chatId,'Öquvçi ism-familiyasini yuboring.');
    } else if (p[0] === 'stu' && p[1] === 'remove') {
      deactivateStudent_(actor,Number(p[2]));
      sendMessage_(chatId,'Öquvçi çiqarildi.');
    } else if (p[0] === 'teacher' && p[1] === 'class') {
      if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
      const classId = Number(p[2]);
      const row = findRowByValue_(SHEETS.CLASSES,'class_id',classId);
      if (!row) throw new Error('Sinf topilmadi.');
      sendMessage_(chatId,String(row.class_name)+' sinf rahbari',buildInlineKeyboard_([
        [{text:'Tayinlash / almaştirish',callback_data:'teacher:set:'+classId}],
        [{text:'Rahbarni olib taşlash',callback_data:'teacher:remove:'+classId}]
      ]));
    } else if (p[0] === 'teacher' && p[1] === 'set') {
      if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ASSIGN_TEACHER',classId:Number(p[2])});
      sendMessage_(chatId,'Format: TelegramID | Ism Familiya');
    } else if (p[0] === 'teacher' && p[1] === 'remove') {
      removeTeacher_(actor,Number(p[2]));
      sendMessage_(chatId,'Sinf rahbari olib taşlandi.');
    } else if (data === 'admin:add') {
      if (!canManageUsers_(actor)) throw new Error('Ruxsat yo‘q.');
      setPendingAction_(actor.telegramId,{type:'ADD_ADMIN'});
      sendMessage_(chatId,'Format: TelegramID | Ism Familiya');
    } else if (p[0] === 'admin' && p[1] === 'remove') {
      removeAdmin_(actor,p[2]);
      sendMessage_(chatId,'Admin olib taşlandi.');
    } else {
      throw new Error('Amal topilmadi.');
    }
    try { answerCallback_(callbackQuery.id); } catch (_answerError) {}
  } catch (error) {
    try { answerCallback_(callbackQuery.id, error && error.message ? error.message : 'Xatolik.'); }
    catch (_answerError) { console.error('Callback answer error'); }
  }
}

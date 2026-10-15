const SHEETS = Object.freeze({
  CLASSES: 'CLASSES',
  STUDENTS: 'STUDENTS',
  USERS: 'USERS',
  ATTENDANCE: 'ATTENDANCE'
});

const SHEET_HEADERS = Object.freeze({
  CLASSES: ['class_id','class_name','teacher_telegram_id','active'],
  STUDENTS: ['student_id','full_name','class_id','active'],
  USERS: ['telegram_id','full_name','role','class_id','active'],
  ATTENDANCE: ['date','class_id','student_id','status','updated_by','updated_at']
});

const ROLES = Object.freeze({ SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', TEACHER: 'TEACHER' });
const ATTENDANCE_STATUS = Object.freeze({ KELDI: 'KELDI', SABABLI: 'SABABLI', SABABSIZ: 'SABABSIZ' });
const ATTENDANCE_CYCLE = Object.freeze(['KELDI','SABABLI','SABABSIZ']);
const PROPERTY_KEYS = Object.freeze({ BOT_TOKEN: 'TELEGRAM_BOT_TOKEN', SUPER_ADMIN_ID: 'SUPER_ADMIN_ID' });

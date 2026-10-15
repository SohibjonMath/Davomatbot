function pendingKey_(telegramId) {
  return 'pending:' + String(telegramId);
}

function setPendingAction_(telegramId, action) {
  CacheService.getScriptCache().put(pendingKey_(telegramId), JSON.stringify(action), 600);
}

function getPendingAction_(telegramId) {
  const raw = CacheService.getScriptCache().get(pendingKey_(telegramId));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_error) { return null; }
}

function clearPendingAction_(telegramId) {
  CacheService.getScriptCache().remove(pendingKey_(telegramId));
}

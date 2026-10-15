function getTelegramToken_() {
  const token = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.BOT_TOKEN);
  if (!token) throw new Error('Telegram bot tokeni sozlanmagan.');
  return token;
}

function telegramCall_(method, payload) {
  const token = getTelegramToken_();
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true
  });
  const text = response.getContentText();
  let parsed;
  try { parsed = JSON.parse(text); } catch (_error) { throw new Error('Telegram javobi noto‘g‘ri.'); }
  if (!parsed.ok) throw new Error('Telegram so‘rovi bajarilmadi.');
  return parsed.result || parsed;
}

function sendMessage_(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall_('sendMessage', payload);
}

function editMessage_(chatId, messageId, text, replyMarkup) {
  const payload = { chat_id: chatId, message_id: messageId, text: text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramCall_('editMessageText', payload);
}

function answerCallback_(callbackQueryId, text) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return telegramCall_('answerCallbackQuery', payload);
}

/** Optional run summary to Telegram. No-op unless TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. */
export async function notify(level: 'ok' | 'warn' | 'failed', title: string, lines: string[]): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const icon = level === 'ok' ? '✅' : level === 'warn' ? '⚠️' : '❌';
  const text = [`${icon} ${title}`, ...lines].join('\n').slice(0, 4000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

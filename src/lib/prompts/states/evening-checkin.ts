/**
 * 晚間提醒的 context 片段（不是獨立 state，而是加在其他 state 的補充）。
 * 由 route.ts 用 clientTime 判斷是否加入。
 */
export const EVENING_CHECKIN_HINT = `
【情境】現在已經晚上（22:00 後）。
若使用者今天還沒記錄飲食，可以輕鬆問一下今天吃了什麼、要不要上傳照片，不要強迫。
若使用者已經聊過晚餐，就不要再問一次。
`.trim();

/**
 * 判斷是否為晚間時段。
 * clientTime 是前端送來的 ISO 字串（使用者本地時區），避免 Gemini 不知道現在幾點。
 */
export function isEveningHour(clientTime?: string | number | Date): boolean {
  if (!clientTime) return false;
  const d = new Date(clientTime);
  if (isNaN(d.getTime())) return false;
  const h = d.getHours();
  return h >= 22 || h < 2;
}

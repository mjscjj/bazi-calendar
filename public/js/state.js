// 全局状态：当前用户、会员状态、今天页和日历页的数据。
const now = new Date();
export const S = {
  me: null, access: null, unread: 0, priceCents: 290, memberDays: 30, legal: null,
  today: null, todayLocked: null, todayErr: null,
  cal: null, calLocked: null, calErr: null,
  y: now.getFullYear(), m: now.getMonth() + 1, sel: now.getDate(),
  installPrompt: null,
};
export const isPro = () => !!(S.me && S.me.proMode);
export const isDemo = () => !S.me;

// Minimal TH/EN/ZH strings for the shell. The full translation set comes with the i18n PR.
export const languages = ['th', 'en', 'zh'] as const;
export type Lang = (typeof languages)[number];

export const languageLabel: Record<Lang, string> = { th: 'TH', en: 'EN', zh: '中文' };

const strings = {
  schedule: { th: 'ตารางงาน', en: 'Schedule', zh: '排班' },
  mySchedule: { th: 'ตารางของฉัน', en: 'My schedule', zh: '我的排班' },
  leave: { th: 'ลางาน', en: 'Leave', zh: '请假' },
  hours: { th: 'ชั่วโมงงาน', en: 'Hours', zh: '工时' },
  results: { th: 'ผลไลฟ์', en: 'Live results', zh: '直播成绩' },
  comingSoon: { th: 'หน้านี้กำลังสร้าง', en: 'This page is being built', zh: '此页面正在建设中' },
  apiOk: { th: 'เชื่อมต่อระบบแล้ว', en: 'Connected', zh: '已连接' },
  apiDown: { th: 'เชื่อมต่อฐานข้อมูลไม่ได้', en: 'Database unavailable', zh: '数据库不可用' },
  apiChecking: { th: 'กำลังตรวจสอบ…', en: 'Checking…', zh: '检查中…' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof strings;

export const t = (lang: Lang, key: StringKey) => strings[key][lang];

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && (languages as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    // storage blocked; fall through to the default
  }
  return 'th';
}

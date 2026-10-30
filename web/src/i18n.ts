import { bkkTime } from './time';

// TH/EN/ZH strings. Every key needs all three languages; TypeScript checks that.
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

  // Board
  day: { th: 'วัน', en: 'Day', zh: '日' },
  week: { th: 'สัปดาห์', en: 'Week', zh: '周' },
  today: { th: 'วันนี้', en: 'Today', zh: '今天' },
  addSession: { th: '+ เพิ่มรอบ', en: '+ Add session', zh: '+ 添加场次' },
  publish: { th: 'Publish ตาราง', en: 'Publish', zh: '发布排班' },
  publishConfirm: { th: 'Publish รอบ Draft ทั้งหมดในช่วงนี้?', en: 'Publish all drafts in this range?', zh: '发布此时间段内所有草稿？' },
  published: { th: 'Publish แล้ว', en: 'Published', zh: '已发布' },
  draftCount: { th: 'Draft ยังไม่ publish', en: 'drafts not published', zh: '个草稿未发布' },
  noPd: { th: 'ยังไม่มี PD', en: 'No PD yet', zh: '缺少PD' },
  draft: { th: 'Draft', en: 'Draft', zh: '草稿' },
  cancelled: { th: 'ยกเลิก', en: 'Cancelled', zh: '已取消' },
  onLeave: { th: 'ลา', en: 'On leave', zh: '请假' },
  holidayLabel: { th: 'วันหยุด', en: 'Holiday', zh: '假日' },
  loading: { th: 'กำลังโหลด…', en: 'Loading…', zh: '加载中…' },
  loadFailed: { th: 'โหลดข้อมูลไม่สำเร็จ', en: 'Could not load data', zh: '加载失败' },

  // Session form
  newSession: { th: 'เพิ่มรอบไลฟ์', en: 'New session', zh: '新增直播场次' },
  editSession: { th: 'แก้ไขรอบไลฟ์', en: 'Edit session', zh: '编辑直播场次' },
  room: { th: 'ห้อง', en: 'Room', zh: '直播间' },
  date: { th: 'วันที่', en: 'Date', zh: '日期' },
  startTime: { th: 'เริ่ม', en: 'Start', zh: '开始' },
  endTime: { th: 'จบ', en: 'End', zh: '结束' },
  mc: { th: 'MC', en: 'MC', zh: '主播' },
  pd: { th: 'PD', en: 'PD', zh: '导播' },
  choose: { th: '— เลือก —', en: '— Choose —', zh: '— 选择 —' },
  note: { th: 'หมายเหตุ', en: 'Note', zh: '备注' },
  save: { th: 'บันทึกเป็น Draft', en: 'Save as draft', zh: '保存为草稿' },
  saveChanges: { th: 'บันทึก', en: 'Save', zh: '保存' },
  saveAnyway: { th: 'ยืนยันบันทึก', en: 'Save anyway', zh: '仍然保存' },
  close: { th: 'ปิด', en: 'Close', zh: '关闭' },
  deleteDraft: { th: 'ลบ Draft', en: 'Delete draft', zh: '删除草稿' },
  cancelSession: { th: 'ยกเลิกรอบ', en: 'Cancel session', zh: '取消场次' },
  cancelReason: { th: 'เหตุผลที่ยกเลิก', en: 'Reason for cancelling', zh: '取消原因' },
  countHours: { th: 'ยังนับชั่วโมงให้ทีม', en: 'Still count hours for the team', zh: '仍计算工时' },
  checksOk: { th: '✓ ไม่ชนกับอะไร', en: '✓ No conflicts', zh: '✓ 无冲突' },
  hoursSuffix: { th: 'ชม.', en: 'h', zh: '小时' },
  mergeAsk: {
    th: 'รอบนี้ต่อกับรอบ {other} คนชุดเดียวกัน รวมเป็นรอบเดียว {merged} ไหม?',
    en: 'This session runs straight into {other} with the same people. Merge them into one session, {merged}?',
    zh: '该场次与 {other} 相连且人员相同，合并为一个场次 {merged} 吗？',
  },
  contentNoPd: { th: 'ห้อง content ไม่ต้องมี PD', en: 'Content rooms need no PD', zh: '内容间不需要导播' },
} satisfies Record<string, Record<Lang, string>>;

/** Messages for rule violation codes from the API. */
const violationText: Record<string, Record<Lang, string>> = {
  invalid_period: { th: 'เวลาจบต้องหลังเวลาเริ่ม', en: 'End must be after start', zh: '结束时间必须晚于开始时间' },
  room_inactive: { th: 'ห้องนี้ปิดใช้งานแล้ว', en: 'This room is inactive', zh: '该直播间已停用' },
  unknown_room: { th: 'ไม่พบห้องนี้', en: 'Room not found', zh: '找不到直播间' },
  missing_mc: { th: 'ต้องเลือก MC', en: 'Choose an MC', zh: '请选择主播' },
  missing_pd: { th: 'ห้องไลฟ์ต้องมี PD', en: 'Live rooms need a PD', zh: '直播间需要导播' },
  duplicate_person: { th: '{person} ถูกเลือกซ้ำ', en: '{person} is chosen twice', zh: '{person} 被重复选择' },
  unknown_person: { th: 'ไม่พบคนนี้', en: 'Person not found', zh: '找不到此人' },
  person_inactive: { th: '{person} ไม่ได้ทำงานแล้ว', en: '{person} is inactive', zh: '{person} 已停用' },
  role_not_allowed: { th: '{person} ทำหน้าที่ {role} ไม่ได้', en: '{person} cannot work as {role}', zh: '{person} 不能担任 {role}' },
  room_busy: { th: 'ห้องนี้มีรอบ {where} อยู่แล้ว', en: 'The room already has a session {where}', zh: '该直播间已有场次 {where}' },
  person_busy: { th: '{person} ติดรอบ {where}', en: '{person} is already in {where}', zh: '{person} 已在 {where} 有场次' },
  on_leave: { th: '{person} ลา (อนุมัติแล้ว)', en: '{person} is on approved leave', zh: '{person} 已请假（已批准）' },
  leave_pending: { th: '{person} มีใบลารออนุมัติ', en: '{person} has leave pending', zh: '{person} 有待批准的请假' },
  holiday: { th: 'ตรงกับวันหยุด {name}', en: 'Falls on holiday {name}', zh: '与假日 {name} 冲突' },
  over_max_hours: { th: '{person} จะมี {hours} ชม. เกินเพดาน {max}', en: '{person} would reach {hours} h, over the {max} h cap', zh: '{person} 将达 {hours} 小时，超过上限 {max}' },
  not_found: { th: 'ไม่พบรอบนี้', en: 'Session not found', zh: '找不到该场次' },
};

export interface ViolationLike {
  code: string;
  severity: 'error' | 'warning';
  personId?: number;
  detail?: Record<string, string | number>;
}

export function violationMessage(
  lang: Lang,
  v: ViolationLike,
  personName: (id: number) => string,
  roomCode: (id: number) => string = (id) => `#${id}`,
): string {
  const template = violationText[v.code]?.[lang] ?? v.code;
  const values: Record<string, string | number> = { ...v.detail };
  if (v.personId !== undefined) values.person = personName(v.personId);
  // A clash names the session in the way: "TTS 1 08:00–10:00".
  const d = v.detail;
  if (d && typeof d.start === 'string' && typeof d.end === 'string') {
    const room = typeof d.roomId === 'number' ? `${roomCode(d.roomId)} ` : '';
    values.where = `${room}${bkkTime(new Date(d.start))}–${bkkTime(new Date(d.end))}`;
  }
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}

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

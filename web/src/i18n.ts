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
  notRegistered: {
    th: 'บัญชี {email} ยังไม่ได้อยู่ในรายชื่อทีม ติดต่อแอดมินให้เพิ่มอีเมลนี้',
    en: '{email} is not on the team list yet. Ask an admin to add this email.',
    zh: '{email} 尚未加入团队名单，请联系管理员添加此邮箱。',
  },
  notSignedIn: { th: 'ยังไม่ได้ล็อกอิน ลองโหลดหน้าใหม่', en: 'Not signed in. Try reloading the page.', zh: '尚未登录，请刷新页面。' },
  viewAs: { th: 'ดูในฐานะ (dev)', en: 'View as (dev)', zh: '以此身份查看 (dev)' },
  roleAdmin: { th: 'แอดมิน', en: 'Admin', zh: '管理员' },
  roleMc: { th: 'MC', en: 'MC', zh: '主播' },
  rolePd: { th: 'PD', en: 'PD', zh: '导播' },
  roleViewer: { th: 'ดูอย่างเดียว', en: 'Viewer', zh: '只读' },

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

  // My schedule, leave and swaps
  upcoming: { th: 'รอบที่จะถึง', en: 'Upcoming sessions', zh: '即将到来的场次' },
  noUpcoming: { th: 'ยังไม่มีรอบที่ publish แล้ว', en: 'No published sessions yet', zh: '暂无已发布的场次' },
  myRequests: { th: 'คำขอของฉัน', en: 'My requests', zh: '我的申请' },
  noRequests: { th: 'ยังไม่มีคำขอ', en: 'No requests', zh: '暂无申请' },
  requestLeave: { th: 'ยื่นลา', en: 'Request leave', zh: '申请请假' },
  requestSwap: { th: 'ขอสลับกะ', en: 'Swap', zh: '申请换班' },
  with: { th: 'คู่กับ', en: 'with', zh: '搭档' },
  asRole: { th: 'ในบท', en: 'as', zh: '担任' },
  leaveKind: { th: 'ประเภท', en: 'Type', zh: '类型' },
  leaveNormal: { th: 'ลาปกติ', en: 'Normal', zh: '普通' },
  leaveUrgent: { th: 'ลาด่วน', en: 'Urgent', zh: '紧急' },
  urgentHint: {
    th: 'ลาด่วนเกินโควตา 2 คน/ตำแหน่ง/วันได้ แต่ต้องใส่เหตุผล',
    en: 'Urgent leave may go over the 2-per-position daily quota, but needs a reason',
    zh: '紧急请假可超出每岗位每天2人的名额，但需填写原因',
  },
  fromDate: { th: 'ตั้งแต่วันที่', en: 'From', zh: '从' },
  toDate: { th: 'ถึงวันที่', en: 'To', zh: '至' },
  allDay: { th: 'ทั้งวัน', en: 'All day', zh: '全天' },
  reason: { th: 'เหตุผล', en: 'Reason', zh: '原因' },
  person: { th: 'พนักงาน', en: 'Person', zh: '员工' },
  submit: { th: 'ส่งคำขอ', en: 'Submit', zh: '提交' },
  submitAnyway: { th: 'ยืนยันส่ง', en: 'Submit anyway', zh: '仍然提交' },
  withdraw: { th: 'ถอนคำขอ', en: 'Withdraw', zh: '撤回' },
  approve: { th: 'อนุมัติ', en: 'Approve', zh: '批准' },
  approveAnyway: { th: 'ยืนยันอนุมัติ', en: 'Approve anyway', zh: '仍然批准' },
  reject: { th: 'ไม่อนุมัติ', en: 'Reject', zh: '拒绝' },
  statusPending: { th: 'รออนุมัติ', en: 'Pending', zh: '待批准' },
  statusApproved: { th: 'อนุมัติแล้ว', en: 'Approved', zh: '已批准' },
  statusRejected: { th: 'ไม่อนุมัติ', en: 'Rejected', zh: '已拒绝' },
  statusWithdrawn: { th: 'ถอนแล้ว', en: 'Withdrawn', zh: '已撤回' },
  swapGive: { th: 'ยกรอบให้คนอื่น', en: 'Give my session away', zh: '把场次让给他人' },
  swapTrade: { th: 'แลกรอบกัน', en: 'Trade sessions', zh: '互换场次' },
  swapTo: { th: 'ให้ใครแทน', en: 'Who takes over', zh: '由谁接替' },
  theirSession: { th: 'รอบของเขาที่เราจะไปแทน', en: 'Their session I take over', zh: '我接替的对方场次' },
  noTheirSessions: { th: 'คนนี้ยังไม่มีรอบที่ publish ใน 4 สัปดาห์ข้างหน้า', en: 'No published sessions for them in the next 4 weeks', zh: '此人未来4周没有已发布的场次' },
  swapLabel: { th: 'สลับกะ', en: 'Swap', zh: '换班' },
  swapGiveText: { th: '{from} ยกรอบ {mine} ให้ {to}', en: '{from} gives {mine} to {to}', zh: '{from} 将 {mine} 让给 {to}' },
  swapTradeText: { th: '{from} ({mine}) แลกกับ {to} ({theirs})', en: '{from} ({mine}) trades with {to} ({theirs})', zh: '{from}（{mine}）与 {to}（{theirs}）互换' },
  approvals: { th: 'รออนุมัติ', en: 'Waiting for approval', zh: '待审批' },
  nothingPending: { th: 'ไม่มีคำขอค้าง', en: 'Nothing waiting', zh: '没有待处理的申请' },
  teamOffDays: { th: 'วันหยุดทีม', en: 'Team off days', zh: '团队休息日' },
  teamOffHint: {
    th: 'วันหยุดทีมจะบล็อกตาราง จัดรอบในวันนั้นไม่ได้ (แยกจากการลาของแต่ละคน)',
    en: 'Team off days block the schedule: no session can be booked on them (separate from personal leave)',
    zh: '团队休息日会锁定排班，当天不能安排场次（与个人请假分开）',
  },
  offDayName: { th: 'ชื่อวันหยุด', en: 'Name', zh: '名称' },
  addOffDay: { th: '+ เพิ่มวันหยุด', en: '+ Add off day', zh: '+ 添加休息日' },
  remove: { th: 'ลบ', en: 'Remove', zh: '删除' },
  offDaySessions: {
    th: 'มี {n} รอบในวันนั้นอยู่แล้ว ไปยกเลิกหรือย้ายในหน้าตารางงานด้วย',
    en: '{n} sessions are already booked on that day. Cancel or move them on the Schedule page.',
    zh: '当天已有 {n} 个场次，请在排班页面取消或移动。',
  },
  allLeave: { th: 'ใบลาทั้งหมด', en: 'All leave', zh: '全部请假' },
  fileFor: { th: 'ยื่นลาแทน', en: 'File leave for', zh: '代为请假' },
  me: { th: 'ตัวเอง', en: 'Myself', zh: '自己' },

  // Hours vs KPI
  month: { th: 'เดือน', en: 'Month', zh: '月份' },
  kpiStaff: { th: 'พนักงานประจำ (เทียบ KPI)', en: 'Regular staff (vs KPI)', zh: '正式员工（对比KPI）' },
  noKpiStaff: {
    th: 'ไม่นับ KPI: guest, freelance, ฝึกงาน, operation',
    en: 'No KPI: guests, freelancers, interns, operation',
    zh: '不计KPI：嘉宾、自由职业、实习、运营',
  },
  kpiHint: {
    th: 'KPI นับเฉพาะชั่วโมงในตำแหน่งตัวเอง ชั่วโมงข้ามบท (PD ไปเป็น MC) KPI = 0 จึงแยกไว้อีกช่อง ตัวเลขรวมรอบที่ publish แล้วทั้งเดือน รวมรอบที่ยกเลิกแต่ยังนับชั่วโมง',
    en: 'KPI counts hours in the person’s own position. Hours in the other role (a PD hosting) have KPI 0 and are shown apart. Totals cover every published session in the month, plus cancelled ones still counted.',
    zh: 'KPI只计本岗位工时。跨岗位工时（导播担任主播）KPI为0，单独列出。合计包含当月所有已发布场次及仍计工时的取消场次。',
  },
  position: { th: 'ตำแหน่ง', en: 'Position', zh: '岗位' },
  ownRole: { th: 'ชม. ตำแหน่งตัวเอง', en: 'Own-role h', zh: '本岗工时' },
  kpi: { th: 'KPI', en: 'KPI', zh: 'KPI' },
  vsKpi: { th: 'เทียบ KPI', en: 'vs KPI', zh: '对比KPI' },
  crossRole: { th: 'ชม. ข้ามบท', en: 'Other-role h', zh: '跨岗工时' },
  total: { th: 'รวม', en: 'Total', zh: '合计' },
  done: { th: 'ทำแล้ว', en: 'Done', zh: '已完成' },
  sessionsCount: { th: 'รอบ', en: 'Sessions', zh: '场次' },
  employment: { th: 'ประเภท', en: 'Type', zh: '类型' },
  emp_full_time: { th: 'ประจำ', en: 'Full-time', zh: '正式' },
  emp_intern: { th: 'ฝึกงาน', en: 'Intern', zh: '实习' },
  emp_freelance: { th: 'ฟรีแลนซ์', en: 'Freelance', zh: '自由职业' },
  emp_guest: { th: 'Guest', en: 'Guest', zh: '嘉宾' },
  myHours: { th: 'ชั่วโมงเดือนนี้', en: 'Hours this month', zh: '本月工时' },
  ofKpi: { th: 'จาก KPI {kpi} ชม.', en: 'of {kpi} h KPI', zh: '/ KPI {kpi} 小时' },
  scheduledLeft: { th: 'ทำแล้ว {done} ชม. · ยังเหลือในตาราง {left} ชม.', en: '{done} h done · {left} h still scheduled', zh: '已完成 {done} 小时 · 排班中还有 {left} 小时' },

  // Live results
  recordResult: { th: 'บันทึกผลไลฟ์', en: 'Record live result', zh: '记录直播成绩' },
  session: { th: 'รอบไลฟ์', en: 'Session', zh: '场次' },
  noSessionsToday: { th: 'วันนี้ไม่มีรอบของคุณที่ publish แล้ว', en: 'You have no published sessions on this day', zh: '当天没有你的已发布场次' },
  dropHint: {
    th: 'วางแคปหน้าจอ (Ctrl+V) ลากไฟล์มาวาง หรือกดเลือก/ถ่ายรูป',
    en: 'Paste a screenshot (Ctrl+V), drop a file, or tap to choose / take a photo',
    zh: '粘贴截图 (Ctrl+V)、拖入文件，或点击选择/拍照',
  },
  aiReading: { th: 'AI กำลังอ่านตัวเลข…', en: 'AI is reading the numbers…', zh: 'AI 正在读取数据…' },
  aiDone: { th: 'AI อ่านแล้ว ตรวจตัวเลขก่อนกดยืนยัน ช่องสีเหลือง = AI ไม่แน่ใจ', en: 'Read by AI. Check the numbers before confirming; yellow = AI was unsure.', zh: 'AI 已读取。确认前请核对数字；黄色 = AI 不确定。' },
  aiOff: { th: 'ยังไม่ได้ตั้งค่า AI กรอกตัวเลขเองได้เลย', en: 'AI reading is not set up yet; type the numbers in.', zh: '尚未配置 AI，请手动填写。' },
  aiFailed: { th: 'AI อ่านรูปนี้ไม่ได้ ลองรูปที่ชัดกว่า หรือกรอกเอง', en: 'AI could not read this image. Try a clearer one, or type the numbers.', zh: 'AI 无法读取此图片，请换更清晰的图或手动填写。' },
  readAgain: { th: 'อ่านใหม่', en: 'Read again', zh: '重新读取' },
  capturedAt: { th: 'เวลาที่แคป', en: 'Captured at', zh: '截图时间' },
  liveStartedAt: { th: 'ไลฟ์เริ่มเมื่อ', en: 'Live started', zh: '直播开始' },
  flag: { th: 'Session Flag', en: 'Session flag', zh: '场次标记' },
  flagNew: { th: 'ไลฟ์ใหม่', en: 'New broadcast', zh: '新直播' },
  flagContinue: { th: 'ต่อจากรอบก่อน', en: 'Continues', zh: '延续' },
  flagHint: {
    th: 'ตัวเลขบนหน้าจอเป็นยอดสะสม ถ้า "ต่อจากรอบก่อน" ระบบจะลบยอดของบันทึกก่อนหน้าให้เอง',
    en: 'Dashboard numbers are cumulative. For "Continues", the previous reading is subtracted automatically.',
    zh: '屏幕数字为累计值。选择“延续”时会自动减去上一条记录。',
  },
  m_gmv: { th: 'GMV (฿)', en: 'GMV (฿)', zh: 'GMV (฿)' },
  m_orders: { th: 'ออเดอร์', en: 'Orders', zh: '订单' },
  m_itemsSold: { th: 'ชิ้นที่ขาย', en: 'Items sold', zh: '售出件数' },
  m_views: { th: 'ยอดวิว', en: 'Views', zh: '观看' },
  m_avgViewSec: { th: 'ดูเฉลี่ย (วิ)', en: 'Avg view (s)', zh: '平均观看(秒)' },
  m_productClicks: { th: 'คลิกสินค้า', en: 'Product clicks', zh: '商品点击' },
  m_buyers: { th: 'ผู้ซื้อ', en: 'Buyers', zh: '买家' },
  m_addToCart: { th: 'ใส่ตะกร้า', en: 'Add to cart', zh: '加购' },
  m_adsCost: { th: 'ค่าแอด (฿)', en: 'Ads cost (฿)', zh: '广告费 (฿)' },
  m_durationMin: { th: 'ไลฟ์มาแล้ว (นาที)', en: 'Duration (min)', zh: '时长(分钟)' },
  extraMetrics: { th: 'ค่าอื่นบนหน้าจอ', en: 'Other values on screen', zh: '屏幕上的其他数据' },
  confirmSave: { th: 'ยืนยันบันทึก', en: 'Confirm and save', zh: '确认保存' },
  saved: { th: 'บันทึกแล้ว', en: 'Saved', zh: '已保存' },
  todaysReadings: { th: 'บันทึกของวันนี้', en: 'Readings this day', zh: '当日记录' },
  noReadings: { th: 'ยังไม่มีบันทึก', en: 'No readings yet', zh: '暂无记录' },
  time: { th: 'เวลา', en: 'Time', zh: '时间' },
  increase: { th: 'เพิ่มขึ้น', en: 'Added', zh: '增量' },
  recordedBy: { th: 'บันทึกโดย', en: 'By', zh: '记录人' },
  gmvNote: { th: 'GMV ตามหน้าจอ (ก่อนหักคืนเงิน)', en: 'GMV as shown (before refunds)', zh: 'GMV 按屏幕显示（退款前）' },
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
  leave_quota_full: {
    th: 'วันที่ {date} มีคนตำแหน่งนี้ลาแล้ว {alreadyOff} คน (โควตา {quota})',
    en: '{date} already has {alreadyOff} people of this position off (quota {quota})',
    zh: '{date} 该岗位已有 {alreadyOff} 人请假（名额 {quota}）',
  },
  leave_overlap: { th: 'มีใบลาช่วงนี้อยู่แล้ว', en: 'You already have leave in this period', zh: '此时段已有请假' },
  has_sessions: { th: '{person} มีรอบไลฟ์ในช่วงนี้ แอดมินต้องหาคนแทน', en: '{person} has a session in this period; the admin will need a cover', zh: '{person} 此时段有场次，需管理员安排替班' },
  urgent_needs_reason: { th: 'ลาด่วนต้องใส่เหตุผล', en: 'Urgent leave needs a reason', zh: '紧急请假需填写原因' },
  already_decided: { th: 'คำขอนี้ถูกตัดสินไปแล้ว', en: 'This request was already decided', zh: '该申请已处理' },
  session_started: { th: 'รอบนี้เริ่มไปแล้ว', en: 'This session has already started', zh: '该场次已开始' },
  not_your_session: { th: 'ไม่ใช่รอบของคุณ', en: 'Not your session', zh: '不是你的场次' },
  target_already_in_session: { th: 'คนนี้อยู่ในรอบนั้นแล้ว', en: 'That person is already in the session', zh: '此人已在该场次中' },
  target_not_in_session: { th: 'คนนี้ไม่ได้อยู่ในรอบที่เลือก', en: 'That person is not in the chosen session', zh: '此人不在所选场次中' },
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

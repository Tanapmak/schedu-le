import { useEffect, useState } from 'react';
import type { Lang } from './i18n';
import { Modal } from './ui';

/**
 * "What changed" box: shown once to everyone after an update, and again from the Leave page.
 * Bump UPDATE_ID for the next update so people see it again.
 */
const UPDATE_ID = '2026-11-leave-hours';
const SEEN_KEY = 'whatsNewSeen';

type Text = Record<Lang, string>;
interface Item {
  title: Text;
  body: Text;
  /** Only admin / operation see it. */
  managers?: boolean;
}

const heading: Text = {
  th: 'อัปเดตระบบ: กฎลาด่วนและการนับชั่วโมง',
  en: 'Update: urgent leave and hours rules',
  zh: '系统更新：紧急请假与工时规则',
};

const intro: Text = {
  th: 'เมื่อคิวถูกยกเลิก ระบบนับชั่วโมงแยกรายคนแล้ว คนที่ไม่ได้ลายังได้ชั่วโมงตามเดิม ส่วนคนที่ลาจะได้หรือไม่ได้ ขึ้นกับเหตุผลและสิ่งที่เกิดขึ้นจริงในวันนั้น',
  en: 'When a session is cancelled, hours are now counted person by person. People not on leave still earn them; whether the person on leave does depends on the reason and on what actually happened that day.',
  zh: '场次取消时，工时现按个人分别计算。未请假的人照常计工时；请假者是否计工时，取决于原因和当天的实际情况。',
};

const items: Item[] = [
  {
    title: { th: 'ลาด่วนต้องเลือกเหตุผลและคิว', en: 'Urgent leave: pick a reason and the sessions', zh: '紧急请假需选原因和场次' },
    body: {
      th: 'เลือกเหตุผลจากรายการ (ป่วย / อุบัติเหตุ / ครอบครัวฉุกเฉิน / ธุระด่วน / อื่น ๆ) และติ๊กเฉพาะคิวที่มาไม่ได้ หรือเลือก "ลาทั้งวัน"',
      en: 'Choose a reason (sick / accident / family emergency / personal errand / other) and tick only the sessions you cannot work, or "whole day".',
      zh: '选择原因（生病/意外/家庭紧急情况/私事/其他），只勾选无法上班的场次，或选“全天”。',
    },
  },
  {
    title: { th: 'ได้ชั่วโมงเมื่อไหร่', en: 'When the hours count', zh: '何时计工时' },
    body: {
      th: 'ป่วย / อุบัติเหตุ / ครอบครัวฉุกเฉิน: ได้ชั่วโมงของคิวที่ถูกยกเลิก ถ้าวันนั้นไม่ได้กลับมาทำงานอีก ส่วนธุระด่วน อื่น ๆ และลาปกติไม่ได้ชั่วโมง ถ้ามีคนแทน คนแทนได้ชั่วโมง',
      en: 'Sick / accident / family emergency: you earn the cancelled session\'s hours if you do not work again that day. Personal errands, other reasons and normal leave earn none. If someone covers, they earn the hours.',
      zh: '生病/意外/家庭紧急情况：当天未再上班则计取消场次的工时。私事、其他原因和普通请假不计。有人替班则由替班者计工时。',
    },
  },
  {
    title: { th: '"กลับมาทำงาน" คืออะไร', en: 'What "worked again" means', zh: '什么算“又上班”' },
    body: {
      th: 'หลังเวลาเริ่มคิวที่ลา จนถึง 06:00 วันถัดไป ถ้า clock in หรือได้ไลฟ์คิวอื่น ถือว่ากลับมาทำงาน คิวที่ลาจะไม่ได้ชั่วโมง ระหว่างรอระบบจะขึ้นว่า "รอสรุป" และยังไม่นับเข้า KPI',
      en: 'From the start of the session you skipped until 06:00 next morning, clocking in or going live in another session counts as working again: the skipped session earns nothing. Until then it shows "Pending" and is not counted in KPI.',
      zh: '从请假场次开始到次日06:00，如打卡或参加其他场次直播，即算又上班，请假场次不计工时。在此之前显示“待定”，不计入KPI。',
    },
  },
  {
    title: { th: 'ป่วยติดกัน 2 วันขึ้นไป', en: 'Sick 2+ days in a row', zh: '连续病假2天以上' },
    body: {
      th: 'ต้องแนบใบรับรองแพทย์ให้ครบทุกวัน (ปุ่ม "แนบใบรับรองแพทย์" ในหน้าคำขอลา) ภายในวันที่ 25 ของเดือนถัดไป ถึงจะได้ชั่วโมง',
      en: 'Attach a medical certificate for every day ("Attach medical certificate" on the Leave page) by the 25th of next month to earn the hours.',
      zh: '需在次月25日前为每一天上传医生证明（请假页“上传医生证明”）才计工时。',
    },
  },
  {
    title: { th: 'สำหรับ operation / admin', en: 'For operation / admin', zh: '运营/管理员' },
    managers: true,
    body: {
      th: 'ตอนยกเลิกคิวต้องเลือกเหตุผล และเห็นผลการนับชั่วโมงรายคน เปลี่ยนเป็น "ให้" หรือ "ไม่ให้" ชั่วโมงได้แต่ต้องใส่เหตุผล คิวที่ยกเลิกไปแล้วคลิกจากตารางแบบวันเพื่อแก้ได้ หน้าอนุมัติลาจะโชว์จำนวนครั้งที่ลาด่วนในเดือน และ payroll Excel มีแท็บ "Cancelled & leave" กับ "Urgent leave"',
      en: 'Cancelling now asks for a reason and shows hours person by person; you can give or remove hours with a note. Click a cancelled session in the day view to change it later. Leave approval shows urgent leave this month, and payroll Excel has "Cancelled & leave" and "Urgent leave" sheets.',
      zh: '取消场次需选择原因，并按人显示工时；可填写原因后给予或取消工时。已取消场次可在日视图中点开修改。请假审批会显示本月紧急请假次数，薪资Excel新增“Cancelled & leave”和“Urgent leave”表。',
    },
  },
];

const gotIt: Text = { th: 'เข้าใจแล้ว', en: 'Got it', zh: '知道了' };
export const rulesLink: Text = { th: 'กฎลา & ชั่วโมง', en: 'Leave & hours rules', zh: '请假与工时规则' };

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === UPDATE_ID;
  } catch {
    return true; // storage blocked: don't nag on every page load
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, UPDATE_ID);
  } catch {
    // ignore
  }
}

export function WhatsNewBox({ lang, manager, onClose }: { lang: Lang; manager: boolean; onClose: () => void }) {
  const close = () => (markSeen(), onClose());
  return (
    <Modal
      title={heading[lang]}
      onClose={close}
      footer={
        <button className="primary" onClick={close}>
          {gotIt[lang]}
        </button>
      }
    >
      <div className="whats-new">
        <p>{intro[lang]}</p>
        <ol>
          {items
            .filter((i) => !i.managers || manager)
            .map((i) => (
              <li key={i.title.en}>
                <strong>{i.title[lang]}</strong>
                <p>{i.body[lang]}</p>
              </li>
            ))}
        </ol>
      </div>
    </Modal>
  );
}

/** Opens the box once per update, the first time someone opens the app after it. */
export function WhatsNewOnce({ lang, manager }: { lang: Lang; manager: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(!seen()), []);
  return open ? <WhatsNewBox lang={lang} manager={manager} onClose={() => setOpen(false)} /> : null;
}

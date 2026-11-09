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
  /** Short "if this, then that" lines under the body. */
  examples?: Record<Lang, string[]>;
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
    title: { th: 'ลาด่วนแล้วคิวถูกยกเลิก ได้ชั่วโมงไหม', en: 'Urgent leave, session cancelled: do I get the hours?', zh: '紧急请假导致场次取消，计工时吗？' },
    body: {
      th: 'ตัวอย่าง: มีคิว 15:00 และ 20:00 แล้วลาด่วนคิว 15:00 จนคิวถูกยกเลิก',
      en: 'Example: you have sessions at 15:00 and 20:00, take urgent leave from the 15:00 one, and it is cancelled.',
      zh: '例子：你有15:00和20:00两场，15:00那场紧急请假，该场被取消。',
    },
    examples: {
      th: [
        '✅ ลาป่วย / อุบัติเหตุ / ครอบครัวฉุกเฉิน แล้ววันนั้นไม่ได้ทำงานอีกเลย → ได้ชั่วโมงคิว 15:00',
        '❌ ลาป่วย แต่ยังมาไลฟ์คิว 20:00 → คิว 15:00 ไม่ได้ชั่วโมง (คิว 20:00 ได้ตามปกติ)',
        '❌ ลาธุระด่วน / เหตุผลอื่น / ลาปกติ → คิว 15:00 ไม่ได้ชั่วโมง',
        '👥 คนที่ไม่ได้ลา (เช่นคู่ไลฟ์) → ได้ชั่วโมงตามปกติ ถ้ามีคนมาแทน คนแทนได้ชั่วโมง',
      ],
      en: [
        '✅ Sick / accident / family emergency, and you do not work again that day → you get the 15:00 hours',
        '❌ Sick, but you still go live at 20:00 → no hours for 15:00 (20:00 counts as normal)',
        '❌ Personal errand / other reason / normal leave → no hours for 15:00',
        '👥 People not on leave (e.g. your partner) → hours as normal. If someone covers, they get the hours',
      ],
      zh: [
        '✅ 生病/意外/家庭紧急情况，且当天没再上班 → 15:00那场计工时',
        '❌ 请病假，但20:00照常直播 → 15:00那场不计工时（20:00照常计）',
        '❌ 私事/其他原因/普通请假 → 15:00那场不计工时',
        '👥 没请假的人（如搭档）→ 照常计工时；有人替班则由替班者计工时',
      ],
    },
  },
  {
    title: { th: 'ทำไมขึ้นว่า "รอสรุป"', en: 'Why it says "Pending"', zh: '为什么显示“待定”' },
    body: {
      th: 'ระบบต้องรอดูว่าวันนั้นคุณกลับมาทำงานหรือเปล่า (clock in หรือได้ไลฟ์คิวอื่น) จึงสรุปตอน 06:00 ของวันถัดไป ระหว่างรอยังไม่นับเข้า KPI',
      en: 'The system waits to see whether you work again that day (clock in or go live in another session), so it decides at 06:00 next morning. Until then it is not counted in KPI.',
      zh: '系统要看你当天是否又上班（打卡或参加其他场次直播），所以在次日06:00才确定。在此之前不计入KPI。',
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
                {i.examples && (
                  <ul className="whats-new-examples">
                    {i.examples[lang].map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
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

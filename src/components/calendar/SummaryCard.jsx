import { isSameDay, differenceInMinutes } from "date-fns";

const roomColors = {
  "tiktok 1": "#505050",
  "tiktok 2": "#878787",
  lazada: "#4979D2",
  shopee: "#DD6E00",
  "content room": "#A149FF",
  "day off": "#ED3419",
}

const SummaryCard = ({ value, events }) => {
  // filter event เฉพาะวันที่นี้
  const eventsForDay = events.filter(event =>
    isSameDay(event.start, value)
  );

  // group by room และรวมเวลาทั้งหมด (นาที → ชั่วโมง)
  const summary = {};
  eventsForDay.forEach(event => {
    const room = event.title?.toLowerCase() || "Unknown";
    const type = event.type?.toLowerCase() || "Unknown";
    const duration = (event.end - event.start) / (1000 * 60 * 60); 

    summary[room] = (summary[room] || 0) + duration;
  });

  return (
    <div style={{ padding: "4px" }}>
      {/* ตรงนี้แสดง text summary แทน */}
      {Object.entries(summary).map(([room, hours]) => (
        <div 
          key={room} 
          style={{
            backgroundColor: roomColors[room] || "#ccc",
            color: "#FFF",
            borderRadius: "3px",
            fontSize: "0.6rem",
            padding: "2px 4px",
            maxWidth: "90px",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}>
          <strong>{room}{type}</strong>: {hours.toFixed(0)} hrs
        </div>
      ))}
    </div>
  );
};

export default SummaryCard
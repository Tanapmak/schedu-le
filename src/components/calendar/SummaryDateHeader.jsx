import React from "react";

import { isSameDay, differenceInMinutes } from "date-fns";

const roomColors = {
  "tiktok 1": "#505050",
  "tiktok 2": "#878787",
  lazada: "#4979D2",
  shopee: "#DD6E00",
  "content room": "#A149FF",
  "Day off": "#ED3419",
}

const SummaryDateHeader = ({ onClick, label, date, events, currentView }) => {
  if(currentView !== "month") return <span>{label}</span>

  const eventsForDay = events.filter(ev =>
    isSameDay(ev.start, date)
  );

  const summary = {};
  eventsForDay.forEach(event => {
    const room = event.day_type === "dayoff" || (!event.room_id && !event.mc_id && !event.pd_id) 
    ? "Day off" 
    : event.room_name?.toLowerCase() || "Unknown";
    const duration = (event.end - event.start) / (1000 * 60 * 60); 

    summary[room] = (summary[room] || 0) + duration;
  });

  const handleClick = () => {
    onClick(date)
  }

  return (
    <div onClick={handleClick} style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
    }}>
        <span style={{
            fontSize: "0.75rem",
            fontWeight: 400,
        }}>
            {label}
        </span>
      {Object.entries(summary).map(([room, hours]) => (
        <div 
          key={room} 
          style={{
            backgroundColor: 
            roomColors[room] || "#ccc",
            color: "#FFF",
            borderRadius: "3px",
            fontSize: "0.7rem",
            padding: "2px 10px",
            maxWidth: "100%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textTransform: "capitalize",
            display: "flex",
            justifyContent: "space-between"
          }}>
          <strong>{room}</strong> {hours.toFixed(0)} hrs
        </div>
      ))}
    </div>
  );
};

export default SummaryDateHeader
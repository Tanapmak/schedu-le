import { isSameDay } from "date-fns";
import React from "react";

const SessionCard = ({ event, view ,allEvents}) => {
  const startTime = new Date(event.start || event.session_start);
  const endTime = new Date(event.end || event.session_end);
  const durationHours = (endTime - startTime) / 1000 / 60 / 60;

  if (view === "month") {
    const sameDayEvents = allEvents.filter((e) => 
      isSameDay(new Date(e.start || e.session_start), startTime));

    const isFirstOfDay = sameDayEvents[0]?.id === event.id;
    if (!isFirstOfDay) return null;

    const summary = {};
    sameDayEvents.forEach(e => {
      const room = e.room_name || "Unknown";
      const evStart = new Date(e.start || e.session_start);
      const evEnd = new Date(e.end || e.session_end);
      const duration = (evEnd - evStart) / 1000 / 60 / 60;
      summary[room] = (summary[room] || 0) + duration;
    });

        return (
            <div style={{ fontSize: "0.7rem", padding: "2px" }}>
                {Object.entries(summary).map(([room, hours]) => (
                <div key={room}>
                    <strong>{room}</strong> total {hours.toFixed(0)} hrs
                </div>
                ))}
            </div>
        );
    }

  return (
    <div style={{ padding: "4px", fontSize: "0.75rem" }}>
      <strong>{event.room_name || "Day off"}</strong><br />
      {event.mc_name || "All MC"} / {event.pd_name || "All PD"}<br />
      <span style={{ fontSize: '0.7rem', color: '#f0f0f0' }}>
        {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
        {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

export default SessionCard;
import { isSameDay } from "date-fns";
import React from "react";

const SessionCard = ({ event, view ,allEvents, uSage}) => {
const durationHours = (new Date(event.end) - new Date(event.start)) / 1000 / 60 / 60;
    if(view === "month" && uSage === "admin") {
        const sameDayEvents = allEvents.filter(e => isSameDay(new Date(e.start), new Date(event.start)));

        if (sameDayEvents[0] !== event) return null;

        const summary = {};
        sameDayEvents.forEach(e => {
            const room = e.title || "Unknown";
            const duration = (new Date(e.end) - new Date(e.start)) / (1000 * 60 * 60);
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
      <strong>{event.title}</strong><br />
      {event.mc} / {event.pd}<br />
      <span style={{ fontSize: '0.7rem', color: '#f0f0f0' }}>
        {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
        {event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

export default SessionCard;
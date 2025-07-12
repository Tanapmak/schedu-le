import { isSameDay } from "date-fns";
import React from "react";

const UserSessionCard = ({ event, view ,allEvents}) => {

  return (
    <div style={{ padding: "4px", fontSize: "0.7rem" }}>
      <strong>{event.title}</strong><br />
      <span style={{ fontSize: '0.6rem', color: '#f0f0f0' }}>
        {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
        {event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
};

export default UserSessionCard;
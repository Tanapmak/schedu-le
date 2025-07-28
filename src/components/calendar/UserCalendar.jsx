import React, {useState} from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enUS from "date-fns/locale/en-US";
import thTH from "date-fns/locale/th";
import "react-big-calendar/lib/css/react-big-calendar.css";
import SummaryDateHeader from "./SummaryDateHeader";
import UserSessionCard from "./UserSessionCard";

const locales = {
  "en-US": enUS,
  "th-TH": thTH,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const UserCalendar = ({currentView, setCurrentView, events}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  return (
    <div style={{ height: "83vh", paddingTop: "20px" }}>
      <Calendar
        localizer={localizer}
        events={events}
        eventPropGetter={(event) => {
          const backupColor = "#546e7a";
          const isDayOff = event.day_type === "dayoff" || (!event.room_id && !event.mc_id && !event.pd_id)
          const bgColor = isDayOff ? "#ED3419" : event.color || backupColor;

          return {
            style: {
              backgroundColor: bgColor,
              borderRadius: "6px",
              color: "#fff",
              border: "none",
              padding: "4px",
            },
          };
        }}
        startAccessor="start"
        endAccessor="end"
        view={currentView}
        onView={(view) => setCurrentView(view)}
        date={currentDate}
        onNavigate={(newDate) => setCurrentDate(newDate)}
        defaultView="month"
        views={["month", "week", "day"]}
        dayLayoutAlgorithm="no-overlap"
        style={{ 
          height: "100%", 
          backgroundColor: "white", 
          borderRadius: "6px" 
        }}
      />
    </div>
  );
};

export default UserCalendar;

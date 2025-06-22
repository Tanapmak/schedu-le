import React, {useState} from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enUS from "date-fns/locale/en-US";
import thTH from "date-fns/locale/th";
import "react-big-calendar/lib/css/react-big-calendar.css";

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

const events = [
  {
    title: "TikTok 1",
    mc: "Newyear",
    pd: "Tongvha",
    start: new Date(2025, 5, 9, 14, 0),
    end: new Date(2025, 5, 9, 15, 0),
  },
  {
    title: "TikTok 2",
    mc: "Newyear",
    pd: "Tongvha",
    start: new Date(2025, 5, 9, 14, 0),
    end: new Date(2025, 5, 9, 15, 0),
  },
  {
    title: "TikTok 2",
    mc: "Newyear",
    pd: "Tongvha",
    start: new Date(2025, 5, 9, 14, 0),
    end: new Date(2025, 5, 9, 15, 0),
  },
];

const UserCalendar = () => {
    const [currentView, setCurrentView] = useState("month");
  return (
    <div style={{ height: "83vh", paddingTop: "20px" }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={currentView}
        onView={(view) => setCurrentView(view)}
        defaultView="month"
        views={["month", "week", "day"]}
        style={{ height: "100%", backgroundColor: "white", borderRadius: "8px" }}
      />
    </div>
  );
};

export default UserCalendar;

import React, {useState} from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import enUS from "date-fns/locale/en-US";
import thTH from "date-fns/locale/th";
import AddSessionForm from "./AddSessionForm";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "../styles/admin-calendar.css";
import SessionCard from "./SessionCard";
import SummaryCard from "./SummaryCard";
import EventDetailModal from "./EventDetailModal";

import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import SummaryDateHeader from "./SummaryDateHeader";

const DnDCalendar = withDragAndDrop(Calendar);

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


const AdminCalendar = () => {
  const [currentView, setCurrentView] = useState("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const [openToolBar, setOpenToolBar] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState({
    start: "",
    end: "",
  });

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editMode, setEditMode] = useState(false);

  const handleDeleteEvent = () => {
    setEvents(
      (prevEvents) => prevEvents.filter((ev) => ev.id !== selectedEvent.id)
    );
    setSelectedEvent(null);
  }

  const [validationErrors, setVariationErrors] = useState([]);

  const getWorkForceHours = (start, end) => (new Date(end) - new Date(start)) / (1000 * 60 * 60)

  const validateSession = (newEvent) => {
        const errors = [];

        const newStart = new Date(newEvent.start);
        const newEnd = new Date(newEvent.end);

        //check overlap session
        const overlapping = events.filter((ev) => 
        ev.id !== newEvent.id &&
        newStart < new Date(ev.end) &&
        newEnd > new Date(ev.start)
        );

        overlapping.forEach(ev => {
            if (ev.title === newEvent.title) {
                errors.push(`Room conflict with ${ev.start.toLocaleDateString("en-GB")}, cannot assign new session to ${ev.title}`)
            }

            if(ev.mc === newEvent.mc) {
                errors.push(`MC duplication on ${ev.start.toLocaleDateString("en-GB")}, cannot assign new session to ${ev.mc}`)
            }

            if(ev.pd === newEvent.pd) {
                errors.push(`PD duplication on ${ev.start.toLocaleDateString("en-GB")}, cannot assign new session to ${ev.pd}`)
            }
        })

        //check total hours
        const mcTotal = events
        .filter(ev => ev.mc === newEvent.mc && ev.id !== newEvent.id)
        .reduce((sum, ev) => sum + getWorkForceHours(ev.start, ev.end),0) + getWorkForceHours(newStart, newEnd);

        const pdTotal = events
        .filter(ev => ev.pd === newEvent.pd && ev.id !== newEvent.id)
        .reduce((sum, ev) => sum + getWorkForceHours(ev.start, ev.end),0) + getWorkForceHours(newStart, newEnd);

        if(mcTotal > 124) errors.push(`${newEvent.mc} already exceed max hours (124 HRS), exceed amount: ${mcTotal.toFixed(1)} HRS`)
        // else if(mcTotal < 96) errors.push(`${newEvent.mc} still need ${mcTotal.toFixed(1)} HRS to acheive min KPI (96 HRS)`)

        if(pdTotal > 176) errors.push(`${newEvent.pd} already exceed max hours (176 HRS), exceed amount: ${pdTotal.toFixed(1)} HRS`)
        // else if(pdTotal < 132) errors.push(`${newEvent.pd} still need ${pdTotal.toFixed(1)} HRS to acheive min KPI (132 HRS)`)

        return errors
    }

  const handleDnD = ({event, start, end}) => {
    const updatedEvent = {...event, start, end};

    const errors = validateSession(updatedEvent);

    if(errors.length > 0) {
      setVariationErrors(errors)
      errors.forEach((err) => alert(err));
      return;
    }

    setEvents((prevEvents) => 
      prevEvents.map((ev) => (ev.id === event.id ? updatedEvent : ev))
    );
  }

  return (
    <div className="admin-calendar-container">
      <DndProvider backend={HTML5Backend}>
        <DnDCalendar
        localizer={localizer}
        events={currentView === "month" ? [] : events}
        eventPropGetter={(event) => {
          const roomColors = {
            "tiktok 1": "#505050",
            "tiktok 2": "#878787",
            lazada: "#4979D2",
            shopee: "#DD6E00",
            "content room": "#A149FF",
          };

          return {
            style: {
              backgroundColor: roomColors[event.title?.toLowerCase()] || "#546e7a",
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
        step={60}
        timeslots={1}
        onNavigate={(newDate) => setCurrentDate(newDate)}
        defaultView="month"
        views={["month", "week", "day"]}
        style={{ flex: "1", height: "100%", backgroundColor: "white", borderRadius: "8px" }}
        longPressThreshold={1}
        dayLayoutAlgorithm="no-overlap"
        components={{
             event: (props) => (
              currentView === "month"
              ? null
              : <SessionCard event={props.event} view={currentView} allEvents={events}/>
          ),
          month: {
            dateHeader: (props) => (
              <SummaryDateHeader 
                {...props}
                events={events}
                currentView={currentView}
              />
            )
          }
        }}
        formats={{
          eventTimeRangeFormat: () => "", // ปิดเวลา default
        }}
        onEventDrop={handleDnD}
        resizable={true}
        onEventResize={handleDnD}
        selectable
        onSelectSlot={(slotInfo) => {
          setOpenToolBar(true)
          setSelectedSlot(() => {
            return {
              start: slotInfo.start,
              end: slotInfo.end,
            }
          }) 
          console.log(slotInfo);
        }}
        onSelectEvent={(event) => {
          console.log(event); 
          setSelectedEvent(event)
          setEditMode(false);
          setOpenToolBar(false);
        }}
      />
      </DndProvider>

      {selectedEvent && !editMode &&
        <EventDetailModal
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
          }}
          onEdit={() => {
            setEditMode(true);
            setOpenToolBar(true);
          }}
          onDelete={handleDeleteEvent}
        />
      }

      {openToolBar &&
        <AddSessionForm 
          isOpen={openToolBar}
          events={events}
          existingEvent={editMode ? selectedEvent : null}
          selectRoom={editMode ? selectedEvent.title : selectedSlot.title}
          startSession={editMode ? selectedEvent.start : selectedSlot.start}
          endSession={editMode ? selectedEvent.end : selectedSlot.end}
          mcName={editMode ? selectedEvent.mc : selectedSlot.mc}
          pdName={editMode ? selectedEvent.pd : selectedSlot.pd}
          isEditMode={editMode}
          onClose={() => {
            setOpenToolBar(false);
            setSelectedSlot(null);
            setEditMode(false);
            setSelectedEvent(null)
          }}
          onSave={(newEvent) => {
            if (editMode) {
              setEvents(
                (prevEvents) => 
                  prevEvents.map((ev) => 
                    ev.id === newEvent.id ? newEvent : ev)
              );
            } else {
              setEvents((prev) => [...prev, newEvent]);
            }

            setOpenToolBar(false);
            setSelectedEvent(null);
            setEditMode(false);
            setSelectedSlot(null);
          }}
        />
      }
    </div>
  );
};

export default AdminCalendar;

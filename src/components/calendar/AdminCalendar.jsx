import React, {useState} from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import enUS from "date-fns/locale/en-US";
import thTH from "date-fns/locale/th";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../../styles/admin-calendar.css";
import AddSessionForm from "../forms/AddSessionForm";
import SessionCard from "./SessionCard";
import EventDetailModal from "./EventDetailModal";
import SummaryDateHeader from "./SummaryDateHeader";
import SummaryCardPanel from "./SummaryCardPanel";
import AddHolidayForm from "../forms/AddHolidayForm";

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

const AdminCalendar = ({
  currentView,
  setCurrentView,
  currentDate,
  setCurrentDate,
  openToolBar,
  setOpenToolBar,
  editMode,
  setEditMode,
  events,
  setEvents,
  selectedEvent,
  setSelectedEvent,
  selectedSlot,
  setSelectedSlot,
  validateSession,
  getWorkForceHours, 
  targetEvent,
  setTargetEvent,
  isClickDayOff,
  setClickDayOff,
  holidayEvents,
  setHolidayEvents,
  isDayOfDate,
  setDayOffDate,
}) => {

  const [selectedSummaryDate, setSelectedSummaryDate] = useState(null)
  const [selectedSummaryTitle, setSeletedSummaryTitle] = useState(null)
  const [clickSummaryCard, setClickSummaryCard] = useState(false)
  const [clickSeeAllBtn, setClickSeeAllBtn] = useState(false);

  const allEvents = [...events, ...holidayEvents]
  
  const isHoliday = holidayEvents.some(holiday =>
    isSameDay(newEvent.start, holiday.start)
  );

  const handleDeleteEvent = (event) => {
    setEvents(
      (prevEvents) => prevEvents.filter((ev) => ev.id !== targetEvent.id)
    );
    setTargetEvent(null);
  }

    const checkDayOff = (startDate, endDate) => {
        const startDay = new Date(startDate).toDateString();
        const endDay = new Date(endDate).toDateString();

        const hasDayOff = events.some(ev => {
          const evDate = new Date(ev.start).toDateString();
          return evDate === startDay && ev.title?.toLowerCase() === "day off";
        });

        if(hasDayOff) {
          alert("Today is day off, cannot add session!");
          return null;
        }

        return {
          start: startDate,
          end: endDate
        }
    }  

  const [validationErrors, setValidationErrors] = useState([]);

  const handleDnD = ({event, start, end}) => {
    const updatedEvent = {...event, start, end};

    const errors = validateSession(updatedEvent);

    if(errors.length > 0) {
      setValidationErrors(errors)
      errors.forEach((err) => alert(err));
      return;
    }

    setEvents((prevEvents) => 
      prevEvents.map((ev) => (ev.id === event.id ? updatedEvent : ev))
    );
  }

  const handleSummaryPanelClose = () => {
    setTargetEvent(null);
    setClickSummaryCard(false);
  }

  const handleEditEvent = (event) => {
    if(clickSummaryCard === true) {
      setClickSummaryCard(false)
    }
    setTargetEvent(event)
    setEditMode(true);
    setOpenToolBar(true);
  }

  const handleSaveEvent = (newEvent) => {
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
    setTargetEvent(null);
    setEditMode(false);
    setSelectedSlot(null);
    setClickSummaryCard(false);
  }

  const handleModalClose = () => {
    setTargetEvent(null); 
    setClickSummaryCard(false); 
  }

  const handleFormClose = () => {
    setOpenToolBar(false)
    setSelectedSlot(null);
    setEditMode(false);
    setTargetEvent(null);
    setClickSummaryCard(false);
  }

  const handleSelectedSlot = (slotInfo) => {
    const verifyWorkingDate = checkDayOff(slotInfo.start, slotInfo.end)
    
      if(!verifyWorkingDate || clickSummaryCard) return;
      console.log(verifyWorkingDate);
      
      setOpenToolBar(true)
      setSelectedSlot(() => {
        return {
          start: verifyWorkingDate.start,
          end: verifyWorkingDate.end,
        }
      }) 
  } 

  const handleSelectedEvent = (event) => {
    console.log(event); 
    setTargetEvent(event)
    setEditMode(false);
    setOpenToolBar(false);
  }

  const handleClickedSummaryCard = (clickedDate) => {
    setSelectedSummaryDate(clickedDate)
    setClickSummaryCard(true)
    console.log(selectedSummaryTitle);
  }
  const handleSeeAllBtnClick = () => {
    setClickSeeAllBtn(true)
    setCurrentView("day")
    setClickSummaryCard(false)
    setCurrentDate(selectedSummaryDate)
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
            "day off": "#ED3419",
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
                onClick={handleClickedSummaryCard}
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
        onSelectSlot={handleSelectedSlot}
        onSelectEvent={handleSelectedEvent}
      />
      </DndProvider>

      {targetEvent && !editMode &&
        <EventDetailModal
          event={targetEvent}
          onClose={handleModalClose}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
        />
      }

      {openToolBar && 
        <AddSessionForm 
          isOpen={openToolBar}
          events={events}
          existingEvent={editMode ? targetEvent : null}
          selectRoom={editMode ? targetEvent.title : selectedSlot.title}
          startSession={editMode ? targetEvent.start : selectedSlot.start}
          endSession={editMode ? targetEvent.end : selectedSlot.end}
          mcName={editMode ? targetEvent.mc : selectedSlot.mc}
          pdName={editMode ? targetEvent.pd : selectedSlot.pd}
          dayType={editMode ? targetEvent.type : selectedSlot.type}
          isEditMode={editMode}
          validateSession={validateSession}
          getWorkForceHours={getWorkForceHours}
          onClose={handleFormClose}
          onSave={handleSaveEvent}
          isClickDayOff={isClickDayOff}
          isHolidayDate={isHoliday}
        />
      }

      {clickSummaryCard && selectedSummaryDate &&
      <SummaryCardPanel 
        onClose={handleSummaryPanelClose}
        onEdit={handleEditEvent}
        onDelete={(event) => {
          setEvents((prevEvents) => 
            prevEvents.filter((ev) => ev.id !== event.id)
          );
        }}
        events={events.filter((ev => ev.start.toDateString() === selectedSummaryDate.toDateString()))}
        isClickSummaryCard={clickSummaryCard}
        setClickSeeAllBtn={handleSeeAllBtnClick}
      />
      }
    </div>
  );
};

export default AdminCalendar;

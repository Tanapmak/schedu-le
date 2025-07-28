import React, {useState, useEffect} from "react";
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
import api from "../../api.js";

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

  useEffect(() => {
  console.log("🧠 Events passed to calendar:", events);
  if (events.length > 0) {
    console.log("✅ Example event:", events[0]);
    console.log("🕒 start type:", typeof events[0].start, "value:", events[0].start);
    console.log("🕒 end type:", typeof events[0].end, "value:", events[0].end);
  }
}, [events]);

  const allEvents = [...events, ...holidayEvents]
  
  const isHoliday = holidayEvents.some(holiday =>
    isSameDay(newEvent.start, holiday.start)
  );

  const handleDeleteEvent = async (deleteEvent) => {
    try {
      const targetID = deleteEvent.id;
      const result = await api.delete(`sessions/${targetID}`);
      setEvents(
        (prevEvents) => prevEvents.filter((ev) => ev.id !== targetID)
      );
      setTargetEvent(null);
      setSelectedSlot(null);
      setOpenToolBar(false);
      
    } catch (err) {
      console.error("delete event error :", err);
    }
  }

    const checkDayOff = (startDate, endDate) => {
      if (clickSummaryCard) {
        return {
          start: startDate,
          end: endDate,
        }
      }
        const startDay = new Date(startDate).toDateString();
        const endDay = new Date(endDate).toDateString();

        const hasDayOff = events.some(ev => {
          const evDate = new Date(ev.start).toDateString();
          return evDate === startDay && ev.day_type?.toLowerCase() === "dayoff";
        });

        if(hasDayOff) {
          alert("Today is day off, cannot add session!");
          setOpenToolBar(false);
          return null;
        }
        if(!hasDayOff && !clickSummaryCard) {
          setOpenToolBar(true)
          return {
            start: startDate,
            end: endDate
          }
        }
    }  

  const [validationErrors, setValidationErrors] = useState([]);

  const handleDnD = async ({event, start, end}) => {
    console.log("DnD received event:",event);
    
    try {
      const payload = {
        day_type: event.day_type,
        room_id: event.room_id,
        mc_id: event.mc_id,
        pd_id: event.pd_id,
        session_start: new Date(start).toISOString(),
        session_end: new Date(end).toISOString(),
      }

      console.log("check payload",payload);
      

      const response = await api.patch(`sessions/${event.id}`, payload);

      setEvents((prevEvents) => {
        return prevEvents.map(
          (ev) => ev.id === event.id
        ? {...response.data,
            session_start: new Date(response.data.session_start),
            session_end: new Date(response.data.session_end),
            start: new Date(response.data.session_start),
            end: new Date(response.data.session_end),
          }
        : ev
        ) 
      });
    } catch (err) {
      console.error("Admin calendar DnD error",err);
      alert(`Failed update session : ${err?.response?.data?.error || err.message}`);
    }
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
    console.log("handleEditEvent event: ", event);
    console.log("handleEditEvent targetevent", targetEvent);
    
    setEditMode(true);
    setOpenToolBar(true);
  }

  const handleSaveEvent = async (newEvent) => {
    try {
      const payload = {
        day_type: newEvent.day_type,
        room_id: newEvent.room_id,
        mc_id: newEvent.mc_id,
        pd_id: newEvent.pd_id,
        session_start: format(newEvent.session_start, "yyyy-MM-dd'T'HH:mm:ss"),
        session_end: format(newEvent.session_end,"yyyy-MM-dd'T'HH:mm:ss"),
      }

      if (editMode) {
        console.log(payload);
        
        const response = await api.put(`/sessions/${newEvent.id}`, payload);

        setEvents((prevEvents) => {
          return prevEvents.map(
            (ev) => ev.id === newEvent.id 
            ? {...response.data, 
                session_start: new Date(response.data.session_start),
                session_end: new Date(response.data.session_end),
                start: new Date(response.data.session_start),
                end: new Date(response.data.session_end),
              } 
            : ev
          )
        });
      } else {
        console.log("handleSave data set:", payload);
        const response = await api.post(`/sessions`, payload);
        
        setEvents((prev) => [
          ...prev,
          {...response.data,
            session_start: new Date(response.data.session_start),
            session_end: new Date(response.data.session_end),
            start: new Date(response.data.session_start),
            end: new Date(response.data.session_end),
          }
          
          
        ]);
      };
      setOpenToolBar(false);
      setTargetEvent(null);
      setEditMode(false);
      setSelectedSlot(null);
      setClickSummaryCard(false);
    } catch (err) {
      console.error("Unable to save event:", err);
    };
  };

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
    console.log("verified date after select slot", verifyWorkingDate);
    
    
      if(!verifyWorkingDate || clickSummaryCard) {
        console.log(verifyWorkingDate);
        return;
      } 
        // setOpenToolBar(true)
        setSelectedSlot({
            day_type: "",
            room_id: "",
            room_name: "",
            mc_id: "",
            mc_name: "",
            pd_id: "",
            pd_name: "",
            start: verifyWorkingDate.start,
            end: verifyWorkingDate.end,
          });

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
              backgroundColor: 
              event.day_type === "dayoff" || (!event.room_id && !event.mc_id && !event.pd_id)
              ? "#ED3419"
              : roomColors[event.room_name?.toLowerCase()] || "#546e7a",
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
          selectRoom={editMode ? targetEvent.room_name : selectedSlot.room_name}
          sessionStart={editMode ? targetEvent.session_start : selectedSlot.start}
          sessionEnd={editMode ? targetEvent.session_end : selectedSlot.end}
          mcName={editMode ? targetEvent.mc_name : selectedSlot.mc_name}
          pdName={editMode ? targetEvent.pd_name : selectedSlot.pd_name}
          dayType={editMode ? targetEvent.day_type : selectedSlot.day_type}
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
        events={events.filter((ev => new Date(ev.start).toDateString() === selectedSummaryDate.toDateString()))}
        isClickSummaryCard={clickSummaryCard}
        setClickSeeAllBtn={handleSeeAllBtnClick}
      />
      }
    </div>
  );
};

export default AdminCalendar;

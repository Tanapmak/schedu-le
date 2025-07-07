import React, { useState } from "react";
import "../styles/manage-schedule.css"
import AdminCalendar from "../components/calendar/AdminCalendar";
import AddSessionForm from "../components/forms/AddSessionForm";
import SessionCard from "../components/calendar/SessionCard";
import EventDetailModal from "../components/calendar/EventDetailModal";
import SummaryDateHeader from "../components/calendar/SummaryDateHeader";

export default function ManageSchedule() {
    const [currentView, setCurrentView] = useState("week");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [openToolBar, setOpenToolBar] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [targetEvent, setTargetEvent] = useState(null);
    const [selectedSlot, setSelectedSlot] = useState({
        start: "",
        end: "",
    });

    const [isClickDayOff, setClickDayOff] = useState(false);
    const [holidayEvents, setHolidayEvents] = useState([]);
    const [isDayOffDate, setDayOffDate] = useState(false);
    

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

            //check holiday
    
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

    const handleAddSessionBtnClick = () => {
        setOpenToolBar(true);
        setEditMode(false);
        setTargetEvent(null);
        setSelectedSlot({
            start: currentDate,
            end: currentDate,
        })
    }

    const handleAddDayOffBtnClick = () => {
        setOpenToolBar(true);
        setEditMode(false);
        setTargetEvent(null);
        setSelectedSlot({
            start: currentDate,
            end: currentDate,
        })
        setClickDayOff(true);
    }

    return (
        <div className="main-container">
            <div className="header-container">
                <div className="breadcrum">
                    <p>livestream</p><i className="fa-solid fa-chevron-right"></i><p>manage schedule</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>manage schedule</h2>
                    </div>
                    <div className="export-section">
                        <button className="export-btn" onClick={handleAddSessionBtnClick}>add schedule</button>
                        <button className="export-btn" onClick={handleAddDayOffBtnClick}>add day-off</button>
                        <button className="add-session-btn">export schedule</button>
                    </div>
                </div>
            </div>
            <div className="body-container">
                <AdminCalendar 
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
                    openToolBar={openToolBar}
                    setOpenToolBar={setOpenToolBar}
                    editMode={editMode}
                    setEditMode={setEditMode}
                    events={events}
                    setEvents={setEvents}
                    selectedEvent={selectedEvent}
                    setSelectedEvent={setSelectedEvent}
                    selectedSlot={selectedSlot}
                    setSelectedSlot={setSelectedSlot}
                    validateSession={validateSession}
                    targetEvent={targetEvent}
                    setTargetEvent={setTargetEvent}
                    isClickDayOff={isClickDayOff}
                    holidayEvents={holidayEvents}
                    setHolidayEvents={setHolidayEvents}
                />
            </div>
        </div>
    );
}
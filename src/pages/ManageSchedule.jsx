import React, { useState, useEffect } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import api from "../api.js";
import "../styles/manage-schedule.css"
import AdminCalendar from "../components/calendar/AdminCalendar";

export default function ManageSchedule() {
    // Calendar view & data state
    const [currentView, setCurrentView] = useState("week");
    const [currentDate, setCurrentDate] = useState(new Date());

    // Data Lists
    const [events, setEvents] = useState([]);
    const [holidayEvents, setHolidayEvents] = useState([]);

    // Form & selection states
    const [openToolBar, setOpenToolBar] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [targetEvent, setTargetEvent] = useState(null);
    const [selectedSlot, setSelectedSlot] = useState({});

    // Day-offs controls
    const [isClickDayOff, setClickDayOff] = useState(false);

    //totalhours data
    const [hoursData, setHourData] = useState({});

    const fetchHoursData = async (date = currentDate) => {
        try {
            const start = new Date(startOfMonth(date).setHours(0, 0, 0, 0)).toLocaleString();
            const end = new Date(endOfMonth(date).setHours(23, 59, 59, 999)).toLocaleString();
            const result = await api.get(`/summary?start=${start}&end=${end}`);
            console.log("API hours data", result.data);
            
            setHourData(result.data);
        } catch (err) {
            console.error("Error fetching hours data", err);
        }
    }

    useEffect(() => {
        fetchHoursData(currentDate);
    },[currentDate]);

    const currentTotalHours = hoursData.total_hours;
    const currentMcTotal = hoursData.mc_summary;
    const currentPdTotal = hoursData.pd_summary;
    const currentRoomTotal = hoursData.room_summary;
    
    useEffect(() => {
        const fetchSessionData = async () => {
            try {
                const result = await api.get("/sessions");
                console.log("raw API result:", result.data);
                const mappedDateSession = result.data.map((session) => ({
                    ...session,
                    start: new Date(session.session_start),
                    end: new Date(session.session_end),
                }))
                setEvents(mappedDateSession);
                console.log("fetch data result:", mappedDateSession);
                console.log("event data result:", events);
                 
            } catch (err) {
                console.error(err);   
            }
        };
        fetchSessionData();
    }, []);

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
                <div className="manageschedule-container">
                    <div className="hours-summary-panel">
                        <div className="hours-summary-total-card">
                            <h5 className="total-card-title">MC Summary</h5>
                            {currentMcTotal && currentMcTotal.length > 0 ? (
                                currentMcTotal.map((mc) => (
                                <div key={mc.id} className="individual-summary-card">
                                    <div className="card-info">
                                        <p className="card-info-title">{mc.nickname}</p>
                                        <p className="card-info-hours"><span className="focus-hours">{mc.total}</span> /124 hours</p>
                                    </div>
                                </div> 
                            ))) : (0)}                       
                        </div>
                        <br />
                        <div className="hours-summary-total-card">
                            <h5 className="total-card-title">PD Summary</h5>
                            {currentPdTotal && currentPdTotal.length > 0 ? (
                                currentPdTotal.map((pd) => (
                                <div key={pd.id} className="individual-summary-card">
                                    <div className="card-info">
                                        <p className="card-info-title">{pd.nickname}</p>
                                        <p className="card-info-hours"><span className="focus-hours">{pd.total}</span> /176 hours</p>
                                    </div>
                                </div>
                            ))) : (0)} 
                        </div>
                        <br />
                        <div className="hours-summary-total-card">
                            <h5 className="total-card-title">Rooms Summary</h5>
                            {currentRoomTotal && currentRoomTotal.length > 0 ? (
                                currentRoomTotal.map((room) => (
                                <div key={room.id} className="individual-summary-card">
                                    <div className="card-info">
                                        <p className="card-info-title">{room.name}</p>
                                        <p className="card-info-hours"><span className="focus-hours">{room.total}</span> /704 hours</p>
                                    </div>
                                </div>
                            ))) : (0)} 
                        </div>
                    </div>
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
                        selectedSlot={selectedSlot}
                        setSelectedSlot={setSelectedSlot}
                        targetEvent={targetEvent}
                        setTargetEvent={setTargetEvent}
                        isClickDayOff={isClickDayOff}
                        holidayEvents={holidayEvents}
                        setHolidayEvents={setHolidayEvents}
                        fetchHoursData={fetchHoursData}
                    />
                </div>
            </div>
        </div>
    );
}
import React, {useState, useEffect} from "react";
import api from "../api.js";
import "../styles/user-calendar.css"
import UserCalendar from "../components/calendar/UserCalendar";
import { id } from "date-fns/locale";

    const initialSessions = [];

export default function LiveSchedule() {
    const [currentView, setCurrentView] = useState("month");
    const [allSessions, setAllSessions] = useState(initialSessions);
    const [selectedRole, setSelectedRole] = useState("");
    const [selectedName, setSelectedName] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("");
    const [selectedDayType, setSelectedDayType] = useState("");

        useEffect(() => {
            const fetchSessionData = async () => {
                try {
                    const result = await api.get("/sessions");
                    console.log("raw API result:", result.data);

                    const transformed = [];
                    result.data.forEach((session) => {
                        const base = {
                            day_type: session.day_type,
                            room_id: session.room_id,
                            room_name: session.room_name,
                            start: new Date(session.session_start),
                            end: new Date(session.session_end),
                        }
                        if (session.mc_name === null || session.pd_name === null || session.room_name === null) {
                            transformed.push({
                                ...base,
                                id: `${session.id}-dayoff`,
                                name: null,
                                role: null,
                                color: "#ED3419",
                                title: "Day off",
                            })
                        }

                        if (session.mc_name) {
                            // const cardTitleStartTime = new Date(session.session_start).toLocaleTimeString()
                            transformed.push({
                                ...base,
                                id: `${session.id}-mc`,
                                name: session.mc_name,
                                role: "MC",
                                color: session.mc_color,
                                title: `${session.mc_name} - ${session.room_name}`
                            })
                        }

                        if (session.pd_name) {
                            transformed.push({
                                ...base,
                                id: `${session.id}-pd`,
                                name: session.pd_name,
                                role: "PD",
                                color: session.pd_color,
                                title: `${session.pd_name} - ${session.room_name}`,
                            })
                        }
                    });

                    setAllSessions(transformed);
                    console.log("fetch data result:", transformed);
                     
                } catch (err) {
                    console.error(err);   
                }
            };
            fetchSessionData();
        }, []);
    
    const filteredSession = allSessions.filter((ss) => {
        const isDayOff = ss.day_type === "dayoff";
        const matchDayType = selectedDayType ? ss.day_type === selectedDayType : true;
        if (isDayOff) return true;

        const matchRole = selectedRole ? ss.role === selectedRole : true;
        const matchName = selectedName ? ss.name === selectedName : true;
        const matchRoom = selectedRoom ? ss.room_name === selectedRoom : true;
        return matchRole && matchName && matchRoom && matchDayType;
    });

    const uniqueNames = [...new Set(allSessions
        .filter((ss) => ss.name !== null && ss.name !== undefined)
        .map((ss) => ss.name)
    )];
    const uniqueRooms = [...new Set(allSessions
        .filter((ss) => ss.room_name !== null && ss.room_name !== undefined)
        .map((ss) => ss.room_name)
    )];
    const uniqueDayType = [...new Set(allSessions
        .filter((ss) => ss.day_type !== null & ss.day_type !== undefined)
        .map((ss) => ss.day_type)
    )];

    return (
        <div className="calendar-main-container">
            <div className="calendar-header-container">
                <div className="breadcrum">
                    <p>livestream</p><i class="fa-solid fa-chevron-right"></i><p>livestream schedule</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>livestream schedule</h2>
                    </div>
                    <div className="calendar-button-section">
                        <select className="select-btn" onChange={(e) => setSelectedDayType(e.target.value)} value={selectedDayType}>
                            <option value="">All day type</option>
                            {uniqueDayType.map((dtype) => (
                                <option key={dtype} value={dtype}>{dtype}</option>
                            ))}
                        </select>
                        <select className="select-btn" onChange={(e) => setSelectedRole(e.target.value)} value={selectedRole}>
                            <option value="">All roles</option>
                            <option value="MC">MC</option>
                            <option value="PD">PD</option>
                        </select>
                        <select className="select-btn" onChange={(e) => setSelectedName(e.target.value)} value={selectedName}>
                            <option value="">All names</option>
                            {uniqueNames.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                        <select className="select-btn" onChange={(e) => setSelectedRoom(e.target.value)} value={selectedRoom}>
                            <option value="">All room</option>
                            {uniqueRooms.map((room) => (
                                <option key={room} value={room}>{room}</option>
                            ))}
                        </select>
                        <button className="calendar-export-btn">export schedule</button>
                    </div>
                </div>
            </div>
            <div className="body-container">
                <UserCalendar 
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    events={filteredSession}
                />
            </div>
        </div>
    );
}
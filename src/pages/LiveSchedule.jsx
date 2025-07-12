import React, {useState} from "react";
import "../styles/user-calendar.css"
import UserCalendar from "../components/calendar/UserCalendar";

    const initialSessions = [
        {
            title: "Newyear - TikTok 1",
            name: "Newyear",
            role: "MC",
            room: "TikTok1",
            start: new Date(2025, 6, 7, 10, 0),
            end: new Date(2025, 6, 7, 12, 0),
        },
        {
            title: "Zone - TikTok 1",
            name: "Zone",
            role: "PD",  
            room: "TikTok1",          
            start: new Date(2025, 6, 7, 14, 0),
            end: new Date(2025, 6, 7, 16, 0),
        },
        {
            title: "Petch - TikTok 2",
            name: "Petch",
            role: "MC",  
            room: "TikTok2",          
            start: new Date(2025, 6, 9, 14, 0),
            end: new Date(2025, 6, 9, 16, 0),
        },
    ];

export default function LiveSchedule() {
    const [currentView, setCurrentView] = useState("month");
    const [allSessions] = useState(initialSessions);
    const [selectedRole, setSelectedRole] = useState("");
    const [selectedName, setSelectedName] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("")
    
    const filteredSession = allSessions.filter((ss) => {
        const matchRole = selectedRole ? ss.role === selectedRole : true;
        const matchName = selectedName ? ss.name === selectedName : true;
        const matchRoom = selectedRoom ? ss.room === selectedRoom : true;
        return matchRole && matchName && matchRoom;
    });

    const uniqueNames = [...new Set(allSessions.map((ss) => ss.name))];
    const uniqueRooms = [...new Set(allSessions.map((ss) => ss.room))];

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
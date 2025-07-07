import React from "react";
import "../styles/manage-schedule.css"
import UserCalendar from "../components/calendar/UserCalendar";

export default function LiveSchedule() {
    return (
        <div className="main-container">
            <div className="header-container">
                <div className="breadcrum">
                    <p>livestream</p><i class="fa-solid fa-chevron-right"></i><p>livestream schedule</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>livestream schedule</h2>
                    </div>
                    <div className="export-section">
                        <button className="export-btn">export schedule</button>
                    </div>
                </div>
            </div>
            <div className="body-container">
                <UserCalendar />
            </div>
        </div>
    );
}
import React, { useState } from "react";
import "../styles/manage-schedule.css"
import AdminCalendar from "./AdminCalendar";
import AddSessionForm from "./AddSessionForm";

export default function ManageSchedule() {
    const [isAddBtnClick, setAddBtnClick] = useState(false);
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
                        <button className="export-btn">add schedule</button>
                        <button className="add-session-btn">export schedule</button>
                    </div>
                </div>
            </div>
            <div className="body-container">
                <AdminCalendar />
            </div>
        </div>
    );
}
import React, { useState, useEffect } from "react";
import api from "../api";
import "../styles/my-day-off.css"
import DayOffRequestForm from "../components/forms/DayOffRequestForm";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";

const MyDayOff = () => {
    const [dayOffList, setDayOffList] = useState([]);
    const [clickRequest, setClickRequest] = useState(false);
    const [clickEdit, setEditForm] = useState(false);
    const [selectedDayOff, setSelectedDayOff] = useState(null);
    const [personnelList, setPersonelList] = useState([]);

    const fetchPersonnelData = async () => {
        try {
            const result = await api.get("/personnels");
            console.log("raw API personnel data", result.data);
            setPersonelList(result.data)
        } catch (err) {
            console.log("Error fetching personnel list:", err);
        }
    }

    const fetchDayoffList = async () => {
        try {
            const result = await api.get("/dayoffs");
            console.log("raw API dayoff data", result.data);
            setDayOffList(result.data);
        } catch (err) {
            console.error("Error fetching dayoff list", err);   
        }
    };

    useEffect(() => {
        fetchDayoffList();
        fetchPersonnelData();
    },[]);

    const handleRequestDayOff = async (dayOffData) => {
        const payload = {
            requester_id: dayOffData.userID,
            position_id: dayOffData.positionID,
            dayoff_start: format(dayOffData.start, "yyyy-MM-dd'T'HH:mm:ss"),
            dayoff_end: format(dayOffData.end, "yyyy-MM-dd'T'HH:mm:ss"),
            is_urgent: dayOffData.isUrgent,
            reason: dayOffData.reason,
            dayoff_status: dayOffData.status,
        }
        console.log("data sending to backend", payload);
        
        try {
            if(clickEdit && selectedDayOff) {
                console.log("updated dayoff submitted");
                await api.put(`/dayoffs/${dayOffData.id}`, payload);
                fetchDayoffList();
                setEditForm(false);
                setSelectedDayOff(null);
            } else {
                console.log("created dayoff");
                await api.post("/dayoffs", payload);
                fetchDayoffList();
            }
            setClickRequest(false);
        } catch (err) {
            console.error("Error creating dayoff request", err);
        }
    }

    const handleClickRequest = () => {
        setClickRequest(true);
    }

    const handleEdit = (request) => {
        setSelectedDayOff(request)
        setEditForm(true);
        setClickRequest(true);
    }

    // ช่วยเปรียบเทียบว่า date อยู่ในช่วง start ถึง end หรือไม่
    const isDateInRange = (date, start, end) => {
        const d = new Date(date).setHours(0, 0, 0, 0);
        const s = new Date(start).setHours(0, 0, 0, 0);
        const e = new Date(end).setHours(0, 0, 0, 0);
        return d >= s && d <= e;
    };

    // คืนวันที่ทั้งหมดในช่วง start ถึง end (รวมทั้งสองฝั่ง)
    const getDateRange = (start, end) => {
        const range = [];
        const current = new Date(start);
        while (current <= new Date(end)) {
            range.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return range;
    };

    // นับจำนวนคนที่ลาใน "วันนั้น" และ "ตำแหน่งเดียวกัน"
    const countDayOffs = (date, position) => {
        return dayOffList.filter(item =>
            item.position === position &&
            isDateInRange(date, item.start, item.end)
        ).length;
    };

    // ใช้ในตอน validate: ถ้าในช่วงวันลา มีวันไหนที่มีคนลาครบแล้ว (>=2) → return true
    const hasConflictInRange = (start, end, position) => {
        const dates = getDateRange(start, end);
        return dates.some(date => countDayOffs(date, position) >= 2);
    };

    const handleDelete = async (id) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this request?");
        console.log("dayoff request id to delete", id);
        
        if (!confirmDelete) return;
            
        try {
            await api.delete(`/dayoffs/${id}`);
            await fetchDayoffList();
        } catch (err) {
            console.error("Error deleting dayoff request:", err);
        }
    };

    return(
        <div className="main-container">
            <div className="header-container">
                <div className="breadcrum">
                    <p>livestream</p><i className="fa-solid fa-chevron-right"></i><p>my day off list</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>my day-off list</h2>
                    </div>
                </div>
            </div>
            <div className={`table-main-container ${clickRequest ? "open" : ""}`}>
                <div className={`dayofflist-table ${clickRequest ? "open" : ""}`}>
                    <button className="request-dayoff-btn" onClick={handleClickRequest}>request day off</button>
                        <table className="dayoff-table">
                            <thead>
                                <tr>
                                    <th>start date</th>
                                    <th>end date</th>
                                    <th>requester</th>
                                    <th>duration</th>
                                    <th>day-off type</th>
                                    <th>reason</th>
                                    <th>day-off status</th>
                                    <th>action</th>
                                </tr>
                            </thead>
                            <tbody>
                            {dayOffList.length > 0 ? (
                                dayOffList.map((request, index) => (
                                    <tr key={index}>
                                        <td>{request.dayoff_start? new Date(request.dayoff_start).toLocaleDateString() : 'N/A'}</td>
                                        <td>{request.dayoff_end? new Date(request.dayoff_end).toLocaleDateString() : 'N/A'}</td>
                                        <td>{request.requester_name || 'N/A'}</td>
                                        <td>
                                            {Math.ceil(
                                                (new Date(request.dayoff_end) - new Date(request.dayoff_start)) /
                                                (1000 * 60 * 60 * 24)
                                            ) + 1} day
                                        </td>
                                        <td>{request.type === "urgent" ? "Urgent" : "Normal"}</td>
                                        <td>{request.reason}</td>
                                        <td>{request.dayoff_status}</td>
                                        <td className="dayoff-btn-group">
                                            <button className="btn dayoff-edit-btn" onClick={()=>handleEdit(request)}>edit</button>
                                            <button className="btn dayoff-delete-btn" onClick={() => handleDelete(request.id)}>delete</button>
                                        </td>
                                    </tr>
                                )) 
                            ) : (
                                    <tr>
                                        <td colSpan="6">No day off requests submitted yet.</td>
                                    </tr>
                            )}
                                
                            </tbody>
                        </table>
                </div>
                {clickRequest &&
                        <div className="dayoff-request-form-container">
                            <DayOffRequestForm 
                            handleRequestDayOff={handleRequestDayOff}
                            setClickRequest={setClickRequest}
                            clickRequest={clickRequest}
                            clickEdit={clickEdit}
                            selectedDayOff={selectedDayOff}
                            setSelectedDayOff={setSelectedDayOff}
                            validateDayOffCount={(start, end, position) =>
                                hasConflictInRange(start, end, position)
                            }
                            personnelList={personnelList}
                            />
                        </div>
                    }
            </div>
        </div>
    );
}

export default MyDayOff;
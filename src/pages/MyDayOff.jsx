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
    const [formErrors, setFormErrors] = useState([]);

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
            dayoff_start: new Date(dayOffData.start).toISOString(),
            dayoff_end: new Date(dayOffData.end).toISOString(),
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
            } else {
                console.log("created dayoff");
                await api.post("/dayoffs", payload);
                fetchDayoffList();
            }
            setClickRequest(false);
            setEditForm(false);
            setSelectedDayOff(null)
            setFormErrors([]);
        } catch (err) {
            console.error("Error creating dayoff request", err);
            if(err.response?.data?.error) {
                const error = err.response.data.error
                setFormErrors(Array.isArray(error) ? error : [error]);
            } else {
                setFormErrors("Unknown error occurred")
            }
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

    const setCustomStatusStyle = (status) => {
        switch (status) {
            case "approved":
                return {
                    color: "#219800",
                    fontWeight: "600",
                }
            case "rejected":
                return {
                    color: "#980000",
                    fontWeight: "600",
                }
            case "pending":
                return {
                    color: "#e6b801",
                    fontWeight: "600",
                }
        
            default:
                break;
        }
    }

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
                    <button className="request-dayoff-btn" onClick={handleClickRequest}>request day off</button>
                </div>
            </div>
            <div className={`table-main-container ${clickRequest ? "open" : ""}`}>
                <div className={`dayofflist-table ${clickRequest ? "open" : ""}`}>
                    
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
                                        <td style={setCustomStatusStyle(request.dayoff_status)}>{request.dayoff_status}</td>
                                        {request.dayoff_status === "pending" 
                                        ?
                                        <td className="dayoff-btn-group">
                                            <button className="btn dayoff-edit-btn" onClick={()=>handleEdit(request)}>edit</button>
                                            <button className="btn dayoff-delete-btn" onClick={() => handleDelete(request.id)}>delete</button>
                                        </td> 
                                        :
                                        <td className="dayoff-btn-group">
                                            <button style={{backgroundColor: "#ccc"}} className="btn dayoff-edit-btn" disabled>edit</button>
                                            <button style={{backgroundColor: "#ccc"}} className="btn dayoff-delete-btn" disabled>delete</button>
                                        </td> 
                                        }
                                        
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
                            setEditForm={setEditForm}
                            selectedDayOff={selectedDayOff}
                            setSelectedDayOff={setSelectedDayOff}
                            personnelList={personnelList}
                            formErrors={formErrors}
                            setFormErrors={setFormErrors}
                            />
                        </div>
                    }
            </div>
        </div>
    );
}

export default MyDayOff;
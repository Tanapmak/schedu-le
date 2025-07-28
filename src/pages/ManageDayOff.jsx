import React, { useState, useEffect } from "react";
import api from "../api.js";
import "../styles/manage-day-off.css"

const ManageDayOff = () => {

    const [isApproved, setApprove] = useState(false);
    const [isRejected, setReject] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);

    const [listForApprove, setListForApprove] = useState([]);

  const fetchDayoffRequestList = async () => {
    try {
        const result = await api.get("/dayoffs");
        console.log("raw dayoff list data:", result.data);
        setListForApprove(result.data)
    } catch (err) {
       console.error("Error fetching request list", err);
    }
  }

  useEffect(() => {
    fetchDayoffRequestList();
  },[])

    const handleApprove = async (id) => {
        try {
            setApprove(true);
            await api.patch(`/dayoffs/${id}`, {dayoff_status: "approved"});

            fetchDayoffRequestList();
            
            console.log("successfully approve"); 
        } catch (err) {
            console.error("Error approve dayoff", err);
        }
    };

    const handleReject = async (id) => {
        try {
            setReject(true);
            const response = await api.patch(`/dayoffs/${id}`, {dayoff_status: "rejected"});
            setSelectedIds((prev) => prev.filter((selectID) => selectID !== id));
            fetchDayoffRequestList();
            console.log("succesfully reject request"); 
        } catch (err) {
            console.error("Error reject dayoff");
        }
    };

    const handleSelectAll = () => {
        const allIds = listForApprove
        .filter((request) => request.dayoff_status === "pending")
        .map((request) => request.id);
        
        if(selectedIds.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(allIds);
        }
    }

    const handleApproveAll = async () => {
        if (selectedIds.length === 0) {
                alert("Please select the request first")
                return;
        }

        try {
            await Promise.all(
                selectedIds.map((id) => {
                        const request = listForApprove.find((r) => r.id === id);
                        if (request && request.dayoff_status === "pending") {
                            return api.patch(`/dayoffs/${id}`, {dayoff_status: "approved"});
                        } else {
                            return Promise.resolve();
                        }   
                    }
                )
            );

            fetchDayoffRequestList();
            setSelectedIds([]); 
            console.log("All selected request approved");
            
        } catch (err) {
            console.error("Error approve all", err);
        }
    }

    const handleSelectOne = (id) => {
        setSelectedIds((prev) => 
            prev.includes(id) 
            ? prev.filter((identity) => identity !== id) 
            : [...prev, id]
        )
    }

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
                    <p>livestream</p><i className="fa-solid fa-chevron-right"></i><p>manage day off list</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>manage day off</h2>
                        <div className="page-title-btn-group">
                            <button className="select-all-btn" onClick={handleSelectAll}>
                                {selectedIds.length > 0 ? "deselect all" : "select all"}
                            </button>
                            <button className="approve-all-btn" onClick={handleApproveAll}>approve all</button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="table-main-container">
                <div className="dayoff-request-list-table">
                    
                        <table className="dayoff-approve-list-table">
                            <thead>
                                <tr>
                                    <th></th>
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
                            {listForApprove.map((request) => {
                                const isSelected = selectedIds.includes(request.id);
                                const isApproved = request.dayoff_status === "approved";
                                const isRejected = request.dayoff_status === "rejected"
                                return (
                                <tr key={request.id}>
                                        <input 
                                        type="checkbox" 
                                        checked={isSelected} 
                                        disabled={isApproved || isRejected}
                                        onChange={()=>handleSelectOne(request.id)}
                                        />
                                        <td>{new Date(request.dayoff_start).toLocaleDateString()}</td>
                                        <td>{new Date(request.dayoff_end).toLocaleDateString()}</td>
                                        <td>{request.requester_name}</td>
                                        <td>
                                            {Math.ceil(
                                                (new Date(request.dayoff_end) - new Date(request.dayoff_start)) / (1000 * 60 * 60 * 24)
                                                ) + 1} day
                                        </td>
                                        <td>{request.is_urgent === true ? "Urgent" : "Normal"}</td>
                                        <td>{request.reason ? request.reason : "Normal dayoff"}</td>
                                        <td style={setCustomStatusStyle(request.dayoff_status)}>{request.dayoff_status}</td>
                                        <td className="dayoff-btn-group">
                                            {isApproved ? (
                                                <button className="btn status-btn" disabled>already approved</button>
                                            ) : isRejected ? (
                                                <button className="btn status-reject-btn" disabled>already rejected</button>
                                            ) : (
                                                <>
                                                <button 
                                                    className="btn approve-btn" 
                                                    onClick={()=> handleApprove(request.id)}
                                                >
                                                    approve
                                                </button>
                                                <button 
                                                className="btn reject-btn"
                                                onClick={() => handleReject(request.id)}
                                                >
                                                reject
                                                </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                </div>
            </div>
        </div>
    );
}

export default ManageDayOff;
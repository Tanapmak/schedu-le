import React, { useState } from "react";
import "../styles/manage-day-off.css"

const ManageDayOff = () => {

    const [isApproved, setApprove] = useState(false);
    const [isRejected, setReject] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);

    const [approveRequestList, setApproveRequest] = useState([{
    id: 1,
    user: "mc-a",
    position: "mc",
    start: new Date("2025-07-15"),
    end: new Date("2025-07-15"),
    type: "normal",
    reason: "",
    status: "pending",
  },
{
    id: 2,
    user: "mc-b",
    position: "mc",
    start: new Date("2025-07-15"),
    end: new Date("2025-07-15"),
    type: "normal",
    reason: "",
    status: "pending",
  }]);

    const handleApprove = (id) => {
        setApprove(true);
        setApproveRequest((prev) => 
            prev.map((request) => 
                request.id === id? { ...request, status: "approved"} : request    
            )
        );
        console.log("successfully approve"); 
    };

    const handleReject = (id) => {
        setReject(true);
        setApproveRequest((prev) => 
            prev.map((request) => 
                request.id === id? { ...request, status: "rejected"} : request    
            )
        );
        console.log("succesfully reject request"); 
    };

    const handleSelectAll = () => {
        const allIds = approveRequestList.map((request) => request.id);
        if(selectedIds.length === approveRequestList.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(allIds);
        }
    }

    const handleApproveAll = () => {
        setApproveRequest((prev) => 
            prev.map((request) => 
                selectedIds.includes(request.id) && request.status === "pending"
                ? { ...request, status: "approved"}
                : request
            )
        );
        setSelectedIds([]);
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
                                {selectedIds.length === approveRequestList.length ? "deselect all" : "select all"}
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
                            {approveRequestList.map((request) => {
                                const isSelected = selectedIds.includes(request.id);
                                const isApproved = request.status === "approved";
                                const isRejected = request.status === "rejected"
                                return (
                                <tr key={request.id}>
                                        <input 
                                        type="checkbox" 
                                        checked={isSelected} 
                                        disabled={isApproved || isRejected}
                                        onChange={()=>handleSelectOne(request.id)}
                                        />
                                        <td>{request.start.toLocaleDateString()}</td>
                                        <td>{request.end.toLocaleDateString()}</td>
                                        <td>{request.user}</td>
                                        <td>
                                            {Math.ceil(
                                                (new Date(request.end) - new Date(request.start)) / (1000 * 60 * 60 * 24)
                                                ) + 1} day
                                        </td>
                                        <td>{request.type}</td>
                                        <td>{request.reason}</td>
                                        <td style={setCustomStatusStyle(request.status)}>{request.status}</td>
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
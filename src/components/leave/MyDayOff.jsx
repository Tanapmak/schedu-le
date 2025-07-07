import React from "react";
import "../../styles/my-day-off.css"

const MyDayOff = () => {
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
            <div className="body-container table-main-container">
                <button className="request-dayoff-btn">request day off</button>
                <table className="dayoff-table">
                    <thead>
                        <tr>
                            <th>start date</th>
                            <th>end date</th>
                            <th>requester</th>
                            <th>duration</th>
                            <th>day-off status</th>
                            <th>action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                        <td>6 Jul 2025</td>
                        <td>6 Jul 2025</td>
                        <td>User's Name</td>
                        <td>1 day</td>
                        <td>approved</td>
                        <td className="dayoff-btn-group">
                            <button className="btn dayoff-edit-btn">edit</button>
                            <button className="btn dayoff-delete-btn">delete</button>
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default MyDayOff;
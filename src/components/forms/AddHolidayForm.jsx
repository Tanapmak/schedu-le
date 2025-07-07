import React, {useState} from "react";
import SessionPicker from "../common-UI/SessionPicker";
import "../../styles/add-holiday-form.css";

const AddHolidayForm = ({onClose, events, isOpen, currentDate, onSave}) => {

    const [newStartDate, setNewStartDate] = useState(currentDate);
    const [newEndDate, setNewEndDate] = useState(currentDate);
    
    const [holidayData, setHolidayData] = useState({
        title: "dayoff",
        type: "holiday",
        holidayStartDate: null,
        holidayEndDate: null,
        holidayStartTime: null,
        holidayEndTime: null,
        })

    return(
        <div className="holiday-form-container">
            <div className="holiday-form-header">
                <p>Add day-off</p>
                <div className="close-btn" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </div> 
            </div>
            
            <form className="holiday-form-control">
                <div className="picker-container">
                    <label htmlFor="startdate">Start Date</label>
                    <SessionPicker 
                        value={newStartDate}
                        onChange={(date) => {
                            setHolidayData({ ...holidayData, HolidayStartDate: date });
                            setNewStartDate(date);
                        }}
                        dateFormat="dd/mm/yyyy"
                    />
                </div>
                <div className="picker-container">
                    <label htmlFor="startdate">end date</label>
                    <SessionPicker 
                        value={newEndDate}
                        onChange={(date) => {
                            setHolidayData({ ...holidayData, HolidayEndDate: date });
                            setNewEndDate(date);
                        }}
                        dateFormat="dd/mm/yyyy"
                    />
                </div>
            </form>
            <div className="holiday-form-btn-group">
                <button className="save-btn" onSave={(holidayData)=>onSave}>save</button>
                <button className="cancel-btn" onClick={onClose}>cancel</button>
            </div>
            
        </div>
    );
}

export default AddHolidayForm
import React from "react";
import { useEffect, useState } from "react";
import "../../styles/admin-calendar.css"
import SessionPicker from "../common-UI/SessionPicker"

const AddSessionForm = ({ 
    isOpen, 
    events,
    existingEvent, 
    selectRoom, 
    startSession, 
    endSession, 
    mcName, 
    pdName, 
    isEditMode,
    validateSession,
    onClose, 
    onSave,  
    dayType,   
    isClickDayOff, 
    isHolidayDate,
}) => {
    
    const [formData, setFormData] = useState({
        room: "",
        mc: "",
        pd: "",
        startDate: null,
        endDate: null,
        startTime: null,
        endTime: null,
        typeOfDay: null,
    })

    const [validationErrors, setValidationErrors] = useState([]);

    useEffect(() => {
        if (existingEvent) {
            setFormData(
                {
                    id: existingEvent.id || null,
                    room: existingEvent.title || null,
                    mc: existingEvent.mc || null,
                    pd: existingEvent.pd || null,
                    startTime: existingEvent.start || null,
                    endTime: existingEvent.end || null,
                    typeOfDay: existingEvent.type || null,
                }
            );
        } else {
            setFormData(
                {
                    room: selectRoom || "",
                    mc: mcName || "",
                    pd: pdName || "",
                    startTime: startSession || null,
                    endTime: endSession || null,
                    typeOfDay: dayType || null,
                }
            );
        }
    }, [existingEvent, startSession, endSession, selectRoom, mcName, pdName, dayType]);

    const getWorkForceHours = (start, end) => (new Date(end) - new Date(start)) / (1000 * 60 * 60)

    const calculatePersonHours = (name, description) => {
        if (!name) return 0;
        const filtered = events.filter(ev => ev[description] === name && ev.id !== formData.id && ev.title?.toLowerCase() !== "content room");
        return filtered.reduce((total, ev) => total + getWorkForceHours(ev.start, ev.end), 0);
    };

    const calculateRoomHours = (room) => {
        if(!room) return 0;
        if(room === "day off" || room === "content room") return 0;
        const totalHours = events.reduce((total, ev) => total + getWorkForceHours(ev.start, ev.end),0)
        return totalHours
    }

    const mcList = ["Newyear", "Petch", "Ponz", "Chani", "Nooknick", "Aomkuan"];
    const pdList = ["Zone", "Tongvha", "Non", "Fourarm"];
    const roomList = ["TikTok 1", "TikTok 2", "Lazada", "Shopee"];
    const dayList = ["Working day", "Day off"];

    const renderMCOptions = mcList.map((name) => {
        const used = calculatePersonHours(name, "mc");
        const remaining = 124 - used;
        if(name === "All PD") {
            return (
            <option key={name} value={name}>
            {name}
            </option>
        );
        } else {
            return (
            <option key={name} value={name}>
            {`${name} ( Used: ${used.toFixed(0)} hours / Remaining: ${remaining.toFixed(0)} hours )`}
            </option>
        );
        }
        
    });

    const renderPDOptions = pdList.map((name) => {
        const used = calculatePersonHours(name, "pd");
        const remaining = 176 - used;
        return (
            <option key={name} value={name}>
            {`${name} ( Used: ${used.toFixed(0)} hours / Remaining: ${remaining.toFixed(0)} hours )`}
            </option>
        );
    });

    const renderRoomOptions = roomList.map((room) => {
        const roomHours = calculatePersonHours(room, "title");
        const totalRoomHours = calculateRoomHours(room);
        return (
            <option key={room} value={room}>
            {`${room} (Assigned ${roomHours.toFixed(0)} hours of ${totalRoomHours.toFixed(0)} / 704 total hours)`}
            </option>
        );
    });

    const renderDayOptions = dayList.map((day) => {
        return (
            <option key={day} value={day}>
            {day}
            </option>
        );
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log("submitted");
        
        const newEvent = {
            id: formData.id || Date.now(),
            title: formData.room,
            mc: formData.mc,
            pd: formData.pd,
            start: formData.startTime,
            end: formData.endTime,
            type: formData.typeOfDay,
        };

        const errors = validateSession(newEvent);

        if(errors.length > 0) {
            setValidationErrors(errors);
            return;
        }

        setValidationErrors([]);
        onSave(newEvent);
        onClose();
    };

    return(
        <div className={`session-form-container ${isOpen ? "open" : ""}`}>
            <div className="header-section">
                <p className="headeer-section-text"> {isEditMode ? "edit session" : "add session"}</p>
                <div className="close-btn" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </div>  
            </div>
            
            <form onSubmit={handleSubmit} className="add-session-form-container">
                <label htmlFor="startDateTime">
                    session information
                </label>
                    <select 
                        name="day_type" 
                        id="dayType" 
                        value={formData.typeOfDay} 
                        onChange={(event) => setFormData({
                            ...formData, typeOfDay: event.target.value
                        })}
                    >
                        <button>
                        <selectedcontent></selectedcontent>
                        </button>
                        <option value="">Select Day Type</option>
                        {renderDayOptions}
                    </select>
                    <select 
                        name="room_id" 
                        id="room" 
                        value={formData.room} 
                        onChange={(event) => setFormData({
                            ...formData, room: event.target.value
                        })}
                    >
                        <button>
                        <selectedcontent></selectedcontent>
                        </button>
                        <option value="">Select Room</option>
                        <option value="Day off">Day off</option>
                        {renderRoomOptions}
                        <option value="content room">Content Room</option>
                    </select>
                    <select 
                        name="mc_id" 
                        id="mc" 
                        value={formData.mc} 
                        onChange={(event) => setFormData({
                            ...formData, mc: event.target.value
                        })}
                    >
                        <option value="">Select MC</option>
                        <option value="MC dayoff">Day off</option>
                        {renderMCOptions}
                    </select>
                     <select 
                        name="pd_id" 
                        id="pd" 
                        value={formData.pd} 
                        onChange={(event) => setFormData({
                            ...formData, pd: event.target.value
                        })}
                    >
                        <option value="">Select PD</option>
                        <option value="PD dayoff">Day off</option>
                        {renderPDOptions}
                    </select>
                <label htmlFor="startDateTime">
                    start date/time
                </label>
                    <SessionPicker 
                        name="session_start"
                        className="form-input-field"
                        wrapperClassName="session-picker"
                        value={formData.startTime}
                        onChange={(dateTime) => setFormData({ ...formData, startTime: dateTime })}
                        dateFormat="dd/mm/yyyy"
                    />
                    <label htmlFor="endDateTime">
                        end date/time
                    </label>
                    <SessionPicker 
                        name="session_end"
                        className="form-input-field"
                        wrapperClassName="session-picker"
                        value={formData.endTime}
                        onChange={(dateTime) => setFormData({ ...formData, endTime: dateTime })}
                        dateFormat="dd/mm/yyyy"
                    /> 
                <br />
                {validationErrors.length > 0 &&
                    <div className="session-validation-container">
                        <h5>Duplicate Session!</h5>
                        <ul>
                        {validationErrors.map((err, i) => {
                            return(
                                <li key={i}>{err}</li>
                            );
                        })}
                        </ul>   
                        {isHolidayDate &&
                        <h5>Day off, cannot add session!</h5>
                        }     
                    </div>
                }
                <div className="btn-group">
                    <button className="primary-btn" type="submit">save</button>
                    <button className="secondary-btn" type="button" onClick={onClose}>cancel</button>
                </div>
                
            </form>
        </div>  
    );
}

export default AddSessionForm
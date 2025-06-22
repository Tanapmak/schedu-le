import React from "react";
import { useEffect, useState } from "react";
import "../styles/admin-calendar.css"
import SessionPicker from "./SessionPicker"

const AddSessionForm = ({ events, existingEvent, selectRoom, mcName, pdName, startSession, endSession, onClose, onSave, isOpen, isEditMode }) => {

    const [formData, setFormData] = useState({
        room: "",
        mc: "",
        pd: "",
        startDate: null,
        endDate: null,
        startTime: null,
        endTime: null,
    })

    const [validationErrors, setVariationErrors] = useState([]);

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
            }
        );
    }
  }, [existingEvent, startSession, endSession, selectRoom, mcName, pdName]);

    const getWorkForceHours = (start, end) => (new Date(end) - new Date(start)) / (1000 * 60 * 60)

    const validateSession = (newEvent) => {
        const errors = [];

        const newStart = new Date(newEvent.start);
        const newEnd = new Date(newEvent.end);

        //check overlap session
        const overlapping = events.filter((ev) => 
        ev.id !== newEvent.id &&
        newStart < new Date(ev.end) &&
        newEnd > new Date(ev.start)
        );

        overlapping.forEach(ev => {
            if (ev.title === newEvent.title) {
                errors.push(`Room conflict with ${ev.start.toLocaleDateString("en-GB")}, cannot assign new session to ${ev.title}`)
            }

            if(ev.mc === newEvent.mc) {
                errors.push(`MC duplication on ${ev.start.toLocaleDateString("en-GB")}, cannot assign new session to ${ev.mc}`)
            }

            if(ev.pd === newEvent.pd) {
                errors.push(`PD duplication on ${ev.start.toLocaleDateString("en-GB")}, cannot assign new session to ${ev.pd}`)
            }
        })

        //check total hours
        const mcTotal = events
        .filter(ev => ev.mc === newEvent.mc && ev.id !== newEvent.id)
        .reduce((sum, ev) => sum + getWorkForceHours(ev.start, ev.end),0) + getWorkForceHours(newStart, newEnd);

        const pdTotal = events
        .filter(ev => ev.pd === newEvent.pd && ev.id !== newEvent.id)
        .reduce((sum, ev) => sum + getWorkForceHours(ev.start, ev.end),0) + getWorkForceHours(newStart, newEnd);

        if(mcTotal > 124) errors.push(`${newEvent.mc} already exceed max hours (124 HRS), exceed amount: ${mcTotal.toFixed(1)} HRS`)
        // else if(mcTotal < 96) errors.push(`${newEvent.mc} still need ${mcTotal.toFixed(1)} HRS to acheive min KPI (96 HRS)`)

        if(pdTotal > 176) errors.push(`${newEvent.pd} already exceed max hours (176 HRS), exceed amount: ${pdTotal.toFixed(1)} HRS`)
        // else if(pdTotal < 132) errors.push(`${newEvent.pd} still need ${pdTotal.toFixed(1)} HRS to acheive min KPI (132 HRS)`)

        return errors
    }

    const calculatePersonHours = (name, description) => {
    if (!name) return 0;

    const filtered = events.filter(ev => ev[description] === name && ev.id !== formData.id);
        return filtered.reduce((total, ev) => total + getWorkForceHours(ev.start, ev.end), 0);
    };

    const calculateRoomHours = (room) => {
        if(!room) return 0;

        const totalHours = events.reduce((total, ev) => total + getWorkForceHours(ev.start, ev.end),0)
        return totalHours
    }

    const mcList = ["Newyear", "Petch", "Ponz", "Chani", "Nooknick", "Aomkuan"];
    const pdList = ["Zone", "Tongvha", "Non", "Fourarm"];
    const roomList = ["TikTok 1", "TikTok 2", "Lazada", "Shopee", "Content Room"];

    const renderMCOptions = mcList.map((name) => {
    const used = calculatePersonHours(name, "mc");
    const remaining = 124 - used;
        return (
            <option key={name} value={name}>
            {`${name} ( Used: ${used.toFixed(0)} hours / Remaining: ${remaining.toFixed(0)} hours )`}
            </option>
        );
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
        };

        const errors = validateSession(newEvent);

        if(errors.length > 0) {
            setVariationErrors(errors);
            return;
        }

        setVariationErrors([]);
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
            
            <form onSubmit={handleSubmit} className="form-container">
                <label htmlFor="startDateTime">
                    session information
                </label>
                    
                    <select name="room" id="room" value={formData.room} onChange={(event) => setFormData({
                        ...formData, room: event.target.value
                    })}>
                        <button>
                        <selectedcontent></selectedcontent>
                        </button>
                        <option value="">Select Room</option>
                        {renderRoomOptions}
                    </select>
                    <select name="mc" id="mc" value={formData.mc} onChange={(event) => setFormData({
                        ...formData, mc: event.target.value
                    })}>
                        <option value="">Select MC</option>
                        {renderMCOptions}
                    </select>
                     <select name="pd" id="pd" value={formData.pd} onChange={(event) => setFormData({
                        ...formData, pd: event.target.value
                    })}>
                        <option value="">Select PD</option>
                        {renderPDOptions}
                    </select>
                <label htmlFor="startDateTime">
                    start date/time
                </label>
                <SessionPicker 
                    wrapperClassName="session-picker"
                    value={formData.startTime}
                    onChange={(dateTime) => setFormData({ ...formData, startTime: dateTime })}
                />
                <label htmlFor="endDateTime">
                    end date/time
                </label>
                <SessionPicker 
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
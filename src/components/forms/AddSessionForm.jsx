import React from "react";
import { useEffect, useState } from "react";
import "../../styles/admin-calendar.css"
import SessionPicker from "../common-UI/SessionPicker"
import api from "../../api.js";

const AddSessionForm = ({ 
    isOpen, 
    events,
    existingEvent, 
    selectRoom, 
    sessionStart, 
    sessionEnd, 
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
        day_type: null,
        room_id: "",
        room_name: "",
        mc_id: "",
        mc_name: "",
        pd_id: "",
        session_start: null,
        session_end: null,
    })

    const [validationErrors, setValidationErrors] = useState([]);

    useEffect(() => {
        if (isEditMode && existingEvent) {
            setFormData(
                {
                    id: existingEvent.id || null,
                    room_id: existingEvent.room_id || null,
                    mc_id: existingEvent.mc_id || null,
                    pd_id: existingEvent.pd_id || null,
                    session_start: existingEvent.session_start || null,
                    session_end: existingEvent.session_end || null,
                    day_type: existingEvent.day_type || null,
                }
            );
        } else {
            setFormData(
                {
                    room_name: selectRoom || "",
                    mc_name: mcName || "",
                    pd_name: pdName || "",
                    session_start: sessionStart || null,
                    session_end: sessionEnd || null,
                    day_type: dayType || null,
                }
            );
        }
    }, [isEditMode, existingEvent, sessionStart, sessionEnd, selectRoom, mcName, pdName, dayType]);

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
    // const mcList = ["Newyear", "Petch", "Ponz", "Chani", "Nooknick", "Aomkuan"]; 
    // const pdList = ["Zone", "Tongvha", "Non", "Fourarm"];
    // const roomList = ["TikTok 1", "TikTok 2", "Lazada", "Shopee"];
    
    const [mcList, setMcList] = useState([]);
    const [pdList, setPdList] = useState([]);
    const [roomList, setRoomList] = useState([]);
    const dayList = ["Working day", "Day off"];

    useEffect(() => {
        const fetchFormFieldList = async () => {
            try {
                const [mcResult, pdResult, roomResult] = await Promise.all([
                    api.get("/personnels/mc"),
                    api.get("/personnels/pd"),
                    api.get("/rooms"),
                ]);
                setMcList(mcResult.data);
                setPdList(pdResult.data);
                setRoomList(roomResult.data);
            } catch (err) {
                console.error("Error fetching lists:", err);
            }
        };
        
        fetchFormFieldList();
    }, []);
    
    const renderMCOptions = mcList.map((person) => {
        const name = person.nickname;
        if(name === "All PD") {
            return (
            <option key={person.id} value={person.id}>
            {name}
            </option>
        );
        } else {
            return (
            <option key={person.personnel_id} value={person.personnel_id}>
            {name}
            </option>
        );
        }
        
    });

    const renderPDOptions = pdList.map((person) => {
        const name = person.nickname;
        return (
            <option key={person.personnel_id} value={person.personnel_id}>
            {name}
            </option>
        );
    });

    const renderRoomOptions = roomList.map((room) => {
        const roomName = room.name;
        return (
            <option key={room.id} value={room.id}>
            {roomName}
            </option>
        );
    });

    const renderDayOptions = dayList.map((day) => {
        if (day === "Working day") {
            return (
                <option key={day} value={"working day"}>
                {day}
                </option>
            );
        } else {
            return (
                <option key={day} value={"dayoff"}>
                {day}
                </option>
            );
        }
        
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log("submitted");
        
        const newEvent = {
            id: formData.id || Date.now(),
            day_type: formData.day_type,
            room_id: formData.room_id,
            mc_id: formData.mc_id,
            pd_id: formData.pd_id,
            session_start: formData.session_start,
            session_end: formData.session_end,
        };

        console.log("New event data from addsessionform handleSubmit",newEvent);
        

        const errors = validateSession(newEvent);

        if(errors.length > 0) {
            setValidationErrors(errors);
            return;
        }

        setValidationErrors([]);
        console.log(newEvent.day_type);
        
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
                        value={formData.day_type} 
                        onChange={(event) => setFormData({
                            ...formData, day_type: event.target.value
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
                        value={formData.room_id} 
                        onChange={(event) => setFormData({
                            ...formData, room_id: event.target.value
                        })}
                    >
                        <button>
                        <selectedcontent></selectedcontent>
                        </button>
                        <option value="">Select Room</option>
                        <option value="allroom">All room</option>
                        {renderRoomOptions}
                    </select>
                    <select 
                        name="mc_id" 
                        id="mc" 
                        value={formData.mc_id} 
                        onChange={(event) => setFormData({
                            ...formData, mc_id: event.target.value
                        })}
                    >
                        <option value="">Select MC</option>
                        <option value="allmc">All MC</option>
                        {renderMCOptions}
                    </select>
                     <select 
                        name="pd_id" 
                        id="pd" 
                        value={formData.pd_id} 
                        onChange={(event) => setFormData({
                            ...formData, pd_id: event.target.value
                        })}
                    >
                        <option value="">Select PD</option>
                        <option value="allpd">All PD</option>
                        {renderPDOptions}
                    </select>
                <label htmlFor="startDateTime">
                    start date/time
                </label>
                    <SessionPicker 
                        name="session_start"
                        className="form-input-field"
                        wrapperClassName="session-picker"
                        value={new Date(formData.session_start)}
                        onChange={(dateTime) => setFormData({ ...formData, session_start: dateTime })}
                        dateFormat="dd/mm/yyyy"
                    />
                    <label htmlFor="endDateTime">
                        end date/time
                    </label>
                    <SessionPicker 
                        name="session_end"
                        className="form-input-field"
                        wrapperClassName="session-picker"
                        value={new Date(formData.session_end)}
                        onChange={(dateTime) => setFormData({ ...formData, session_end: dateTime })}
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
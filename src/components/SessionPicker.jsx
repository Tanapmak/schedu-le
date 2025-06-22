import React,{useState} from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const SessionPicker = ({value, onChange}) => {
    return (
        <div className="session-datetime-picker-container">
            <DatePicker selected={value} onChange={onChange} showTimeSelect dateFormat="Pp"/>
        </div>    
    );
}

export default SessionPicker
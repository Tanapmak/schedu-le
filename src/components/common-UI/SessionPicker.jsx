import React,{useState} from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../styles/admin-calendar.css"

const SessionPicker = ({value, onChange, className, wrapperClassName}) => {
    return (
        <div className={wrapperClassName}>
            <DatePicker className={className} selected={value} onChange={onChange} showTimeSelect dateFormat="Pp"/>
        </div>    
    );
}

export default SessionPicker
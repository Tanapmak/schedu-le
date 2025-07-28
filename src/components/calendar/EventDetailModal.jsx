import React from "react";
import "../../styles/event-detail-modal.css"

const EventDetailModal = ({isClickSummaryCard, event, onClose, onEdit, onDelete}) => {
    if(!event) return null;

    return (
        <div className="event-modal">
            <div className="event-modal-content">
                <div className="event-details">
                    <div className="headers">
                        <h3>{event.day_type === "dayoff" ? "Day off" : event.room_name}</h3>
                        {isClickSummaryCard ? null :
                            <div className="modal-close-btn" onClick={onClose}>
                                <i className="fa-solid fa-xmark"></i>
                            </div>                    
                        }

                    </div>
                    <p>{event.day_type === "dayoff" 
                    ? "All MC" 
                    : event.mc_name} / {event.day_type === "dayoff" 
                    ? "All PD" 
                    : event.pd_name}</p>
                    <p>date: {event.start.toLocaleDateString("en-GB")}</p>
                    <p>
                        {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                         -  
                        {event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <div className="modal-btn-group">
                    <button className="edit-btn modal-btn" onClick={()=>onEdit(event)}>edit</button>
                    <button className="delete-btn modal-btn" onClick={()=>onDelete(event)}>delete</button>
                </div>
                
            </div>
        </div>
    );
}

export default EventDetailModal
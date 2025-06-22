import React from "react";
import "../styles/event-detail-modal.css"

const EventDetailModal = ({event, onClose, onEdit, onDelete}) => {
    if(!event) return null;

    return (
        <div className="event-modal">
            <div className="event-modal-content">
                <div className="event-details">
                    <div className="headers">
                        <h3>{event.title}</h3>
                        <div className="modal-close-btn" onClick={onClose}>
                            <i className="fa-solid fa-xmark"></i>
                        </div>
                    </div>
                    <p>{event.mc} / {event.pd}</p>
                    <p>date: {event.start.toLocaleDateString("en-GB")}</p>
                    <p>
                        {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                         -  
                        {event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <div className="modal-btn-group">
                    <button className="edit-btn modal-btn" onClick={onEdit}>edit</button>
                    <button className="delete-btn modal-btn" onClick={onDelete}>delete</button>
                </div>
                
            </div>
        </div>
    );
}

export default EventDetailModal
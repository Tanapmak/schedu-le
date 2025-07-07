import React from "react";
import EventDetailModal from "./EventDetailModal";
import "../../styles/summary-panel.css"

const SummaryCardPanel = ({isClickSummaryCard, onClose, onEdit, onDelete, events, setClickSeeAllBtn}) => {

    return(
        <div className="panel-container">
            <div className="panel-header-section">
                <p className="panel-header">session summary</p>
                <div className="panel-close-btn" onClick={onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </div>
            </div>

            <div className="eventcard">
                {events.map((event) => (
                    <EventDetailModal 
                        key={event.id}
                        event={event}
                        onClose={onClose}
                        onEdit={()=>onEdit(event)}
                        onDelete={onDelete}
                        isClickSummaryCard={isClickSummaryCard}
                    />
                ))}
            </div>
            <div className="button-section">
                <button className="see-all-btn" onClick={setClickSeeAllBtn}>See all session of today</button>
            </div>
        </div>
    );
}

export default SummaryCardPanel
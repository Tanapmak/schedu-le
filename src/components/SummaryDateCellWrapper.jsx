import React from "react";
import SummaryCard from "./SummaryCard";

const SummaryDateCellWrapper = ({ children, value, events, currentView}) => {
    return(
        <div style={{
            position: "relative",
        }}>
            {children}
            {currentView === "month" && 
                <div style={{
                    position: "absolute",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    zIndex: 2,
                }}>
                    <SummaryCard value={value} events={events}/>
                </div>
            }
        </div>
    );
}

export default SummaryDateCellWrapper
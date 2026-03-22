import React, { useState, useEffect } from "react";
import api from "../../api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../styles/dayoff-request-form.css"

const DayOffRequestForm = ({
    personnelList, 
    handleRequestDayOff, 
    setClickRequest, 
    clickRequest, 
    clickEdit, 
    setEditForm,
    selectedDayOff, 
    setSelectedDayOff, 
    formErrors,
    setFormErrors,
}) => {

    const [currentDate, setDate] = useState({
        startDate: new Date(),
        endDate: new Date(),
    });

    const [isUrgentDayOff, setUrgentDayOff] = useState(false);

    const [dayOffFormData, setDayOffFormData] = useState({
        user: null,
        userID: null,
        position: null,
        positionID: null,
        start: currentDate.start,
        end: currentDate.end,
        type: "normal",
        isUrgent: false,
        reason: "normal day off",
        status: "pending",
    });

    useEffect(() => {
        if(clickEdit && selectedDayOff) {
            
            setDayOffFormData({
                id: selectedDayOff.id,
                user: selectedDayOff.requester_name,
                userID: selectedDayOff.personnel_id,
                position: selectedDayOff.position_name,
                positionID: selectedDayOff.position_id,
                type: selectedDayOff.type || "normal",
                isUrgent: selectedDayOff.isUrgent || false,
                reason: selectedDayOff.reason || "",
                status: selectedDayOff.status || "pending",
            });
            setDate({
            startDate: new Date(selectedDayOff.dayoff_start),
            endDate: new Date(selectedDayOff.dayoff_end),
            });
            setUrgentDayOff(selectedDayOff.is_urgent || false);
        } else {
            setDayOffFormData({
                user: "",
                userID: "",
                position: "",
                positionID: "",
                type: "normal",
                isUrgent: false,
                reason: "normal dayoff",
                status: "pending",
            })
        }
    }, [clickEdit, selectedDayOff]);

    const handleClose = () => {
        setClickRequest(false);
        setEditForm(false);
        setUrgentDayOff(false);
        setFormErrors([]);
    }

    const handleSubmit = (event) => {
        event.preventDefault(); // Prevent the default form submission (page reload)
        console.log("Submitted Dayoff form data:", dayOffFormData); // For debugging

        const finalData = {
            ...dayOffFormData,
            id: dayOffFormData.id || Date.now(),
            positionID: dayOffFormData.positionID,
            type: dayOffFormData.type,
            isUrgent: dayOffFormData.isUrgent,
            reason: dayOffFormData.reason,
            start: new Date(currentDate.startDate).toLocaleString(),
            end: new Date(currentDate.endDate).toLocaleString(),
        };
        console.log("Dayoff form data to submit", finalData);
        
        handleRequestDayOff(finalData); // Pass the collected data to the parent
            // Optional: Reset form fields after submission
    };
    
    return (
        <div className={`dayoff-form-container ${clickRequest ? "open" : ""}`}>
            <h3 className="dayoff-form-title">
                {clickEdit? "edit request" : "add day off request"}
            </h3>
            <form action="" onSubmit={handleSubmit}>
                <div className="form-inputarea">
                <label htmlFor="">Requester</label>
                
                <select
                    value={dayOffFormData.userID || ""}
                    onChange={(e) => {
                        const selected = personnelList.find(p => p.personnel_id === parseInt(e.target.value))
                        if (selected) {
                            setDayOffFormData((prev) => ({
                                ...prev,
                                userID: selected.personnel_id,
                                user: selected.nickname,
                                positionID: selected.position_id,
                                position: selected.position_name,
                            }));
                        }}
                    }
                >
                    <option value="">Select requester</option>
                    {personnelList.map((requester) => 
                    <option key={requester.id} value={requester.personnel_id}>{requester.nickname}</option>
                    )}
                    </select>
                
            </div>
            <div className="form-inputarea">
                <label htmlFor="">position</label>
                <input 
                type="text" 
                value={dayOffFormData.position || ""}
                disabled
                />
            </div>
            <div className="form-inputarea">
                <label htmlFor="">start date</label>
                <DatePicker 
                    selected={currentDate.startDate}
                    onChange={(date)=>{
                        setDate((prevDate) => ({
                            ...prevDate,
                            startDate: date,
                        }));
                    }}
                />
            </div>
            <div className="form-inputarea">
                <label htmlFor="">end date</label>
                <DatePicker 
                    selected={currentDate.endDate}
                    onChange={(date)=>{
                        setDate((prevDate) => ({
                            ...prevDate,
                            endDate: date,
                        }));
                    }}
                />
            </div>
            <div className="form-inputarea">
                <div>
                     <input 
                     type="checkbox" 
                     checked={isUrgentDayOff}
                     placeholder="Please provide urgent reason"
                     onChange={(e)=> {
                        const isChecked = e.target.checked;
                        setUrgentDayOff(isChecked)
                        setDayOffFormData(prev => ({
                            ...prev,
                            type: isChecked ? "urgent" : "normal",
                            isUrgent: isChecked,
                            reason: "",
                        }))
                        console.log(isUrgentDayOff);   
                     }}
                     /> 
                    <label htmlFor="" value="urgent dayoff">urgent</label>
                </div>
               <input 
               type="text" 
               placeholder="Reason" 
               value={dayOffFormData.reason}
               onChange={(event) => setDayOffFormData({
                    ...dayOffFormData, reason: event.target.value
                })}
                />
                {isUrgentDayOff && !dayOffFormData.reason &&
                (<p style={{color: "red", fontSize: "0.7rem"}}>* Please provide reason *</p>)
                }
            </div>
            {formErrors.length > 0 && 
            <div className="error-msg-container">
                <h5 style={{color: "#ff5d5d"}}>Request denial reason</h5>
                
                    {formErrors.map((err, i) => {
                        return(
                            <p style={{
                                    fontSize: "0.7rem", 
                                    color: "#ff5d5d",
                                    paddingInlineStart: "0",
                                    paddingInline: "1px",
                                    paddingTop: "10px"
                                }} 
                                key={i}
                            >{err}</p>
                        );
                    })}
                
            </div>
             }
            <div className="dayoff-form-btn-group">
                <button 
                    className="submit-btn" 
                    type="submit" 
                    disabled={isUrgentDayOff && !dayOffFormData.reason}
                >
                    {clickEdit? "save" : "submit"}
                </button>
                <button className="cancel-btn" type="button" onClick={handleClose}>cancel</button>
            </div>
            </form>
        </div>
    );
}

export default DayOffRequestForm
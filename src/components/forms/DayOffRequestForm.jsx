import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../styles/dayoff-request-form.css"

const DayOffRequestForm = ({handleRequestDayOff, setClickRequest, clickRequest, clickEdit, selectedDayOff, setSelectedDayOff, validateDayOffCount}) => {
    const currentUsername = "username"

    const [currentDate, setDate] = useState({
        startDate: new Date(),
        endDate: new Date(),
    });

    const [isUrgentDayOff, setUrgentDayOff] = useState(false);

    const [dayOffFormData, setDayOffFormData] = useState({
        user: currentUsername,
        position: null,
        start: currentDate.start,
        end: currentDate.end,
        type: "normal",
        reason: "",
        status: "Pending",
    });

    useEffect(() => {
        if(clickEdit && selectedDayOff) {
            setDayOffFormData({
                id: selectedDayOff.id,
                user: selectedDayOff.user,
                position: selectedDayOff.position,
                type: selectedDayOff.type || "normal",
                reason: selectedDayOff.reason || "",
                status: selectedDayOff.status || "Pending",
            });
            setDate({
            startDate: new Date(selectedDayOff.start),
            endDate: new Date(selectedDayOff.end),
            });
        }
        
    }, [clickEdit, selectedDayOff]);

    const handleClose = () => {
        setClickRequest(false);
        setUrgentDayOff(false);
    }

    const handleSubmit = (event) => {
        event.preventDefault(); // Prevent the default form submission (page reload)
        console.log("Form data to submit:", dayOffFormData); // For debugging
        if (!isUrgentDayOff) {
            const conflict = validateDayOffCount(
                currentDate.startDate, currentDate.endDate, dayOffFormData.position
            );
                if (conflict) {
                    alert("Sorry, max leave limit, please tick urgent box and provide reason.");
                    return;
                }
        }
        const finalData = {
            ...dayOffFormData,
            id: dayOffFormData.id || Date.now(),
            position: dayOffFormData.position,
            type: dayOffFormData.type,
            reason: dayOffFormData.reason,
            start: currentDate.startDate,
            end: currentDate.endDate,
        };
        handleRequestDayOff(finalData); // Pass the collected data to the parent
        // Optional: Reset form fields after submission

        setDayOffFormData({
            user: currentUsername,
            position: null,
            start: new Date(),
            end: new Date(),
            type: "normal",
            reason: "normal day off",
        });
        setDate({ // Also reset DatePicker dates
            startDate: new Date(),
            endDate: new Date(),
        });
        setUrgentDayOff(false);
    };
    
    return (
        <div className={`dayoff-form-container ${clickRequest ? "open" : ""}`}>
            <h3 className="dayoff-form-title">
                {clickEdit? "edit request" : "add day off request"}
            </h3>
            <form action="" onSubmit={handleSubmit}>
                <div className="form-inputarea">
                <label htmlFor="">requester</label>
                <input 
                type="text" 
                placeholder={currentUsername} 
                value={dayOffFormData.user}
                onChange={(event) => setDayOffFormData({
                    ...dayOffFormData, user: event.target.value
                })}
                />
            </div>
            <div className="form-inputarea">
                <label htmlFor="">position</label>
                <select
                    value={dayOffFormData.position || "mc"}
                    onChange={(e) =>
                    setDayOffFormData({ ...dayOffFormData, position: e.target.value })
                    }
                >
                    <option value="mc">MC</option>
                    <option value="pd">PD</option>
                </select>
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
                     onChange={(e)=> {
                        const isChecked = e.target.checked;
                        setUrgentDayOff(isChecked)
                        setDayOffFormData(prev => ({
                            ...prev,
                            type: isChecked ? "urgent" : "normal",
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
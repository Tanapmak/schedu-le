import React, {useState, useEffect} from "react";
import "../../styles/add-mc-pd-form.css"
import {CirclePicker} from "react-color";

const AddMCPDForm = ({isFormOpen, onFormClose, isClickEdit, selectedPersonel, onSaveNewPersonel}) => {

    const [addPersonelFormData, setAddPersonelFormData] = useState({
        personnel_id: "",
        fName: "",
        lName: "",
        nickname: "",
        color: "",
        position: "",
        positionID: "",
        employmentType: "",
        status: "",
        kpiHours: "",
        maxHours: "",
    })

    useEffect(() => {
        console.log("check selectedpersoneldata", selectedPersonel);
        
        if (isClickEdit && selectedPersonel) {
            setAddPersonelFormData({
                personnel_id: selectedPersonel.personnel_id || "",
                fName: selectedPersonel.f_name || "",
                lName: selectedPersonel.l_name || "",
                nickname: selectedPersonel.nickname || "",
                color: selectedPersonel.color || "",
                position: selectedPersonel.position_name || "",
                positionID: selectedPersonel.position_id || "",
                employmentType: selectedPersonel.employment_type || "",
                status: selectedPersonel.status || "",
                kpiHours: selectedPersonel.kpi_hours || "",
                maxHours: selectedPersonel.max_hours || "",
            });
        } else {
            setAddPersonelFormData({
                personnel_id: addPersonelFormData.personnel_id || "",
                fName: "",
                lName: "",
                nickname: "",
                color: "",
                position: "",
                positionID: "",
                employmentType: "",
                status: "",
                kpiHours: "",
                maxHours: "",
            });
        }
    }, [isClickEdit, selectedPersonel]);

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log("Form data to submit:", addPersonelFormData);

        const newPersonel = {
            personnel_id: addPersonelFormData.personnel_id,
            f_name: addPersonelFormData.fName,
            l_name: addPersonelFormData.lName,
            nickname: addPersonelFormData.nickname,
            color: addPersonelFormData.color,
            position_id: addPersonelFormData.positionID,
            position: addPersonelFormData.position,
            employment_type: addPersonelFormData.employmentType,
            status: addPersonelFormData.status,
            kpi_hours: addPersonelFormData.kpiHours,
            max_hours: addPersonelFormData.maxHours,
        }
        console.log("onSavenew personal submit:", newPersonel);

        onSaveNewPersonel(newPersonel);
        onFormClose();
    }

    return(
        <div className="form-container">
            <div className="form-header-section">
                <h3>{isClickEdit? "Edit Personel Data" : "Add Personel Data"}</h3>
                <div className="close-btn" onClick={onFormClose}>
                    <i className="fa-solid fa-xmark"></i>
                </div>  
            </div>
            <form className="form-body" onSubmit={handleSubmit}>
                <div className="form-input-area">
                    <label htmlFor="">First Name / Last Name</label>
                    <input 
                    type="text" 
                    name="fName"
                    placeholder="Enter First Name"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, fName: event.target.value
                    })}
                    value={addPersonelFormData.fName}
                    />
                    <input 
                    type="text" 
                    name="lName"
                    placeholder="Enter Last Name"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, lName: event.target.value
                    })}
                    value={addPersonelFormData.lName}
                    />
                    <label htmlFor="">Nickname</label>
                    <input 
                    type="text" 
                    name="nickname"
                    placeholder="Enter Nickname"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, nickname: event.target.value
                    })}
                    value={addPersonelFormData.nickname}
                    />
                    <label htmlFor="">Color</label>
                    <div className="colorpicker-container">
                        <CirclePicker
                            color={addPersonelFormData.color}
                            name="color"
                            onChangeComplete={(color) =>
                                setAddPersonelFormData({
                                ...addPersonelFormData,
                                color: color.hex,
                                })
                            }
                            value={addPersonelFormData.color}
                            circleSize={18}
                            circleSpacing={5}
                        />
                    </div>
                    <div style={{
                            marginTop: "10px",
                            width: "40px",
                            height: "20px",
                            borderRadius: "4px",
                            backgroundColor: addPersonelFormData.color || "#ccc",
                            border: "1px solid #999"
                        }}
                    ></div>
                    <label htmlFor="">Role</label>
                    <select
                        name="position_id"
                        value={addPersonelFormData.positionID || ""}
                        onChange={(e) =>
                            setAddPersonelFormData({ ...addPersonelFormData, positionID: e.target.value })
                        }
                    >
                        <option value="">select role</option>
                        <option value="1">MC</option>
                        <option value="2">PD</option>
                    </select>
                    <label htmlFor="">Employment Information</label>
                    <select
                        value={addPersonelFormData.employmentType || ""}
                        onChange={(e) =>
                            setAddPersonelFormData({ ...addPersonelFormData, employmentType: e.target.value })
                        }
                    >
                        <option value="">Full Time or Freelance</option>
                        <option value="fulltime">Full Time</option>
                        <option value="freelance">Freelance</option>
                    </select>
                    <select
                        value={addPersonelFormData.status || ""}
                        onChange={(e) =>
                            setAddPersonelFormData({ ...addPersonelFormData, status: e.target.value })
                        }
                    >
                        <option value="">Onboarding or resigned</option>
                        <option value="Onboarding">Onboarding</option>
                        <option value="resign">Resigned</option>
                    </select>
                    <label htmlFor="">KPI Hours</label>
                    <input 
                    type="text" 
                    placeholder="Enter KPI hours"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, kpiHours: event.target.value
                    })}
                    value={addPersonelFormData.kpiHours}
                    />
                    <label htmlFor="">Max Hours</label>
                    <input 
                    type="text" 
                    placeholder="Enter Max hours"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, maxHours: event.target.value
                    })}
                    value={addPersonelFormData.maxHours}
                    />
                </div>
                <div className="button-group-area">
                    <button className="form-button save-button" type="submit">save</button>
                    <button className="form-button cancel-button" type="button" onClick={onFormClose}>cancel</button>
                </div>
            </form>
        </div>
    );
}

export default AddMCPDForm
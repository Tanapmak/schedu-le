import React, {useState, useEffect} from "react";
import "../../styles/add-mc-pd-form.css"
import {CirclePicker} from "react-color";

const AddMCPDForm = ({isFormOpen, onFormClose, isClickEdit, selectedPersonel, onSaveNewPersonel}) => {

    const [addPersonelFormData, setAddPersonelFormData] = useState({
        name: "",
        surname: "",
        nickname: "",
        color: "",
        role: "",
        employmentType: "",
        status: "",
        kpiHours: "",
        maxHours: "",
    })

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log("Form data to submit:", addPersonelFormData);

        const newPersonel = {
            name: addPersonelFormData.name,
            surname: addPersonelFormData.surname,
            nickname: addPersonelFormData.nickname,
            color: addPersonelFormData.color,
            role: addPersonelFormData.role,
            employmentType: addPersonelFormData.employmentType,
            status: addPersonelFormData.status,
            kpiHours: addPersonelFormData.kpiHours,
            maxHours: addPersonelFormData.maxHours,
        }

        onSaveNewPersonel(newPersonel);

    }

    useEffect(() => {
        if (isClickEdit && selectedPersonel) {
            setAddPersonelFormData({
                name: selectedPersonel.name || "",
                surname: selectedPersonel.surname || "",
                nickname: selectedPersonel.nickname || "",
                color: selectedPersonel.color || "",
                role: selectedPersonel.role || "",
                employmentType: selectedPersonel.employmentType || "",
                status: selectedPersonel.status || "",
                kpiHours: selectedPersonel.kpiHours || "",
                maxHours: selectedPersonel.maxHours || "",
                id: selectedPersonel.id,
            });
        } else {
            setAddPersonelFormData({
                name: "",
                surname: "",
                nickname: "",
                color: "",
                role: "",
                employmentType: "",
                status: "",
                kpiHours: "",
                maxHours: "",
            });
        }
    }, [isClickEdit, selectedPersonel]);

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
                    placeholder="Enter First Name"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, name: event.target.value
                    })}
                    value={addPersonelFormData.name}
                    />
                    <input 
                    type="text" 
                    placeholder="Enter Last Name"
                    onChange={(event) => setAddPersonelFormData({
                        ...addPersonelFormData, surname: event.target.value
                    })}
                    value={addPersonelFormData.surname}
                    />
                    <label htmlFor="">Nickname</label>
                    <input 
                    type="text" 
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
                            onChangeComplete={(color) =>
                                setAddPersonelFormData({
                                ...addPersonelFormData,
                                color: color.hex,
                                })
                            }
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
                        value={addPersonelFormData.role || ""}
                        onChange={(e) =>
                            setAddPersonelFormData({ ...addPersonelFormData, role: e.target.value })
                        }
                    >
                        <option value="">select role</option>
                        <option value="MC">MC</option>
                        <option value="PD">PD</option>
                    </select>
                    <label htmlFor="">Employment Information</label>
                    <select
                        value={addPersonelFormData.employmentType || ""}
                        onChange={(e) =>
                            setAddPersonelFormData({ ...addPersonelFormData, employmentType: e.target.value })
                        }
                    >
                        <option value="">Full Time or Freelance</option>
                        <option value="full-time">Full Time</option>
                        <option value="freelance">Freelance</option>
                    </select>
                    <select
                        value={addPersonelFormData.status || ""}
                        onChange={(e) =>
                            setAddPersonelFormData({ ...addPersonelFormData, status: e.target.value })
                        }
                    >
                        <option value="">Onboarding or resigned</option>
                        <option value="onboarding">Onboarding</option>
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
                    <button className="form-button cancel-button" onClick={onFormClose}>cancel</button>
                </div>
            </form>
        </div>
    );
}

export default AddMCPDForm
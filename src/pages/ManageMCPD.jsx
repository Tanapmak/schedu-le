import React, {useState, useEffect} from "react";
import "../styles/manage-mc-pd.css"
import AddMCPDForm from "../components/forms/AddMCPDForm";
import api from "../api.js";

const ManageMCPD = () => {

    const [isClickEdit, setClickEdit] = useState(false);
    const [isFormOpen, setFormOpen] = useState(false);
    const [personelList, setPersonelList] = useState([]);
    const [selectedPersonel, setSelectedPersonel] = useState(null);

    const fetchPersonnelData = async () => {
        try {
            const result = await api.get("/personnels");
            setPersonelList(result.data)
        } catch (err) {
            console.error("Error fetching personnels", err); 
        }       
    }

    useEffect(() => {
        fetchPersonnelData();
    },[]);

    const handleAddPersonelClick = () => {
        setFormOpen(true);
    }

    const handleFormClose = () => {
        setFormOpen(false);
        setSelectedPersonel(null);
        setClickEdit(false);
    }

    const handlePersonelSubmit = async (form) => {
        const payload = {
            personnel_id: form.personnel_id,
            fName: form.f_name.trim(),
            lName: form.l_name.trim(),
            nickname: form.nickname.trim(),
            color: form.color,
            position_id: form.position_id,
            employment_type: form.employment_type,
            status: form.status,
            kpi_hours: form.kpi_hours,
            max_hours: form.max_hours,
        };

        try {
            if (isClickEdit && form.personnel_id) {
                await api.put(`/personnels/${form.personnel_id}`, payload);
                console.log("Updated personnel:", payload);
            } else {
                const response = await api.post("/personnels", payload);
                console.log("Created personnel:", response.data);
            }
            await fetchPersonnelData();
        } catch (err) {
            console.error("Error saving personnels:", err);   
        } finally {
            handleFormClose();
        }
    }

    const handleEditPersonel = (personel) => {
        setSelectedPersonel(personel);
        setClickEdit(true);
        setFormOpen(true);
    };
    
    const handleDeletePersonel = async (id) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this request?");
        if (!confirmDelete) return;
            
        try {
            await api.delete(`/personnels/${id}`);
            await fetchPersonnelData();
        } catch (err) {
            console.error("Error deleting personnel:", err);
        }
        
    };

    return (
        <div className="main-container">
            <div className="header-container">
                <div className="breadcrum">
                    <p>livestream</p><i className="fa-solid fa-chevron-right"></i><p>manage MC/PD</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>manage MC/PD</h2>
                    </div>
                    <div className="add-mcpd-btn-group">
                        <button className="add-mcpd-btn" onClick={handleAddPersonelClick}>add personel</button>
                    </div>
                </div>
            </div>
            <div className="body-container manage-mc-pd-container">
                <div className="table-container">
                    <table className="mc-pd-list-container">
                        <thead>
                            <tr>
                                <th key="color">color</th>
                                <th key="fname">first name</th>
                                <th key="lname">last name</th>
                                <th key="nickname">nickname</th>
                                <th key="role">role</th>
                                <th key="employmentType">employment type</th>
                                <th key="status">status</th>
                                <th key="kpiHours">KPI hours</th>
                                <th key="maxHours">Max hours</th>
                                <th key="action">action</th>
                            </tr>
                        </thead>
                    <tbody>
                        {personelList.length > 0 ? (
                            personelList.map((staff) => (
                                <tr key={staff.personnel_id}>
                                    <td>
                                        <div style={{
                                            width: "20px",
                                            height: "20px",
                                            borderRadius: "4px",
                                            backgroundColor: staff.color || "#ccc",
                                            border: "none"
                                        }}
                                    ></div>
                                    </td>
                                    <td>{staff.f_name}</td>
                                    <td>{staff.l_name}</td>
                                    <td>{staff.nickname}</td>
                                    <td>{staff.position_name}</td>
                                    <td>{staff.employment_type}</td>
                                    <td>{staff.status}</td>
                                    <td>{staff.kpi_hours}</td>
                                    <td>{staff.max_hours}</td>
                                    <td>
                                        <div className="action-btn-group">
                                            <button className="btn edit-btn" onClick={()=>handleEditPersonel(staff)}>edit</button>
                                            <button className="btn delete-btn" onClick={()=>handleDeletePersonel(staff.personnel_id)}>delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={10}>No personel added yet</td>
                            </tr>
                        )}
                    </tbody>
                    </table>                    
                </div>
                {isFormOpen && 
                    <AddMCPDForm 
                        isFormOpen={isFormOpen}
                        onFormClose={handleFormClose}
                        isClickEdit={isClickEdit}
                        selectedPersonel={selectedPersonel}
                        onSaveNewPersonel={handlePersonelSubmit}
                    />
                }
            </div>
            
        </div>
    );
}

export default ManageMCPD
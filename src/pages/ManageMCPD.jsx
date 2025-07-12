import React, {useState} from "react";
import "../styles/manage-mc-pd.css"
import AddMCPDForm from "../components/forms/AddMCPDForm";

const ManageMCPD = () => {

    const [isClickEdit, setClickEdit] = useState(false);
    const [isFormOpen, setFormOpen] = useState(false);
    const [personelList, setPersonelList] = useState([]);
    const [selectedPersonel, setSelectedPersonel] = useState(null);

    const handleAddPersonelClick = () => {
        setFormOpen(true);
    }

    const handleFormClose = () => {
        setFormOpen(false);
        setSelectedPersonel(null);
        setClickEdit(false);
    }

    const handlePersonelSubmit = (personelData) => {
        if(isClickEdit && selectedPersonel) {
            console.log("new personel data submitted");
            const updatedPersonel = {
                ...personelData,
                id: selectedPersonel.id, // keep old ID
            };
            setPersonelList((prev) =>
                prev.map((personel) => personel.id === selectedPersonel.id ? updatedPersonel : personel)
            );
        } else {
            const newPersonelData = {
                ...personelData,
                id: Date.now(),
            };
            setPersonelList((prev => [...prev, newPersonelData]));
        }
            setClickEdit(false);
            setSelectedPersonel(null);
            setFormOpen(false);
    }

    const handleEditPersonel = (personel) => {
        setSelectedPersonel(personel);
        setClickEdit(true);
        setFormOpen(true);
    };
    
    const handleDeletePersonel = (id) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this request?");
        if (confirmDelete) {
            setPersonelList(prev => prev.filter(person => person.id !== id));
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
                            <th>color</th>
                            <th>first name</th>
                            <th>last name</th>
                            <th>nickname</th>
                            <th>role</th>
                            <th>employment type</th>
                            <th>status</th>
                            <th>KPI hours</th>
                            <th>Max hours</th>
                            <th>action</th>
                        </thead>
                    <tbody>
                        {personelList.length > 0 ? (
                            personelList.map((staff) => (
                                <tr key={staff.id}>
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
                                    <td>{staff.name}</td>
                                    <td>{staff.surname}</td>
                                    <td>{staff.nickname}</td>
                                    <td>{staff.role}</td>
                                    <td>{staff.employmentType}</td>
                                    <td>{staff.status}</td>
                                    <td>{staff.kpiHours}</td>
                                    <td>{staff.maxHours}</td>
                                    <td>
                                        <div className="action-btn-group">
                                            <button className="btn edit-btn" onClick={()=>handleEditPersonel(staff)}>edit</button>
                                            <button className="btn delete-btn" onClick={()=>handleDeletePersonel(staff.id)}>delete</button>
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
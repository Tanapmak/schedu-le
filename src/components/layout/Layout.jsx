import React from "react";
import Globalnav from "../../components/layout/Globalnav.jsx";
import Sidebar from "../../components/layout/Sidebar.jsx";
import ManageSchedule from "../../pages/ManageSchedule.jsx";
import LiveSchedule from "../../pages/LiveSchedule";
import MyDayOff from "../../pages/MyDayOff";
import Home from "../../pages/Home"
import ManageDayOff from "../../pages/ManageDayOff.jsx";
import ManageMCPD from "../../pages/ManageMCPD.jsx";
import ManageRoom from "../../pages/ManageRoom.jsx";
import { useState } from "react";
import '../../styles/layout.css'

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const toggleSideBar = () => setIsSidebarOpen (prev => !prev);
    const [currentPage, setCurrentPage] = useState('Home');

    const handlePageChange = (pageName) => {
        setCurrentPage(pageName);
        setIsSidebarOpen(false);
        console.log(pageName);
        
    }

    const renderCurrentPage = () => {
        switch (currentPage) {
            case "Home":
                return <Home />;
            case "LiveSchedule":
                return <LiveSchedule />;
            case "ManageSchedule":
                return <ManageSchedule />;  
            case "MyDayOff":
                return <MyDayOff />;   
            case "ManageDayOff":
                 return <ManageDayOff />; 
            case "ManageMCPD":
                return <ManageMCPD />;
            case "ManageRoom":
                return <ManageRoom />;
            default:
                return <Home />;
        }
    }
    
    return (
        <div className="layout-container">
            <Sidebar 
                isSidebarOpen={isSidebarOpen} 
                onSideBarClose={toggleSideBar} 
                onPageChange={handlePageChange}
            />
            <div className={`main-content ${isSidebarOpen ? "shifted" : ""}`}>
                <Globalnav 
                    toggleSideBar={toggleSideBar} 
                    isOpen={isSidebarOpen} 
                />
                <div className="user-area">
                    {renderCurrentPage()}
                </div>
            </div>
        </div>
    );
}

export default Layout
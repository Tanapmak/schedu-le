import React from "react";
import Globalnav from "./GlobalNav";
import Sidebar from "./Sidebar";
import ManageSchedule from "./ManageSchedule";
import LiveSchedule from "./LiveSchedule";
import Home from "./Home"
import AdminCalendar from "./AdminCalendar";
import { useState } from "react";
import '../styles/layout.css'

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
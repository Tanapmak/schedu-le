import React from "react";
import Globalnav from "./GlobalNav";
import Sidebar from "./Sidebar";
import ManageSchedule from "./ManageSchedule";
import { useState } from "react";
import '../styles/layout.css'

const Layout = ({children}) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const toggleSideBar = () => setIsSidebarOpen (prev => !prev);
    return (
        <div className="layout-container">
            <Sidebar 
                isOpen={isSidebarOpen} 
                onClose={toggleSideBar} 
            />
            <div className={`main-content ${isSidebarOpen ? "shifted" : ""}`}>
                <Globalnav 
                    toggleSideBar={toggleSideBar} 
                    isOpen={isSidebarOpen} 
                />
                <div className="user-area">
                    {children}
                    <ManageSchedule />
                </div>
            </div>
        </div>
    );
}

export default Layout
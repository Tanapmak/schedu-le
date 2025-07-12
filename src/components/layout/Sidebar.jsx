import React, {useState} from "react";
import '../../styles/sidebar.css'

const Sidebar = (props) => {

    const [isLivestreamItemClick, setLivestreamItemClicked] = useState(false);
    const [isCSItemClick, setCSItemClick] = useState(false);
    const [isCampaignClick, setCampaignClick] = useState(false);

    const toggleLiveMainItem = () => {
        setLivestreamItemClicked(prev => !prev)
    }

    const toggleCSMainItem = () => {
        setCSItemClick(prev => !prev)
    }

    const toggleCampaignItem = () => {
        setCampaignClick(prev => !prev)
    }

    return (
        <div className={`sidebar-container ${props.isSidebarOpen ? "open" : ""}`}>
            <div className="sidebar-logo-container">
                <div className="sidebar-hamburger-menu">
                    <i className="fa-solid fa-bars"></i>
                </div>
                <div className="sidebar-close" onClick={props.onSideBarClose}>
                    <i className="fa-solid fa-xmark"></i>
                </div>
            </div>
            <div className="sidebar-main-item-container" onClick={() => {props.onPageChange("Home")}}>
                <div className="sidebar-main-item-text">
                    <i className="fa-solid fa-house"></i>
                    <a href="#" className="sidebar-item-link">Home</a>
                </div>
            </div>
            <div className="sidebar-main-item-container" onClick={toggleLiveMainItem}>
                <div className="sidebar-main-item-text">
                    <i className="fa-solid fa-tower-broadcast"></i>
                    <a href="#" className="sidebar-item-link">livestream</a>
                </div>
                <div>
                    <i className="fa-solid fa-chevron-right"></i>
                </div>
            </div>  
            {isLivestreamItemClick &&<div className="sidebar-sub-item-container">
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("LiveSchedule")}}>
                    <i className="fa-solid fa-clock"></i>
                    <a href="#" className="sidebar-item-link">livestream schedule</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("MyDayOff")}}>
                    <i class="fa-solid fa-person-walking-arrow-right"></i>
                    <a href="#" className="sidebar-item-link">MC/PD day off</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageSchedule")}}>
                    <i className="fa-solid fa-list-check"></i>
                    <a href="#" className="sidebar-item-link">manage schedule</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageDayOff")}}>
                    <i className="fa-solid fa-list-check"></i>
                    <a href="#" className="sidebar-item-link">manage day off</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageMCPD")}}>
                    <i className="fa-solid fa-people-roof"></i>
                    <a href="#" className="sidebar-item-link">manage MC/PD</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageRoom")}}>
                    <i className="fa-solid fa-person-shelter"></i>
                    <a href="#" className="sidebar-item-link">manage room</a>
                </div>
            </div>}

            <div className="sidebar-main-item-container" onClick={toggleCSMainItem}>
                <div className="sidebar-main-item-text">
                    <i class="fa-solid fa-headphones"></i>
                    <a href="#" className="sidebar-item-link">customer service</a>
                </div>
                <div>
                    <i className="fa-solid fa-chevron-right"></i>
                </div>
            </div>  
            {isCSItemClick &&<div className="sidebar-sub-item-container">
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("CSschedule")}}>
                    <i className="fa-solid fa-clock"></i>
                    <a href="#" className="sidebar-item-link">CS schedule</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("CSLeave")}}>
                    <i class="fa-solid fa-person-walking-arrow-right"></i>
                    <a href="#" className="sidebar-item-link">CS day off</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageCSschedule")}}>
                    <i className="fa-solid fa-list-check"></i>
                    <a href="#" className="sidebar-item-link">manage CS schedule</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageCSLeave")}}>
                    <i className="fa-solid fa-list-check"></i>
                    <a href="#" className="sidebar-item-link">manage CS leave</a>
                </div>
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("ManageCS")}}>
                    <i className="fa-solid fa-people-roof"></i>
                    <a href="#" className="sidebar-item-link">manage CS</a>
                </div>
            </div>}

            <div className="sidebar-main-item-container" onClick={toggleCampaignItem}>
                <div className="sidebar-main-item-text">
                    <i class="fa-solid fa-tags"></i>
                    <a href="#" className="sidebar-item-link">EC campaign</a>
                </div>
                <div>
                    <i className="fa-solid fa-chevron-right"></i>
                </div>
            </div>  
            {isCampaignClick &&<div className="sidebar-sub-item-container">
                <div className="sidebar-item-container" onClick={() => {props.onPageChange("CampaignCalendar")}}>
                    <i class="fa-solid fa-calendar-days"></i>
                    <a href="#" className="sidebar-item-link">campaign calendar</a>
                </div>
            </div>}
            
            
            
        </div>
    );
}

export default Sidebar
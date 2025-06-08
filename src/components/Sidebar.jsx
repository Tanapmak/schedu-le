import React, {useState} from "react";
import '../styles/sidebar.css'

const Sidebar = (props) => {

    const [isMainItemClicked, setMainItemClick] = useState(false);
    const toggleSideBar = () => setMainItemClick (prev => !prev);


    return (
        <div className={`sidebar-container ${props.isOpen ? "open" : ""}`}>
            <div className="sidebar-logo-container">
                <div className="sidebar-hamburger-menu">
                    <i className="fa-solid fa-bars"></i>
                </div>
                <div className="sidebar-close" onClick={props.onClose}>
                    <i className="fa-solid fa-xmark"></i>
                </div>
            </div>
            <div className="sidebar-main-item-container" onClick={toggleSideBar}>
                <div className="sidebar-main-item-text">
                    <i className="fa-solid fa-tower-broadcast"></i>
                    <a href="#" className="sidebar-item-link">livestream</a>
                </div>
                <div>
                    <i className="fa-solid fa-chevron-right"></i>
                </div>
            </div>  
            {isMainItemClicked &&<div className="sidebar-sub-item-container">
                <div className="sidebar-item-container">
                    <i className="fa-solid fa-clock"></i>
                    <a href="#" className="sidebar-item-link">livestream schedule</a>
                </div>
                <div className="sidebar-item-container">
                    <i className="fa-solid fa-list-check"></i>
                    <a href="#" className="sidebar-item-link">manage schedule</a>
                </div>
                <div className="sidebar-item-container">
                    <i className="fa-solid fa-people-roof"></i>
                    <a href="#" className="sidebar-item-link">manage MC/PD</a>
                </div>
                <div className="sidebar-item-container">
                    <i className="fa-solid fa-person-shelter"></i>
                    <a href="#" className="sidebar-item-link">manage room</a>
                </div>
            </div>}
            
            
            
        </div>
    );
}

export default Sidebar
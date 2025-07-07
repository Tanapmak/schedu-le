import React from "react";
import '../../styles/globalnav.css'

const Globalnav = (props) => {
    return (
        <div className="global-nav-container">
            <div className="logo-container">
                {props.isOpen? 
                <div className="hamburger-menu.hidden">
                    
                </div> : 
                <div className="hamburger-menu" onClick={props.toggleSideBar}>
                    <i className="fa-solid fa-bars"></i>
                </div>}
                <div className="applogo">
                    <i className="fa-solid fa-calendar-check"></i>
                </div>
                <p className="logo-text">Schedu-Le</p>
            </div>
            <div className="user-login-container">
                <i className="fa-solid fa-circle-user"></i>
            </div>
        </div>
    );
}

export default Globalnav
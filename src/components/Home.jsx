import React from "react";
import "../styles/home.css"

export default function Home() {
    return (
        <div className="main-container">
            <div className="title-container">
                <h1>Home</h1>
            </div>
            <div className="section-container">
                <div className="label-container">
                    <p className="label">room live hours overview</p>
                </div>
                <div className="livehour-container">
                    <div className="total-hour-container">
                        <div className="hour-card">
                            <p className="room-name">Room</p>
                            <div className="hour-container">
                                <p className="hour-amount">230</p>
                                <p className="hour-text">hrs</p>
                            </div>
                        </div>
                        
                    </div>
                    <div className="individual-hour-container">
                        <div className="hour-card">
                            <p className="room-name">Room</p>
                            <div className="hour-container">
                                <p className="hour-amount">230</p>
                                <p className="hour-text">hrs</p>
                            </div>
                        </div>
                        <div className="hour-card">
                            <p className="room-name">Room</p>
                            <div className="hour-container">
                                <p className="hour-amount">230</p>
                                <p className="hour-text">hrs</p>
                            </div>
                        </div>
                    </div>
                    <div className="action-btn">
                        <p>+</p>
                        <p>add room</p>
                    </div>
                </div>
            </div>
            <div className="section-container">
                <div className="label-container">
                    <p className="label">men power overview</p>
                </div>
                <div className="section-sub-container">
                    <div className="livehour-container">
                        <div className="total-hour-container">
                            <div className="hour-card">
                                <p className="room-name">All MC</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>    
                        </div>
                        <div className="individual-hour-container">
                            <div className="hour-card">
                                <p className="room-name">MC 1</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">MC 2</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">MC 3</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">MC 4</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">MC 5</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">MC 6</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                        </div>
                        <div className="action-btn">
                            <p>+</p>
                            <p>add MC</p>
                        </div>
                    </div>
                    <div className="livehour-container">
                        <div className="total-hour-container">
                            <div className="hour-card">
                                <p className="room-name">All PD</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>    
                        </div>
                        <div className="individual-hour-container">
                            <div className="hour-card">
                                <p className="room-name">PD 1</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">PD 2</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">PD 3</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                            <div className="hour-card">
                                <p className="room-name">PD 4</p>
                                <div className="hour-container">
                                    <p className="hour-amount">230</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                        </div>
                        <div className="action-btn">
                            <p>+</p>
                            <p>add PD</p>
                        </div>
                    </div>
                </div>
            </div>
            
        </div>
    );
}
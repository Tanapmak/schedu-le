import React from "react";
import { useEffect, useState } from "react";
import { startOfMonth, endOfMonth } from "date-fns";
import api from "../api";
import "../../src/styles/home.css"

export default function Home() {
    const [hoursData, setHourData] = useState({});
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    
    const fetchHoursData = async (date = selectedMonth) => {
        try {
            const start = startOfMonth(date).toLocaleString();
            const end = endOfMonth(date).toLocaleString();
            const result = await api.get(`/summary?start=${start}&end=${end}`);
            setHourData(result.data);
        } catch (err) {
            console.error("Error fetching hours data", err);
        }
    }
    
    useEffect(() => {
        fetchHoursData(selectedMonth);
    },[selectedMonth]);

    const currentTotalHours = hoursData.total_hours;
    const currentAllMcHours = hoursData.total_mc;
    const currentAllPdHours = hoursData.total_pd;
    const currentMcTotal = hoursData.mc_summary;
    const currentPdTotal = hoursData.pd_summary;
    const currentRoomTotal = hoursData.room_summary;

    return (
        <div className="main-container">
            <div className="title-container home-title-container">
                <h1>Home</h1>
                <div className="month-selector">
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                            const selected = new Date(e.target.value);
                            setSelectedMonth(selected);
                        }}
                    />
                </div>
            </div>
            <div className="section-container">
                
                <div className="label-container">
                    <p className="label">room live hours overview</p>
                </div>
                <div className="livehour-container">
                    <div className="total-hour-container">
                        <div className="hour-card">
                            <p className="room-name">All Room</p>
                            <div className="hour-container">
                                {currentTotalHours ? (
                                <p className="hour-amount">{currentTotalHours}</p>
                                ) : (0)}
                                <p className="hour-text">hrs</p>
                            </div>
                        </div>
                    </div>
                    <div className="individual-hour-container">
                        {currentRoomTotal && currentRoomTotal.length > 0 ? (
                                currentRoomTotal.map((room) => (
                            <div className="hour-card">
                                <p className="room-name">{room.name}</p>
                                <div className="hour-container">
                                    <p className="hour-amount">{room.total}</p>
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>
                        ))) : (0)} 
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
                                    {currentAllMcHours ? (
                                    <p className="hour-amount">{currentAllMcHours}</p>
                                    ) : (0)}
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>    
                        </div>
                        <div className="individual-hour-container">
                            {currentMcTotal && currentMcTotal.length > 0 ? (
                                currentMcTotal.map((mc) => (
                                <div className="hour-card">
                                    <p className="room-name">{mc.nickname}</p>
                                    <div className="hour-container">
                                        <p className="hour-amount">{mc.total}</p>
                                        <p className="hour-text">hrs</p>
                                    </div>
                                </div>
                            ))) : (0)} 
                        </div>
                    </div>
                    <div className="livehour-container">
                        <div className="total-hour-container">
                            <div className="hour-card">
                                <p className="room-name">All PD</p>
                                <div className="hour-container">
                                    {currentAllPdHours ? 
                                    <p className="hour-amount">{currentAllPdHours}</p>
                                    : (0)}
                                    <p className="hour-text">hrs</p>
                                </div>
                            </div>    
                        </div>
                        <div className="individual-hour-container">
                            {currentPdTotal && currentPdTotal.length > 0 ? (
                                currentPdTotal.map((pd) => (
                                <div className="hour-card">
                                    <p className="room-name">{pd.nickname}</p>
                                    <div className="hour-container">
                                        <p className="hour-amount">{pd.total}</p>
                                        <p className="hour-text">hrs</p>
                                    </div>
                                </div>
                            ))) : (0)} 
                        </div>
                    </div>
                </div>
            </div>
            
        </div>
    );
}
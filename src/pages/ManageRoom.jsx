import React from "react";
import { useState, useEffect } from "react";
import "../styles/manage-room.css"

const ManageRoom = () => {

    const [roomList, setRoomList] = useState([]);
    const [isClickAdd, setClickAdd] = useState(false);
    const [isClickEditRoom, setClickEditRoom] = useState(false);
    const [inputRoom, setInputRoom] = useState("");
    const [editRoomId, setEditRoomId] = useState(null);
    const [editRoomName, setEditRoomName] = useState("");

    const handleAddRoom = (e) => {
        e.preventDefault();
        if(inputRoom.trim() === "") return;

        setRoomList((prev) => [...prev, {id: Date.now(), name: inputRoom}]);
        setInputRoom("");
    }

    const handleEditRoom = (room) => {
        setEditRoomId(room.id);
        setEditRoomName(room.name);
    }

    const handleSaveEdit = () => {
        setRoomList((prevRoomList) => 
            prevRoomList.map((room) => 
                room.id === editRoomId ? {...room, name: editRoomName } : room
            )
        );
        setEditRoomId(null);
        setEditRoomName("");
    }

    const handleCancelEdit = () => {
        setEditRoomId(null);
        setEditRoomName("");
    };

    const handleInputChange = (event) => {
        setInputRoom(event.target.value);
    }

    const handleDeleteRoom = (id) => {
        setRoomList((prevRoom) => {
            return prevRoom.filter((room) => room.id !== id)
        })
    }

    return(
        <div className="main-container">
            <div className="header-container">
                <div className="breadcrum">
                    <p>livestream</p><i className="fa-solid fa-chevron-right"></i><p>manage room</p>
                </div>
                <div className="page-title-container">
                    <div className="page-title">
                        <h2>manage room</h2>
                    </div>
                </div>
            </div>
            <div className="body-container manage-room-container">
                <form className="add-room-input-container">
                    <input 
                    type="text" 
                    className="addroom-input-box" 
                    placeholder="Enter room name to add room"
                    onChange={handleInputChange}
                    value={inputRoom}
                    />
                    <button type="submit" className="add-room-btn" onClick={handleAddRoom}>Add</button>
                </form>
                <div className="room-card-container">
                    {roomList.length > 0 ? (
                        roomList.map((room) => (
                            <div className="roomcard" key={room.id}>
                                {editRoomId === room.id ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editRoomName}
                                            onChange={(e) => setEditRoomName(e.target.value)}
                                            className="edit-room-input"
                                        />
                                        <div className="room-name-btn-group">
                                            <button onClick={handleSaveEdit} className="room-edit-btn">save</button>
                                            <button onClick={handleCancelEdit} className="room-delete-btn">cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                    <h3 className="roomname">{room.name}</h3>
                                        <div className="room-name-btn-group">
                                            <button className="room-edit-btn" onClick={() => handleEditRoom(room)}>edit</button>
                                            <button className="room-delete-btn" onClick={() => handleDeleteRoom(room.id)}>delete</button>
                                        </div>
                                    </>
                                )}
                            </div>
                            ))
                        ): (null)}
                </div>
            </div>
        </div>
    );
};

export default ManageRoom;

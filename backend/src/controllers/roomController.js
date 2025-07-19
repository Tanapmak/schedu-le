import pool from "../config/db.js";

// GET /api/rooms
export async function getAllRooms(req, res) {
    try {
        const result = await pool.query(
            `SELECT 
                r.id,
                r.name,
                r.created_at,
                r.updated_at
            FROM rooms r
            ORDER BY r.created_at ASC`);
        const rooms = result.rows;
        res.json(rooms);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot get room list"});
    }
}

// GET /api/rooms/:id
export async function getRoomById(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT 
                r.id,
                r.name,
                r.created_at,
                r.updated_at
            FROM rooms r
            WHERE id = $1`
            ,[id]);
        if(result.rows.length === 0) {
            return res.status(404).json({error: "Room not found"});
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot get the room"}); 
    }
}

// POST /api/rooms
export async function createRoom(req, res) {
    try {
        const { name } = req.body;
        const result = await pool.query(
            `INSERT INTO rooms (name) 
            VALUES ($1)
            RETURNING id, name, created_at, updated_at`
            ,[name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot create room"});
    }
}

// PUT /api/rooms/:id
export async function updateRoom(req, res) {
    try {
        const { name } = req.body;
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE rooms
            SET 
                name = $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING id, name, updated_at`
            ,[name, id]);
        if(result.rows.length === 0) {
            res.status(404).json({error: "Room not found"});
            return;
        }
        res.status(201).json(result.rows[0]);
    } catch (err) {
       console.log(err);
       res.status(500).json({error: "Server error, cannot update room"});
    }
}

// DELETE /api/rooms/:id
export async function deleteRoom(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `DELETE FROM rooms
            WHERE id = $1`
            ,[id]);

        if(result.rowCount === 0) {
            return res.status(404).json({message: "Room not found"});
        }

        res.status(200).json({message: "Room deleted succesfully"});
        
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot delete the room"});
    }
}
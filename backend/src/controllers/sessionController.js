import pool from "../config/db.js";

// GET /api/sessions
export async function getAllSessions(req, res) {
    try {
        const result = await pool.query(
            `SELECT 
                ss.id,
                ss.title,
                ss.session_start,
                ss.session_end,
                ss.room_id,
                ss.mc_id,
                ss.pd_id,
                ss.day_type,
                ss.created_at,
                ss.updated_at
            FROM sessions ss
            ORDER BY ss.session_start`
        );

        const sessions = result.rows;
        res.json(sessions);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, cannot get sessions" });
    }
}

// GET /api/sessions/:id
export async function getSessionById(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                ss.id,
                ss.title,
                ss.session_start,
                ss.session_end,
                ss.room_id,
                ss.mc_id,
                ss.pd_id,
                ss.day_type,
                ss.created_at,
                ss.updated_at
            FROM sessions ss
            WHERE ss.id = $1
            ORDER BY ss.session_start
            `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Session not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, failed fetching sessions"});
    }
}

// POST /api/sessions
export async function createSession(req, res) {
    try {
        const {
            title, 
            session_start, 
            session_end, 
            room_id, 
            mc_id, 
            pd_id, 
            day_type,
        } = req.body;

        const result = await pool.query(`
            INSERT INTO sessions
            (title, session_start, session_end, room_id, mc_id, pd_id, day_type)

            VALUES
            ($1, $2, $3, $4, $5, $6, $7)

            RETURNING
            id, title, session_start, session_end, room_id, mc_id, pd_id, day_type, created_at, updated_at`
            ,[title, session_start, session_end, room_id, mc_id, pd_id, day_type]);

            res.status(201).json(result.rows[0]);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, failed create sessions"});
    }
}

// PUT /api/sessions/:id
export async function updateSession(req, res) {
    try {
        const { id } = req.params;
        const {
            title, 
            session_start, 
            session_end, 
            room_id, 
            mc_id, 
            pd_id, 
            day_type,
        } = req.body;

        const result = await pool.query(`
            UPDATE sessions
            SET 
                title = $1, 
                session_start = $2, 
                session_end = $3, 
                room_id = $4, 
                mc_id = $5, 
                pd_id = $6, 
                day_type = $7,
                updated_at = NOW()
            WHERE id = $8
            RETURNING id`
            ,[title, session_start, session_end, room_id, mc_id, pd_id, day_type, id]);

        if(result.rowCount === 0){
            return res.status(404).json({error: "Target session not found"});
        }
        res.status(200).json({message: "Session updated successfully"});
    } catch (err) {
        console.log("Update session error: ", err);
        res.status(400).json({error: "Invalid data or constraint violation"});
    }
}

// DELETE /api/sessions/:id
export async function deleteSession(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            DELETE FROM sessions 
            WHERE id = $1
            RETURNING id`
            ,[id]);

        if(result.rowCount === 0) {
            return res.status(404).json({error: "Target session not found"});
        }
        res.status(204).json({})
    } catch (err) {
        console.log("Delete session error: ", err);
        res.status(400).json({error: "Server error, Unsuccessfully delete session"});
    }

}
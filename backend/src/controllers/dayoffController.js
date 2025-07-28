import pool from "../config/db.js";

// GET /api/dayoffs - get all day off list
export async function getAllDayOffs(req, res) {
    try {
        const result = await pool.query(
            `SELECT
                pdo.id,
                pdo.personnel_id,
                psn.nickname AS requester_name,
                pdo.dayoff_start,
                pdo.dayoff_end,
                pdo.is_urgent,
                pdo.reason,
                pdo.dayoff_status,
                pdo.position_id,
                pos.position AS position_name,
                pdo.created_at,
                pdo.updated_at
            FROM personal_dayoffs pdo 
            LEFT JOIN personnels psn
                ON pdo.personnel_id = psn.id
            LEFT JOIN positions pos
                ON pdo.position_id = pos.id
            ORDER BY pdo.id ASC`)
        const dayOffs = result.rows;
        res.status(200).json(dayOffs);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, unable to get day off"});
    }
}

// GET /api/dayoffs/:id - get day off list by id
export async function getDayOffByID(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT
                pdo.id,
                pdo.personnel_id,
                pdo.dayoff_start,
                pdo.dayoff_end,
                pdo.is_urgent,
                pdo.reason,
                pdo.dayoff_status,
                pdo.created_at,
                pdo.updated_at
            FROM personal_dayoffs pdo 
            WHERE id = $1
            ORDER BY pdo.dayoff_start ASC`
            ,[id]);
        if(result.rows.length === 0) {
            res.status(404).json({error: "Day off not found"});
            return;
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, unable to get day off"});
    }
}

// POST /api/dayoffs - MC/PD request for day off
export async function createDayOff(req, res) {
    try {
        const {
            requester_id, 
            position_id, 
            dayoff_start, 
            dayoff_end, 
            is_urgent, 
            reason, 
            dayoff_status,
        } = req.body;

        const result = await pool.query(`
            INSERT INTO personal_dayoffs
            (personnel_id, position_id, dayoff_start, dayoff_end, is_urgent, reason, dayoff_status)

            VALUES
            ($1, $2, $3, $4, $5, $6, $7)

            RETURNING
            id, personnel_id, position_id, dayoff_start, dayoff_end, is_urgent, reason, dayoff_status, created_at, updated_at`
            ,[requester_id, position_id, dayoff_start, dayoff_end, is_urgent, reason, dayoff_status]);

            res.status(201).json(result.rows[0]);        
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, failed create day off"});        
    }
}
// PUT /api/dayoffs/:id - MC/PD edit day off
export async function updateDayOff(req, res) {
    try {
        const { id } = req.params;
        const { dayoff_start, dayoff_end, is_urgent, reason } = req.body;

        const result = await pool.query(
            `UPDATE personal_dayoffs
                SET 
                    dayoff_start = $1,
                    dayoff_end   = $2,
                    is_urgent    = $3,
                    reason       = $4,
                    updated_at   = NOW()
                WHERE id = $5
                RETURNING *`,
            [dayoff_start, dayoff_end, is_urgent, reason, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Day off not found" });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error, unable to update day off" });
    }
}

// PATCH /api/dayoffs/:id - Admin approves or rejects requested day off
export async function patchDayOffStatus(req, res) {
    try {
        const { id } = req.params;
        const { dayoff_status } = req.body;  // ค่าที่คาด: 'approved' หรือ 'rejected'

        const result = await pool.query(
            `UPDATE personal_dayoffs
                SET 
                    dayoff_status = $1,
                    updated_at    = NOW()
            WHERE id = $2
            RETURNING
                id,
                personnel_id,
                position_id,
                dayoff_start,
                dayoff_end,
                is_urgent,
                reason,
                dayoff_status,
                created_at,
                updated_at`,
            [dayoff_status, id]
        );

        if (result.rowCount === 0) {
        return res.status(404).json({ error: "Day off not found" });
        }

        res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error, unable to update day off status" });
  }
}

// DELETE /api/dayoffs/:id - MC/PD delete day off
export async function deleteDayOff(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `DELETE FROM personal_dayoffs WHERE id = $1 RETURNING id`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Day off not found" });
        }

        res.status(200).json({ message: "Day off deleted successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error, unable to delete day off" });
    }
}
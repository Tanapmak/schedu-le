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

//function for check the conflict dayoff ja
async function checkDayOffConflicts (start, end, position_id) {
    const normalizeDateOnly = (dateStr) => {
        const d = new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    const normalizeDateEndOfDay = (dateStr) => {
        const d = new Date(dateStr);
        d.setHours(23, 59, 59, 999);
        return d;
    };

    const newStart = normalizeDateOnly(start);
    const newEnd = normalizeDateEndOfDay(end);

    console.log("✅ Normalized start:", newStart.toISOString());
    console.log("✅ Normalized end:", newEnd.toISOString()); 

    const result = await pool.query(`
        SELECT id, dayoff_start, dayoff_end
        FROM personal_dayoffs
        WHERE position_id = $1
            AND (
                (dayoff_start <= $2 AND dayoff_end >= $3)
            )`
        ,[position_id, newEnd, newStart]
    );

    const dateCount = {};
    const getDayOffDateRange = (s, e) => {
        const range = [];
        const current = new Date(s);
        const endDate = new Date(e);
        
        while (current <= endDate) {
            const formatted = current.toLocaleDateString('sv-SE'); // YYYY-MM-DD
            range.push(formatted);
            current.setDate(current.getDate() + 1);
        }
        return range;
    }
    result.rows.forEach(row => {
        const days = getDayOffDateRange(row.dayoff_start, row.dayoff_end);
        console.log("📅 Existing dayoff range:", days);
        
        days.forEach(date => {
            dateCount[date] = (dateCount[date] || 0) + 1;
        });
    });

   const conflictDates = Object.entries(dateCount)
        .filter(([_, count]) => count >= 2)
        .map(([date]) => date);

    console.log("🚨 Conflict Dates:", conflictDates);
    return conflictDates;
}

async function checkDuplicateDayOffForPerson (start, end, personnel_id) {
    const newStart = new Date(start);
    const newEnd = new Date(end);

    const result = await pool.query(`
        SELECT id, dayoff_start, dayoff_end
        FROM personal_dayoffs
        WHERE personnel_id = $1
        AND (
            (dayoff_start <= $2 AND dayoff_end >= $3)
        )`
        ,[personnel_id, newEnd, newStart])
        
        return result.rows
}

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

        const conflictDates = await checkDayOffConflicts(dayoff_start, dayoff_end, position_id);
        console.log("check conflict date",conflictDates);
        
        const duplicate = await checkDuplicateDayOffForPerson(dayoff_start, dayoff_end, requester_id);

        if (conflictDates.length > 0 && !is_urgent) {
            return res.status(400).json({
                error: position_id === 1 ? "More than 2 MC already request dayoff today, please tick urgent and provide reason" : "More than 2 PD request dayoff today, please tick urgent and provide reason",
                conflictDates
            });
        };

        if (duplicate.length > 0) {
            return res.status(400).json({
                error: "You already have a day off request on this date",
                conflict: duplicate
            });
        };

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
        const {
            requester_id, 
            position_id, 
            dayoff_start, 
            dayoff_end, 
            is_urgent, 
            reason, 
            dayoff_status,
        } = req.body;

        const conflictDates = await checkDayOffConflicts(dayoff_start, dayoff_end, position_id)
        const duplicate = await pool.query(`
            SELECT id
            FROM personal_dayoffs
            WHERE personnel_id = $1
            AND id != $2
            AND(
                (dayoff_start <= $3 AND dayoff_end >= $4) OR
                (dayoff_start <= $4 AND dayoff_end >= $3) OR
                ($3 <= dayoff_start AND $4 >= dayoff_end)
            )`
            ,[requester_id, id, dayoff_end, dayoff_start]
        );

        if (conflictDates.length > 0 && !is_urgent) {
            return res.status(400).json({
                error: position_id === 1 ? "More than 2 MC already request dayoff today" : "More than 2 PD request dayoff today",
                conflictDates
            });
        }

        if (duplicate.rows.length > 0) {
            return res.status(400).json({
                error: "You already have another day off on this date"
            })
        }

        const result = await pool.query(
            `UPDATE personal_dayoffs
                SET 
                    personnel_id = $6,
                    position_id = $7,
                    dayoff_start = $1,
                    dayoff_end   = $2,
                    is_urgent    = $3,
                    reason       = $4,
                    dayoff_status = $8,
                    updated_at   = NOW()
                WHERE id = $5
                RETURNING *`,
            [dayoff_start, dayoff_end, is_urgent, reason, id, requester_id, position_id, dayoff_status]
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
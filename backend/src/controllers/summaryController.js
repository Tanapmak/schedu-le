import pool from "../config/db.js";

// GET api/summary
export async function getSummaryData(req, res) {
    try {
        const { start, end } = req.query;
        console.log("req.query start-end", start, end);
        
        if (!start || !end) {
            return res.status(400).json({ error: "Start and End Date are required"});
        }
        const params = [start, end]

        const totalQuery = await pool.query(
            `SELECT
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM(session_end - session_start))/3600), 0), 0) AS total
            FROM sessions
            WHERE day_type = 'working day'
            AND session_start < $2 AND session_end > $1;`
            ,params
        );

        const totalMcQuery = await pool.query(
            `SELECT
                COALESCE(SUM(mc_total), 0) AS total_mc_hours
            FROM (
                SELECT
                ss.mc_id,
                ROUND(SUM(EXTRACT(EPOCH FROM (session_end - session_start)) / 3600), 0) AS mc_total
                FROM sessions ss
                JOIN rooms r ON ss.room_id = r.id
                WHERE ss.day_type = 'working day'
                AND ss.mc_id IS NOT NULL
                AND r.name NOT ILIKE '%content%'
                AND session_start < $2 AND session_end > $1
                GROUP BY ss.mc_id
            ) AS per_mc;
            `,params
        );

        const totalPdQuery = await pool.query(
            `SELECT
                ROUND(COALESCE(SUM(pd_total), 0), 0) AS total_pd_hours
            FROM (
                SELECT
                ss.pd_id,
                ROUND(SUM(EXTRACT(EPOCH FROM (session_end - session_start)) / 3600), 0) AS pd_total
                FROM sessions ss
                WHERE ss.day_type = 'working day'
                AND ss.pd_id IS NOT NULL
                AND session_start < $2 AND session_end > $1
                GROUP BY ss.pd_id
            ) AS per_pd;
            `, params);

        const roomQuery = await pool.query(
            `SELECT
                r.id, r.name,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM(session_end - session_start))/3600), 0), 0) AS total
            FROM sessions ss
            JOIN rooms r ON ss.room_id = r.id
            WHERE ss.day_type = 'working day'
            AND session_start < $2 AND session_end > $1
            GROUP BY r.id, r.name
            ORDER BY r.name DESC`
            , params
        );

        const mcQuery = await pool.query(
            `SELECT
                psn.id, psn.nickname,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM(session_end - session_start))/3600), 0), 0) AS total
            FROM sessions ss
            JOIN personnels psn ON ss.mc_id = psn.id
            JOIN rooms r ON ss.room_id = r.id
            WHERE ss.day_type = 'working day'
            AND r.name NOT ILIKE '%content%'
            AND session_start < $2 AND session_end > $1
            GROUP BY psn.id, psn.nickname
            ORDER BY psn.nickname DESC`
            , params
        );

        const pdQuery = await pool.query(
            `SELECT
                psn.id, psn.nickname,
                ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM(session_end - session_start))/3600), 0), 0) AS total
            FROM sessions ss
            JOIN personnels psn ON ss.pd_id = psn.id
            JOIN rooms r ON ss.room_id = r.id
            WHERE ss.day_type = 'working day'
            AND r.name NOT ILIKE '%content%'
            AND session_start < $2 AND session_end > $1
            GROUP BY psn.id, psn.nickname
            ORDER BY psn.nickname DESC`
            ,params
        );

        res.json({
            total_hours: totalQuery.rows[0].total,
            total_mc: totalMcQuery.rows[0].total_mc_hours,
            total_pd: totalPdQuery.rows[0].total_pd_hours,
            room_summary: roomQuery.rows,
            mc_summary: mcQuery.rows,
            pd_summary: pdQuery.rows,
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, cannot get sessions" });
    }
}